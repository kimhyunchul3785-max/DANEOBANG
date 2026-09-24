"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { saveFile } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs";
import { sha256, parseJSON } from "@/lib/util";
import { FILE_LIMITS } from "@/lib/constants";
import { gradeAttempt } from "@/lib/grading";
import type { ItemDetection } from "@/lib/omr/analyze";
import type { ActionResult } from "@/app/app/students/actions";

const IMAGE_MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "jpg"],
  [[0x89, 0x50, 0x4e, 0x47], "png"],
  [[0x52, 0x49, 0x46, 0x46], "webp"],
];

export async function uploadScansAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "사진을 선택하세요." };
  let n = 0;
  const skipped: string[] = [];
  for (const file of files.slice(0, 50)) {
    if (file.size > FILE_LIMITS.imageMaxBytes) {
      skipped.push(`${file.name}: 20MB 초과`);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = IMAGE_MAGIC.find(([m]) => m.every((b, i) => buf[i] === b))?.[1];
    if (!kind) {
      skipped.push(`${file.name}: JPG/PNG/WebP만 지원 (HEIC는 JPG로 변환 후 업로드)`);
      continue;
    }
    const hash = sha256(buf);
    const dup = await prisma.scanUpload.findFirst({ where: { academyId: ctx.member.academyId, sha256: hash } });
    if (dup) {
      skipped.push(`${file.name}: 이미 업로드된 동일 파일`);
      continue;
    }
    const rel = await saveFile("scans", ctx.member.academyId, kind, buf);
    const scan = await prisma.scanUpload.create({ data: { academyId: ctx.member.academyId, uploadedById: ctx.user.id, filePath: rel, fileName: file.name, sha256: hash } });
    await enqueueJob("analyze_scan", scan.id, ctx.member.academyId);
    n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "scan.upload", detail: `${n}장` });
  revalidatePath("/app/tests/scans");
  return { ok: n > 0 || skipped.length === 0, message: `${n}장 업로드 · 판독 중${skipped.length ? `\n제외: ${skipped.join(" / ")}` : ""}` };
}

async function ownScan(ctx: Awaited<ReturnType<typeof requireAcademy>>, scanId: string) {
  return prisma.scanUpload.findFirst({
    where: { id: scanId, academyId: ctx.member.academyId },
    include: { page: { include: { print: { include: { attempt: { include: { assignment: { include: { student: true, form: { include: { items: { include: { options: true } } } } } } } }, pages: true } } } } },
  });
}

/** 판독 결과 수정 (문항별 보기 선택/무응답) */
export async function reviewScanItemAction(scanId: string, position: number, optionPosition: number | null): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const scan = await ownScan(ctx, scanId);
  if (!scan) return { ok: false, message: "권한이 없습니다." };
  if (scan.status === "accepted") return { ok: false, message: "이미 확정된 페이지입니다." };
  const reviewed = parseJSON<Record<string, number | null>>(scan.reviewed, {});
  reviewed[String(position)] = optionPosition;
  await prisma.scanUpload.update({ where: { id: scanId }, data: { reviewed: JSON.stringify(reviewed) } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "scan.review_item", target: scanId, detail: `#${position} → ${optionPosition ?? "blank"}` });
  revalidatePath(`/app/tests/scans/${scanId}`);
  return { ok: true };
}

/** QR 실패 시 학생·페이지 수동 지정 후 재판독 */
export async function assignScanPageAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const scanId = String(form.get("scanId") ?? "");
  const pageId = String(form.get("pageId") ?? "");
  const scan = await prisma.scanUpload.findFirst({ where: { id: scanId, academyId: ctx.member.academyId } });
  if (!scan) return { ok: false, message: "권한이 없습니다." };
  const page = await prisma.printPage.findFirst({ where: { id: pageId, print: { status: "active", attempt: { assignment: { exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } } } } });
  if (!page) return { ok: false, message: "페이지를 찾을 수 없습니다." };
  await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "queued", errorCode: null } });
  await enqueueJob("analyze_scan", scanId, ctx.member.academyId, { forcePageId: page.id }, `analyze_scan:${scanId}:${Date.now()}`);
  revalidatePath(`/app/tests/scans/${scanId}`);
  return { ok: true, message: "지정한 페이지 기준으로 다시 판독합니다 (기준점 검증은 그대로 통과해야 합니다)." };
}

