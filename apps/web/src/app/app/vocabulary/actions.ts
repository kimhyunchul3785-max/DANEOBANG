"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { assertBook, assertImport } from "@/lib/scope";
import { saveFile } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs";
import { sha256 } from "@/lib/util";
import { FILE_LIMITS } from "@/lib/constants";
import { detectImage, detectFormat, PARSER_ERRORS } from "@/lib/parsers";
import { ocrConfigured } from "@/lib/ocr";
import { applyDaySplit, parseSizes, DEFAULT_SPLIT_DAYS, type SplitMode } from "@/lib/day-split";
import { previewMerge, planMergedDays, type MergeDayMode } from "@/lib/merge-books";
import { redirect } from "next/navigation";
import type { ActionResult } from "../students/actions";
import { purgeExam } from "@/lib/purge";

/** 휴지통으로 — 목록·출제 화면에서 빠진다. 만든 시험·성적은 그대로 */
export async function trashBookAction(bookId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  await prisma.vocabBook.update({ where: { id: bookId }, data: { status: "archived" } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "book.trash", target: bookId, detail: b.title });
  revalidatePath("/app/vocabulary");
  return { ok: true, message: `"${b.title}"을 휴지통으로 옮겼어요.` };
}

export async function restoreBookAction(bookId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  await prisma.vocabBook.update({ where: { id: bookId }, data: { status: "active" } });
  revalidatePath("/app/vocabulary");
  return { ok: true, message: "복원했어요." };
}

/** 영구 삭제 — 휴지통 안에서만. 이 단어장으로 만든 시험과 그 성적·재시험까지 함께 지운다 */
export async function purgeBookAction(bookId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  if (b.status === "active") return { ok: false, message: "휴지통에 있는 단어장만 영구 삭제할 수 있어요." };
  const exams = await prisma.exam.findMany({ where: { bookId, academyId: ctx.member.academyId }, select: { id: true } });
  for (const e of exams) await purgeExam(e.id);
  await prisma.vocabBook.delete({ where: { id: bookId } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "book.purge", target: bookId, detail: `${b.title} · 시험 ${exams.length}` });
  revalidatePath("/app/vocabulary");
  revalidatePath("/app/tests");
  revalidatePath("/app/results");
  return { ok: true, message: `"${b.title}"${exams.length ? `과 시험 ${exams.length}개` : ""}를 영구 삭제했어요.` };
}

/** 예전 이름 호환: 바로 지우지 않고 휴지통으로 */
export async function deleteBookAction(bookId: string): Promise<ActionResult> {
  return trashBookAction(bookId);
}

// ───── 태그 (v5.6 — 예전 "폴더". 한 단어장에 여러 개) ─────
export async function createFolderAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const name = String(form.get("name") ?? "").trim().replace(/^#/, "").slice(0, 30);
  if (!name) return { ok: false, message: "태그 이름을 적어 주세요." };
  const dup = await prisma.bookFolder.findFirst({ where: { academyId: ctx.member.academyId, name } });
  if (dup) return { ok: false, message: "같은 이름의 태그가 있어요." };
  const n = await prisma.bookFolder.count({ where: { academyId: ctx.member.academyId } });
  const f = await prisma.bookFolder.create({ data: { academyId: ctx.member.academyId, name, sortOrder: n } });
  const bookId = String(form.get("bookId") ?? "");
  if (bookId && (await assertBook(ctx, bookId).catch(() => null))) await prisma.vocabBookTag.create({ data: { bookId, tagId: f.id } });
  revalidatePath("/app/vocabulary");
  return { ok: true, message: `#${name} 태그를 만들었어요.`, data: { folderId: f.id } };
}

