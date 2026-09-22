import { prisma } from "../db";
import { registerJobHandler, PermanentJobError } from "../jobs";
import { saveFile, readFile } from "../storage";
import { randomToken } from "../util";
import { renderPdf } from "./pdf";
import { readPageToken, analyzeWithManifest, tokenFromQr } from "./analyze";
import type { PrintManifest } from "./layout";
import type { ItemDetection } from "./analyze";
import { appUrl } from "../oauth";
import { gradeAttempt } from "../grading";
import { writeLog } from "../logger";



// ───── 종이 시험지 렌더 ─────
registerJobHandler("render_print", async ({ resourceId: attemptId }) => {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { assignment: { include: { student: true, exam: { include: { scopes: true, academy: true } }, form: { include: { items: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } } } } } },
  });
  if (!attempt) throw new PermanentJobError("attempt_not_found");
  if (attempt.status !== "in_progress" || attempt.mode !== "paper") throw new PermanentJobError("attempt_not_paper_in_progress");
  const existing = await prisma.printInstance.findFirst({ where: { attemptId, status: "active" } });
  if (existing) return { printInstanceId: existing.id, reused: true };

  const days = await prisma.bookDay.findMany({ where: { id: { in: attempt.assignment.exam.scopes.map((s) => s.dayId) } }, orderBy: { dayNo: "asc" } });
  const tokens = Array.from({ length: 12 }, () => randomToken(12));
  const logo = attempt.assignment.exam.academy.logoPath ? await readFile(attempt.assignment.exam.academy.logoPath).catch(() => null) : null;
  const { pdf, manifest } = await renderPdf({
    kind: "exam",
    logo,
    academyName: attempt.assignment.exam.academy.name,
    title: attempt.assignment.exam.title,
    subtitle: `${attempt.assignment.exam.academy.name} · ${days.map((d) => d.label).join(", ")} · ${attempt.assignment.form.items.length}문항`,
    studentName: attempt.assignment.student.name,
    items: attempt.assignment.form.items.map((it) => ({ itemId: it.id, position: it.position, prompt: it.prompt, options: it.options.map((o) => ({ position: o.position, text: o.text })) })),
    pageTokens: tokens,
    qrUrlBase: `${appUrl()}/q`,
  });
  const rel = await saveFile("pdf", attempt.assignment.exam.academyId, "pdf", pdf);
  const print = await prisma.$transaction(async (tx) => {
    const p = await tx.printInstance.create({ data: { attemptId, formId: attempt.assignment.formId, pdfPath: rel, manifest: JSON.stringify(manifest), templateVersion: manifest.templateVersion } });
    for (const pg of manifest.pages) await tx.printPage.create({ data: { printInstanceId: p.id, pageNo: pg.pageNo, token: pg.token } });
    await tx.usageEvent.create({ data: { academyId: attempt.assignment.exam.academyId, kind: "pdf_render", amount: manifest.pages.length } });
    return p;
  });
  return { printInstanceId: print.id, pages: manifest.pages.length };
});

// ───── 사진 판독 ─────
registerJobHandler("analyze_scan", async ({ resourceId: scanId, payload }) => {
  const scan = await prisma.scanUpload.findUnique({ where: { id: scanId } });
  if (!scan) throw new PermanentJobError("scan_not_found");
  await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "processing" } });
  try {
    const buf = await readFile(scan.filePath);
    const { token: qrToken, gray, qr } = await readPageToken(buf);
    let token = tokenFromQr(qrToken);
    const forcePageId = typeof payload.forcePageId === "string" ? payload.forcePageId : null;
    if (forcePageId) {
      const forced = await prisma.printPage.findUnique({ where: { id: forcePageId } });
      if (forced) token = forced.token;
    }
    if (!token) {
      await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "unrecognized", errorCode: "qr_not_found", detections: "[]", reviewNotes: "QR 코드를 읽지 못했습니다. 시험지 전체가 선명하게 나오도록 다시 촬영하거나, 아래에서 학생·페이지를 직접 지정하세요." } });
      return { status: "unrecognized" };
    }
    const page = await prisma.printPage.findUnique({ where: { token }, include: { print: { include: { attempt: { include: { assignment: { include: { exam: true, student: true } } } } } } } });
    if (!page) {
      await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "unrecognized", errorCode: "unknown_token", reviewNotes: "이 QR 은 등록된 시험지가 아닙니다." } });
      return { status: "unrecognized" };
    }
    if (page.print.attempt.assignment.exam.academyId !== scan.academyId) {
      // 다른 학원의 시험지: 존재 여부를 노출하지 않는다
      await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "unrecognized", errorCode: "unknown_token", reviewNotes: "이 QR 은 등록된 시험지가 아닙니다." } });
      return { status: "unrecognized" };
    }
    if (page.print.status !== "active") {
      await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "unrecognized", pageId: page.id, errorCode: "print_void", reviewNotes: "무효화된(방식 변경/재발급) 시험지입니다. 채점할 수 없습니다." } });
      return { status: "unrecognized" };
    }
    const manifest = JSON.parse(page.print.manifest) as PrintManifest;
    const pm = manifest.pages.find((p) => p.pageNo === page.pageNo);
    if (!pm) throw new PermanentJobError("manifest_page_missing");
    const result = await analyzeWithManifest(gray, qr, pm);
    let correctedPath: string | null = null;
    if (result.corrected) correctedPath = await saveFile("scans-corrected", scan.academyId, "png", result.corrected);
    const ok = result.detections.length > 0;
    await prisma.scanUpload.update({
      where: { id: scanId },
      data: {
        status: ok ? "needs_review" : "unrecognized",
        pageId: page.id,
        detections: JSON.stringify(result.detections),
        correctedPath,
        errorCode: ok ? null : "fiducials_not_found",
        reviewNotes: result.warnings.join("\n") || null,
      },
    });
    await prisma.usageEvent.create({ data: { academyId: scan.academyId, kind: "scan_page", amount: 1 } });
    if (scan.source === "student") {
      const auto = await autoAcceptStudentScan(scanId);
      return { status: auto, debug: result.debug };
    }
    return { status: ok ? "needs_review" : "unrecognized", debug: result.debug };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "failed", errorCode: msg.slice(0, 100) } });
    throw new PermanentJobError(msg);
  }
});

