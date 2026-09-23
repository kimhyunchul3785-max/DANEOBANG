import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAcademyContext, getCurrentUser } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { readFile } from "@/lib/storage";
import { renderPdf } from "@/lib/omr/pdf";
import { buildWrongNote } from "@/lib/wrong-note";

const NO_STORE = { "Cache-Control": "private, no-store" };

function pdfResponse(buf: Buffer, name: string) {
  return new NextResponse(new Uint8Array(buf), { headers: { ...NO_STORE, "content-type": "application/pdf", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}` } });
}

/** 파일 접근은 항상 소속·목적을 검사한다. URL 만으로는 열람 권한이 없다. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getAcademyContext();

  if (kind === "logo") {
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const a = await prisma.academy.findUnique({ where: { id: ctx.member.academyId }, select: { logoPath: true } });
    if (!a?.logoPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const buf = await readFile(a.logoPath);
    return new NextResponse(new Uint8Array(buf), { headers: { ...NO_STORE, "content-type": "image/png" } });
  }
  if (kind === "print") {
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const p = await prisma.printInstance.findFirst({ where: { id, attempt: { assignment: { exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } } }, include: { attempt: { include: { assignment: { include: { student: true, exam: true } } } } } });
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const buf = await readFile(p.pdfPath);
    return pdfResponse(buf, `${p.attempt.assignment.exam.title}_${p.attempt.assignment.student.name}.pdf`);
  }
  if (kind === "print-zip") {
    // id = examId. 이 시험의 활성 종이 시험지 PDF 전부(학생별 QR 다름)를 zip 으로
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const prints = await prisma.printInstance.findMany({
      where: { status: "active", attempt: { assignment: { examId: id, exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } } },
      include: { attempt: { include: { assignment: { include: { student: { include: { classRoom: true } }, exam: { select: { title: true } } } } } } },
      orderBy: { createdAt: "asc" },
    });
    if (!prints.length) return NextResponse.json({ error: "not_found", message: "발급된 시험지가 없습니다." }, { status: 404 });
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const safe = (t: string) => t.replace(/[\\/:*?"<>|]+/g, " ").trim();
    const title = safe(prints[0].attempt.assignment.exam.title);
    const seen = new Map<string, number>();
    for (const p of prints) {
      const st = p.attempt.assignment.student;
      let name = `${st.classRoom?.name ? safe(st.classRoom.name) + "_" : ""}${safe(st.name)}`;
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 1) name += `_${n}`;
      zip.file(`${name}_${title}.pdf`, await readFile(p.pdfPath));
    }
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await prisma.auditLog.create({ data: { academyId: ctx.member.academyId, userId: user.id, action: "file.print_zip", target: id, detail: `${prints.length} pdf` } });
    return new NextResponse(new Uint8Array(buf), { headers: { ...NO_STORE, "content-type": "application/zip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${title}_시험지_${prints.length}명.zip`)}` } });
  }
  if (kind === "answer-key") {
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const form = await prisma.examForm.findFirst({ where: { id, exam: { academyId: ctx.member.academyId } }, include: { exam: { include: { scopes: true, academy: true } }, items: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } } });
    if (!form) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const days = await prisma.bookDay.findMany({ where: { id: { in: form.exam.scopes.map((s) => s.dayId) } }, orderBy: { dayNo: "asc" } });
    const logo = form.exam.academy.logoPath ? await readFile(form.exam.academy.logoPath).catch(() => null) : null;
    const { pdf } = await renderPdf({ kind: "answer_key", logo, academyName: form.exam.academy.name, title: `${form.exam.title} (정답지 v${form.version})`, subtitle: days.map((d) => d.label).join(", "), studentName: "교사용", items: form.items.map((it) => ({ itemId: it.id, position: it.position, prompt: it.prompt, options: it.options.map((o) => ({ position: o.position, text: o.text, isCorrect: o.isCorrect })) })) });
    await prisma.auditLog.create({ data: { academyId: ctx.member.academyId, userId: user.id, action: "file.answer_key", target: form.id } });
    return pdfResponse(pdf, `${form.exam.title}_정답지.pdf`);
  }
  if (kind === "scan" || kind === "scan-corrected") {
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const s = await prisma.scanUpload.findFirst({ where: { id, academyId: ctx.member.academyId } });
    if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rel = kind === "scan" ? s.filePath : s.correctedPath;
    if (!rel) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const buf = await readFile(rel);
    const ext = rel.split(".").pop();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), { headers: { ...NO_STORE, "content-type": type } });
  }
  if (kind === "wrong-note") {
    // id = attemptId. 교사(담당) 또는 학생 본인(정답 공개 후)
    const scopeParam = req.nextUrl.searchParams.get("scope") ?? "attempt"; // attempt | cumulative
    const attempt = await prisma.attempt.findUnique({ where: { id }, include: { assignment: { include: { exam: true, student: true } } } });
    if (!attempt) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const isTeacher = !!ctx && attempt.assignment.exam.academyId === ctx.member.academyId && !!(await prisma.student.findFirst({ where: { id: attempt.assignment.studentId, ...studentScope(ctx) } }));
    const isStudent = attempt.assignment.student.userId === user.id;
    if (!isTeacher && !isStudent) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (isStudent && !isTeacher) {
      const ex = attempt.assignment.exam;
      if (!(ex.answerVisibility === "immediate" || ex.answersReleased)) return NextResponse.json({ error: "answers_not_released" }, { status: 403 });
    }
    const built = await buildWrongNote(attempt.id, scopeParam === "cumulative" ? "cumulative" : "attempt");
    if (!built) return NextResponse.json({ error: "no_grade" }, { status: 409 });
    const academy = await prisma.academy.findUnique({ where: { id: attempt.assignment.exam.academyId }, select: { name: true, logoPath: true } });
    const logo = academy?.logoPath ? await readFile(academy.logoPath).catch(() => null) : null;
    const { pdf } = await renderPdf({ ...built, logo, academyName: academy?.name });
    return pdfResponse(pdf, `오답노트_${attempt.assignment.student.name}.pdf`);
  }
  return NextResponse.json({ error: "unknown_kind" }, { status: 404 });
}