export async function renameFolderAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const id = String(form.get("folderId") ?? "");
  const name = String(form.get("name") ?? "").trim().replace(/^#/, "").slice(0, 30);
  if (!name) return { ok: false, message: "태그 이름을 적어 주세요." };
  const dup = await prisma.bookFolder.findFirst({ where: { academyId: ctx.member.academyId, name, id: { not: id } } });
  if (dup) return { ok: false, message: "같은 이름의 태그가 있어요." };
  const r = await prisma.bookFolder.updateMany({ where: { id, academyId: ctx.member.academyId }, data: { name } });
  if (!r.count) return { ok: false, message: "권한이 없습니다." };
  revalidatePath("/app/vocabulary");
  return { ok: true, message: "이름을 바꿨어요." };
}

/** 태그만 지운다 — 단어장은 그대로 */
export async function deleteFolderAction(folderId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const f = await prisma.bookFolder.findFirst({ where: { id: folderId, academyId: ctx.member.academyId } });
  if (!f) return { ok: false, message: "권한이 없습니다." };
  await prisma.$transaction([prisma.vocabBook.updateMany({ where: { folderId }, data: { folderId: null } }), prisma.bookFolder.delete({ where: { id: folderId } })]);
  revalidatePath("/app/vocabulary");
  return { ok: true, message: `#${f.name} 태그를 지웠어요. 단어장은 그대로예요.` };
}

/** 단어장에 태그 붙이기/떼기 (여러 개) */
export async function toggleBookTagAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const bookId = String(form.get("bookId") ?? "");
  const tagId = String(form.get("tagId") ?? "");
  const on = String(form.get("on") ?? "") === "1";
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  const t = await prisma.bookFolder.findFirst({ where: { id: tagId, academyId: ctx.member.academyId } });
  if (!t) return { ok: false, message: "없는 태그예요." };
  if (on) await prisma.vocabBookTag.upsert({ where: { bookId_tagId: { bookId, tagId } }, create: { bookId, tagId }, update: {} });
  else await prisma.vocabBookTag.deleteMany({ where: { bookId, tagId } });
  revalidatePath("/app/vocabulary");
  return { ok: true, message: on ? `#${t.name} 태그를 붙였어요.` : `#${t.name} 태그를 뗐어요.` };
}

/** 예전 이름 호환 (e2e · 옛 화면): 폴더 이동 = 태그 하나만 남기기 */
export async function moveBookToFolderAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const bookId = String(form.get("bookId") ?? "");
  const folderId = String(form.get("folderId") ?? "");
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  await prisma.vocabBookTag.deleteMany({ where: { bookId } });
  if (folderId) {
    const f = await prisma.bookFolder.findFirst({ where: { id: folderId, academyId: ctx.member.academyId } });
    if (!f) return { ok: false, message: "없는 태그예요." };
    await prisma.vocabBookTag.create({ data: { bookId, tagId: folderId } });
  }
  revalidatePath("/app/vocabulary");
  return { ok: true };
}