/**
 * 학생이 앱·QR 로 제출한 사진: 선생님 검수 없이 자동 확정.
 * 불확실·복수 마킹은 무응답으로 처리하고, 모든 페이지가 확정되면 채점 후 학생에게 알림을 보낸다.
 * 선생님은 결과 화면에서 정정(재채점)할 수 있다.
 */
export async function autoAcceptStudentScan(scanId: string): Promise<string> {
  const scan = await prisma.scanUpload.findUnique({
    where: { id: scanId },
    include: { page: { include: { print: { include: { attempt: { include: { assignment: { include: { student: true, exam: true, form: { include: { items: { include: { options: true } } } } } } } }, pages: true } } } } },
  });
  if (!scan || !scan.page) {
    if (scan?.uploadedById) await notify(scan.uploadedById, "사진을 인식하지 못했습니다", "시험지 네 모서리와 QR 이 모두 나오도록 다시 촬영해 주세요.", "/learn/paper");
    return "unrecognized";
  }
  const attempt = scan.page.print.attempt;
  const studentUserId = attempt.assignment.student.userId;
  if (!studentUserId || studentUserId !== scan.uploadedById) {
    await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "unrecognized", errorCode: "not_owner", reviewNotes: "본인 시험지가 아닙니다." } });
    await notify(scan.uploadedById, "본인 시험지가 아닙니다", "다른 학생의 시험지는 제출할 수 없습니다.", "/learn/paper");
    return "unrecognized";
  }
  if (scan.status !== "needs_review") {
    await notify(studentUserId, "사진을 인식하지 못했습니다", scan.reviewNotes ?? "시험지 전체가 선명하게 나오도록 다시 촬영해 주세요.", "/learn/paper");
    return scan.status;
  }
  if (attempt.status === "graded") {
    await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "failed", errorCode: "already_graded" } });
    await notify(studentUserId, "이미 채점된 시험입니다", `${attempt.assignment.exam.title} 결과는 내 성적에서 볼 수 있습니다.`, `/learn/results/${attempt.id}`);
    return "already_graded";
  }
  const detections = JSON.parse(scan.detections || "[]") as ItemDetection[];
  const items = attempt.assignment.form.items;
  let uncertain = 0;
  await prisma.$transaction(async (tx) => {
    for (const d of detections) {
      const item = items.find((i) => i.id === d.itemId);
      if (!item) continue;
      const usable = d.status === "single_mark" || d.status === "blank";
      if (!usable) uncertain++;
      const optionId = usable && d.optionPosition ? (item.options.find((o) => o.position === d.optionPosition)?.id ?? null) : null;
      await tx.attemptAnswer.upsert({ where: { attemptId_itemId: { attemptId: attempt.id, itemId: item.id } }, update: { optionId }, create: { attemptId: attempt.id, itemId: item.id, optionId } });
    }
    await tx.scanUpload.updateMany({ where: { pageId: scan.page!.id, id: { not: scanId }, status: { in: ["needs_review", "unrecognized"] } }, data: { status: "failed", errorCode: "superseded" } });
    await tx.scanUpload.update({ where: { id: scanId }, data: { status: "accepted", reviewNotes: [scan.reviewNotes, `학생 제출 자동 확정${uncertain ? ` · 불확실/복수 마킹 ${uncertain}문항은 무응답 처리` : ""}`].filter(Boolean).join("\n") } });
    await tx.attempt.update({ where: { id: attempt.id }, data: { status: "review" } });
  });
  const pages = scan.page.print.pages;
  const accepted = await prisma.scanUpload.findMany({ where: { pageId: { in: pages.map((p) => p.id) }, status: "accepted" }, select: { pageId: true } });
  const acceptedPages = new Set(accepted.map((a) => a.pageId));
  const missing = pages.filter((p) => !acceptedPages.has(p.id)).map((p) => p.pageNo);
  if (missing.length) {
    await notify(studentUserId, `${scan.page.pageNo}페이지 확인 완료`, `아직 ${missing.join(", ")}페이지 사진이 필요합니다.`, "/learn/paper");
    return "page_accepted";
  }
  const r = await gradeAttempt(attempt.id, { reason: "paper_student_submitted", by: null });
  const g = r.grade;
  await notify(studentUserId, `채점 완료 · ${Math.round(g.score)}점 ${g.passed ? "통과" : "재시험"}`, `${attempt.assignment.exam.title} · ${g.correctCount}/${g.totalCount}${g.passed ? "" : " · 틀린 문항을 모아 보세요"}`, `/learn/results/${attempt.id}`);
  writeLog({ kind: "job", academy: scan.academyId, event: "scan:auto_graded", detail: { scanId, attemptId: attempt.id, score: g.score, uncertain } });
  return "graded";
}

async function notify(userId: string, title: string, body: string, link: string) {
  try {
    await prisma.notification.create({ data: { userId, title, body, link } });
  } catch {
    /* 알림 실패는 채점을 막지 않는다 */
  }
}