export async function rejectScanAction(scanId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const scan = await prisma.scanUpload.findFirst({ where: { id: scanId, academyId: ctx.member.academyId } });
  if (!scan) return { ok: false, message: "권한이 없습니다." };
  if (scan.status === "accepted") return { ok: false, message: "확정된 페이지는 삭제할 수 없습니다." };
  await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "failed", errorCode: "rejected_by_teacher" } });
  revalidatePath("/app/tests/scans");
  return { ok: true };
}

/** 페이지 확정 → 모든 페이지가 확정되면 공통 채점 */
export async function acceptScanAction(scanId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const scan = await ownScan(ctx, scanId);
  if (!scan || !scan.page) return { ok: false, message: "식별된 시험지 페이지가 없습니다." };
  if (scan.status === "accepted") return { ok: false, message: "이미 확정된 페이지입니다." };
  const attempt = scan.page.print.attempt;
  const allowed = await prisma.student.findFirst({ where: { id: attempt.assignment.studentId, ...studentScope(ctx) } });
  if (!allowed) return { ok: false, message: "담당 학생이 아닙니다." };
  if (attempt.status === "graded") return { ok: false, message: "이미 채점이 확정된 응시입니다. 정정은 결과 화면에서 하세요." };
  const detections = parseJSON<ItemDetection[]>(scan.detections, []);
  const reviewed = parseJSON<Record<string, number | null>>(scan.reviewed, {});
  const unresolved = detections.filter((d) => !(String(d.position) in reviewed) && d.status !== "single_mark" && d.status !== "blank");
  if (unresolved.length) return { ok: false, message: `확인이 필요한 문항이 ${unresolved.length}개 있습니다 (복수 마킹/불확실). 각 문항의 답을 지정하세요.` };

  // 이 페이지 답안을 attempt_answers 에 반영
  const items = attempt.assignment.form.items;
  await prisma.$transaction(async (tx) => {
    for (const d of detections) {
      const item = items.find((i) => i.id === d.itemId);
      if (!item) continue;
      const optPos = String(d.position) in reviewed ? reviewed[String(d.position)] : d.optionPosition;
      const optionId = optPos ? (item.options.find((o) => o.position === optPos)?.id ?? null) : null;
      await tx.attemptAnswer.upsert({ where: { attemptId_itemId: { attemptId: attempt.id, itemId: item.id } }, update: { optionId }, create: { attemptId: attempt.id, itemId: item.id, optionId } });
    }
    // 같은 페이지의 다른 업로드는 이 확정으로 대체 (중복 성적 방지)
    await tx.scanUpload.updateMany({ where: { pageId: scan.page!.id, id: { not: scanId }, status: { in: ["needs_review", "unrecognized"] } }, data: { status: "failed", errorCode: "superseded" } });
    await tx.scanUpload.update({ where: { id: scanId }, data: { status: "accepted" } });
    await tx.attempt.update({ where: { id: attempt.id }, data: { status: "review" } });
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "scan.accept", target: scanId });

  // 모든 페이지 확정 여부
  const pages = scan.page.print.pages;
  const accepted = await prisma.scanUpload.findMany({ where: { pageId: { in: pages.map((p) => p.id) }, status: "accepted" }, select: { pageId: true } });
  const acceptedPages = new Set(accepted.map((a) => a.pageId));
  const missing = pages.filter((p) => !acceptedPages.has(p.id)).map((p) => p.pageNo);
  const next = await prisma.scanUpload.findFirst({ where: { academyId: ctx.member.academyId, status: "needs_review", id: { not: scanId } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (missing.length) {
    revalidatePath("/app/tests/scans");
    return { ok: true, message: `페이지 확정. 아직 확정되지 않은 페이지: ${missing.join(", ")} — 모든 페이지가 확정되면 성적이 확정됩니다.`, data: { nextId: next?.id ?? null } };
  }
  const r = await gradeAttempt(attempt.id, { reason: "paper_finalized", by: ctx.user.id });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "attempt.finalize_offline", target: attempt.id });
  revalidatePath("/app/tests/scans");
  return { ok: true, message: `성적 확정: ${attempt.assignment.student.name} ${Math.round(r.grade.score)}점 (${r.grade.correctCount}/${r.grade.totalCount}) ${r.grade.passed ? "통과" : "재시험 대상"}${next ? " → 다음 검수로 이동" : ""}`, data: { nextId: next?.id ?? null } };
}
