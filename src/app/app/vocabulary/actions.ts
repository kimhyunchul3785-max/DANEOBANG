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
import type { ActionResult } from "../students/actions";

export async function archiveBookAction(bookId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const b = await assertBook(ctx, bookId).catch(() => null);
  if (!b) return { ok: false, message: "권한이 없습니다." };
  await prisma.vocabBook.update({ where: { id: bookId }, data: { status: b.status === "active" ? "archived" : "active" } });
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
  revalidatePath(`/app/imports/${importId}`);
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