export async function renameBookAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const parsed = z.object({ bookId: z.string(), title: z.string().min(1).max(60), level: z.string().max(20).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "제목을 확인하세요." };
  const b = await assertBook(ctx, parsed.data.bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  await prisma.vocabBook.update({ where: { id: b.id }, data: { title: parsed.data.title.trim(), level: parsed.data.level?.trim() || null } });
  revalidatePath(`/app/vocabulary/${b.id}`);
  revalidatePath("/app/vocabulary");
  return { ok: true, message: "저장했습니다." };
}

/** 파일 업로드 → Import 생성 → 분석·자동 저장 job */
export async function uploadDocumentAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const bookId = String(form.get("bookId") ?? "") || null;
  if (!files.length) return { ok: false, message: "파일을 선택하세요." };
  if (bookId) {
    const b = await assertBook(ctx, bookId).catch(() => null);
    if (!b) return { ok: false, message: "단어장을 찾을 수 없습니다." };
  }
  // 사진 여러 장 → 하나의 업로드(OCR). 문서는 한 번에 하나
  const bufs = await Promise.all(files.map(async (f) => ({ f, buf: Buffer.from(await f.arrayBuffer()) })));
  const fmts = bufs.map(({ f, buf }) => detectFormat(buf, f.name));
  if (fmts.some((x) => x === "image")) {
    if (!fmts.every((x) => x === "image")) return { ok: false, message: "사진은 사진끼리만 올릴 수 있습니다. 문서 파일은 따로 올려주세요." };
    if (!ocrConfigured()) return { ok: false, message: PARSER_ERRORS.ocr_not_configured };
    if (bufs.length > 40) return { ok: false, message: "사진은 한 번에 40장까지 올릴 수 있습니다." };
    if (bufs.some(({ buf }) => buf.length > FILE_LIMITS.imageMaxBytes)) return { ok: false, message: "사진 한 장이 20MB를 초과합니다." };
    const rels: string[] = [];
    for (const { buf } of bufs) rels.push(await saveFile("uploads", ctx.member.academyId, detectImage(buf) ?? "jpg", buf));
    const total = bufs.reduce((s, x) => s + x.buf.length, 0);
    const imp = await prisma.import.create({
      data: { academyId: ctx.member.academyId, bookId, createdById: ctx.user.id, fileName: bufs.length === 1 ? files[0].name : `${files[0].name} 외 ${bufs.length - 1}장`, fileType: "images", filePath: rels[0], fileSize: total, sha256: sha256(Buffer.concat(bufs.map((x) => x.buf))), meta: JSON.stringify({ files: rels, names: files.map((f) => f.name), images: bufs.length }) },
    });
    await enqueueJob("import", imp.id, ctx.member.academyId);
    await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "import.create", target: imp.id, detail: `${bufs.length} images (ocr)` });
    revalidatePath("/app/vocabulary");
    return { ok: true, message: `사진 ${bufs.length}장을 올렸습니다. OCR 로 읽어 단어장을 만듭니다 (병렬 처리, 보통 1분 안).`, data: { id: imp.id } };
  }
  if (files.length > 1) return { ok: false, message: "문서 파일은 한 번에 하나만 올릴 수 있습니다 (사진은 여러 장 가능)." };
  const file = files[0];
  const buf = bufs[0].buf;
  if (file.size > FILE_LIMITS.documentMaxBytes) return { ok: false, message: "파일이 50MB를 초과합니다." };
  const fmt = fmts[0];
  if (fmt === "hwp") return { ok: false, message: PARSER_ERRORS.hwp_not_supported };
  if (fmt === "unknown" || fmt === "zip" || fmt === "image") return { ok: false, message: PARSER_ERRORS.unknown_format };
  // 같은 파일을 "새 단어장"으로 또 올리면 같은 제목의 단어장이 하나 더 생긴다 → 이미 있는 단어장으로 안내 (이어 붙이기는 허용)
  if (!bookId) {
    const dup = await prisma.import.findFirst({ where: { academyId: ctx.member.academyId, sha256: sha256(buf), status: "approved", book: { status: "active" } }, include: { book: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
    if (dup?.book) return { ok: false, message: `같은 파일이 이미 '${dup.book.title}' 단어장으로 저장돼 있어요. 다시 만들려면 그 단어장을 보관한 뒤 올려 주세요.`, data: { existingBookId: dup.book.id } };
  }
  const ext = file.name.split(".").pop() ?? fmt;
  const rel = await saveFile("uploads", ctx.member.academyId, ext, buf);
  const imp = await prisma.import.create({
    data: { academyId: ctx.member.academyId, bookId, createdById: ctx.user.id, fileName: file.name, fileType: fmt, filePath: rel, fileSize: buf.length, sha256: sha256(buf) },
  });
  await enqueueJob("import", imp.id, ctx.member.academyId);
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "import.create", target: imp.id, detail: file.name });
  revalidatePath("/app/vocabulary");
  return { ok: true, message: "업로드했습니다. 분석이 끝나면 단어장이 자동으로 만들어집니다.", data: { id: imp.id } };
}

