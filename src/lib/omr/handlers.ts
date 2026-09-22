import { prisma } from "../db";
import { registerJobHandler, PermanentJobError } from "../jobs";
import { saveFile, readFile } from "../storage";
import { randomToken } from "../util";
import { renderPdf } from "./pdf";
import { readPageToken, analyzeWithManifest } from "./analyze";
import type { PrintManifest } from "./layout";

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
    let token = qrToken;
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
    return { status: ok ? "needs_review" : "unrecognized", debug: result.debug };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.scanUpload.update({ where: { id: scanId }, data: { status: "failed", errorCode: msg.slice(0, 100) } });
    throw new PermanentJobError(msg);
  }
});