export async function retryImportAction(importId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const imp = await assertImport(ctx, importId).catch(() => null);
  if (!imp) return { ok: false, message: "권한이 없습니다." };
  await prisma.import.update({ where: { id: importId }, data: { status: "queued", errorCode: null } });
  await enqueueJob("import", imp.id, ctx.member.academyId, {}, `import:${imp.id}:${Date.now()}`);
  revalidatePath(`/app/vocabulary/imports/${importId}`);
  return { ok: true };
}

/** DAY 다시 나누기: 일수(기본 7) · 하루 단어 수 · 지문별 · 문서 표기대로 */
export async function resplitBookAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const parsed = z.object({ bookId: z.string(), mode: z.enum(["days", "perDay", "section", "doc", "custom"]), n: z.coerce.number().int().min(1).max(500).optional(), sizes: z.string().max(2000).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "입력을 확인하세요." };
  const b = await assertBook(ctx, parsed.data.bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  const mode = parsed.data.mode as SplitMode;
  const n = parsed.data.n ?? DEFAULT_SPLIT_DAYS;
  let docDays: (number | null)[] | undefined;
  if (mode === "doc") {
    // 이 단어장을 만든 업로드의 행 순서 = 단어 순서 (단일 업로드로 만든 단어장만)
    const imps = await prisma.import.findMany({ where: { bookId: b.id, status: "approved" }, include: { rows: { orderBy: { seq: "asc" }, select: { dayNo: true } } }, orderBy: { createdAt: "asc" } });
    const wordCount = await prisma.word.count({ where: { bookId: b.id } });
    const rows = imps.flatMap((i) => i.rows);
    if (imps.length !== 1 || rows.length !== wordCount) return { ok: false, message: "문서 DAY 표기는 파일 하나로 만든 단어장에서만 쓸 수 있습니다." };
    if (!rows.some((r) => r.dayNo)) return { ok: false, message: "문서에 DAY 표기가 없습니다." };
    docDays = rows.map((r) => r.dayNo);
  }
  const sizes = mode === "custom" ? parseSizes(parsed.data.sizes ?? "") : undefined;
  if (mode === "custom" && !sizes?.length) return { ok: false, message: "DAY별 단어 수를 쉼표로 적어주세요 (예: 40, 40, 30)." };
  const dist = await applyDaySplit(b.id, mode, n, docDays, sizes);
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "book.resplit", target: b.id, detail: `${mode}:${sizes ? sizes.join("/") : n} → ${dist.length} days` });
  revalidatePath(`/app/vocabulary/${b.id}`);
  revalidatePath("/app/vocabulary");
  return { ok: true, message: `DAY ${dist.length}개로 나눴습니다.`, data: { days: dist.length } };
}

// ───── 단어 편집 (잘못 읽힌 항목은 목록에서 바로 수정·제외) ─────
export async function updateWordAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const parsed = z.object({ wordId: z.string(), english: z.string().min(1).max(80), pos: z.string().max(10).optional(), meaning: z.string().min(1).max(200), synonyms: z.string().max(200).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "입력을 확인하세요." };
  const w = await prisma.word.findUnique({ where: { id: parsed.data.wordId }, include: { book: true } });
  if (!w || w.book.academyId !== ctx.member.academyId) return { ok: false, message: "권한이 없습니다." };
  await prisma.$transaction([
    prisma.wordRevision.create({ data: { wordId: w.id, revision: w.revision, english: w.english, pos: w.pos, meaning: w.meaning, changedBy: ctx.user.id } }),
    prisma.word.update({
      where: { id: w.id },
      data: { english: parsed.data.english.trim(), pos: parsed.data.pos?.trim() || null, meaning: parsed.data.meaning.trim(), synonyms: parsed.data.synonyms?.trim() || null, revision: { increment: 1 } },
    }),
  ]);
  revalidatePath(`/app/vocabulary/${w.bookId}`);
  return { ok: true, message: "수정했습니다. 이미 발행된 시험의 문구·정답은 바뀌지 않습니다." };
}

export async function toggleWordExcludedAction(wordId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const w = await prisma.word.findUnique({ where: { id: wordId }, include: { book: true } });
  if (!w || w.book.academyId !== ctx.member.academyId) return { ok: false, message: "권한이 없습니다." };
  await prisma.word.update({ where: { id: wordId }, data: { excluded: !w.excluded } });
  revalidatePath(`/app/vocabulary/${w.bookId}`);
  return { ok: true };
}

export async function deleteWordAction(wordId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const w = await prisma.word.findUnique({ where: { id: wordId }, include: { book: true, _count: { select: { items: true } } } });
  if (!w || w.book.academyId !== ctx.member.academyId) return { ok: false, message: "권한이 없습니다." };
  if (w._count.items > 0) {
    await prisma.word.update({ where: { id: wordId }, data: { excluded: true } });
    return { ok: true, message: "이미 시험에 사용된 단어라 삭제 대신 출제 제외 처리했습니다." };
  }
  await prisma.word.delete({ where: { id: wordId } });
  revalidatePath(`/app/vocabulary/${w.bookId}`);
  return { ok: true };
}

/**
 * 단어장 병합: 고른 단어장(순서대로)의 단어를 한 단어장으로. 앞에서 이미 나온 표제어(정규화)는 제거.
 * DAY 는 이어 붙이기(앞 단어장 DAY + 뒤 단어장 DAY 번호 이어서) 또는 n일로 다시 나누기. 원본은 그대로 두거나 보관.
 */
export async function mergeBooksAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string } | undefined> {
  const ctx = await requireAcademy();
  const ids = form.getAll("bookIds").map(String).filter(Boolean);
  const parsed = z
    .object({ title: z.string().trim().min(1).max(60), dayMode: z.enum(["append", "resplit"]), days: z.coerce.number().int().min(1).max(200).optional(), folderId: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "제목·DAY 설정을 확인하세요." };
  if (ids.length < 2) return { error: "단어장을 2개 이상 고르세요." };
  if (new Set(ids).size !== ids.length) return { error: "같은 단어장이 두 번 들어 있어요." };
  const { books, kept, dropped } = await previewMerge(ctx.member.academyId, ids);
  if (books.length !== ids.length) return { error: "권한이 없거나 없는 단어장이 있어요." };
  if (!kept.length) return { error: "합칠 단어가 없어요." };
  const { plan, dist } = planMergedDays(kept, ids, parsed.data.dayMode as MergeDayMode, parsed.data.days ?? DEFAULT_SPLIT_DAYS);
  const level = books.map((b) => b.level).find(Boolean) ?? null;
  const created = await prisma.$transaction(async (tx) => {
    // 새 단어장은 원본들의 태그를 모두 물려받고, 원본 id 를 기억한다 (성적의 단어장 필터가 원본 시험까지 포함)
    const book = await tx.vocabBook.create({ data: { academyId: ctx.member.academyId, createdById: ctx.user.id, title: parsed.data.title, level, mergedFrom: JSON.stringify(ids) } });
    const srcTags = await tx.vocabBookTag.findMany({ where: { bookId: { in: ids } }, select: { tagId: true } });
    for (const tagId of new Set(srcTags.map((t) => t.tagId))) await tx.vocabBookTag.create({ data: { bookId: book.id, tagId } });
    const dayIds = new Map<number, string>();
    for (const d of dist) {
      const day = await tx.bookDay.create({ data: { bookId: book.id, dayNo: d.dayNo, label: d.label } });
      dayIds.set(d.dayNo, day.id);
    }
    await tx.word.createMany({
      data: kept.map((w, i) => ({ bookId: book.id, dayId: dayIds.get(plan[i].dayNo)!, english: w.english, pos: w.pos, meaning: w.meaning, synonyms: w.synonyms, section: w.section, approved: w.approved, excluded: w.excluded, sortOrder: i })),
    });
    return book;
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "book.merge", target: created.id, detail: `${ids.join("+")} → ${kept.length} words (${dropped.length} dup dropped), ${dist.length} days, ${parsed.data.dayMode}` });
  revalidatePath("/app/vocabulary");
  redirect(`/app/vocabulary/${created.id}?from=merge`);
}
