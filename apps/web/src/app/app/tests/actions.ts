"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { assertBook, assertExam, assertAttempt, studentScope } from "@/lib/scope";
import { createFormForExam } from "@/lib/exam-gen";
import { gradeAttempt } from "@/lib/grading";
import { enqueueJob } from "@/lib/jobs";
import { parseSeoulLocal } from "@/lib/util";
import type { ActionResult } from "../students/actions";

export async function createExamAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string } | undefined> {
  const ctx = await requireAcademy();
  const parsed = z
    .object({
      title: z.string().max(80).optional(),
      bookId: z.string(),
      questionCount: z.coerce.number().int().min(1).max(200),
      passScore: z.coerce.number().int().min(0).max(100),
      timeLimitMin: z.coerce.number().int().min(0).max(600).optional(),
      secondsPerItem: z.coerce.number().int().min(3).max(60).optional(),
      scoreVisibility: z.enum(["immediate", "after_release"]).optional(),
      answerVisibility: z.enum(["immediate", "after_release"]).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "입력을 확인하세요." };
  const dayIds = form.getAll("dayIds").map(String);
  if (!dayIds.length) return { error: "출제 범위 DAY를 1개 이상 선택하세요." };
  const book = await assertBook(ctx, parsed.data.bookId).catch(() => null);
  if (!book) return { error: "단어장을 찾을 수 없습니다." };
  const validDays = await prisma.bookDay.findMany({ where: { id: { in: dayIds }, bookId: book.id }, orderBy: { dayNo: "asc" } });
  if (validDays.length !== dayIds.length) return { error: "DAY 선택이 올바르지 않습니다." };
  {
    const s = form.get("startAt") === "now" ? new Date() : parseSeoulLocal(form.get("startAt"));
    const e = parseSeoulLocal(form.get("dueAt"));
    if (s && e && e <= s) return { error: "마감이 시작보다 빠르거나 같습니다. 마감을 뒤로 잡아 주세요." };
  }
  const d = parsed.data;
  // 제목 자동: "단어장 DAY 1–3 (9/22)"
  const nos = validDays.map((x) => x.dayNo);
  const range = nos.length === 1 ? `DAY ${nos[0]}` : nos.every((n, i) => i === 0 || n === nos[i - 1] + 1) ? `DAY ${nos[0]}–${nos[nos.length - 1]}` : `DAY ${nos.join(",")}`;
  const now = new Date(Date.now() + 9 * 3600e3);
  const title = (d.title ?? "").trim() || `${book.title} ${range} (${now.getUTCMonth() + 1}/${now.getUTCDate()})`;
  const exam = await prisma.exam.create({
    data: {
      academyId: ctx.member.academyId,
      bookId: book.id,
      createdById: ctx.user.id,
      title: title.slice(0, 80),
      questionCount: d.questionCount,
      passScore: d.passScore,
      timeLimitMin: d.timeLimitMin || null,
      secondsPerItem: d.secondsPerItem ?? 7,
      scoreVisibility: d.scoreVisibility ?? "immediate",
      answerVisibility: d.answerVisibility ?? "immediate",
      scopes: { create: dayIds.map((dayId) => ({ dayId })) },
    },
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.create", target: exam.id });
  let formId: string | null = null;
  try {
    const { form } = await createFormForExam(exam.id);
    formId = form.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.exam.update({ where: { id: exam.id }, data: { status: "draft" } });
    redirect(`/app/tests/${exam.id}?genError=${encodeURIComponent(msg)}`);
  }
  // 한 화면 출제: 즉시 발행 + 반 배정 (여러 반 가능) + 학생 앱 노출
  const publishNow = form.get("publishNow") !== "off";
  const classIds = form.getAll("assignClassIds").map(String).filter(Boolean);
  let assigned = 0;
  if (publishNow && formId) {
    const r = await publishFormAction(formId);
    if (r.ok) {
      for (const classId of classIds) {
        const fd = new FormData();
        fd.set("examId", exam.id);
        fd.set("formId", formId);
        fd.set("classId", classId);
        if (form.get("dueAt")) fd.set("dueAt", String(form.get("dueAt")));
        if (form.get("startAt")) fd.set("startAt", String(form.get("startAt")));
        const a = await assignStudentsAction(fd);
        assigned += a.ok ? Number((a.message ?? "").match(/(\d+)명/)?.[1] ?? 0) : 0;
      }
    }
  }
  redirect(`/app/tests/${exam.id}${publishNow ? `?published=1&assigned=${assigned}` : ""}`);
}

/** 출제 미리보기: 저장하지 않고 범위에서 문항 몇 개를 생성해 보여준다 (교사 화면이므로 정답 표시) */
export async function previewItemsAction(bookId: string, dayIds: string[], count: number, seed: string): Promise<{ ok: boolean; items?: { prompt: string; dayLabel: string; options: { text: string; isCorrect: boolean }[] }[]; total?: number; message?: string }> {
  const ctx = await requireAcademy();
  const book = await assertBook(ctx, bookId).catch(() => null);
  if (!book) return { ok: false, message: "권한이 없습니다." };
  const days = await prisma.bookDay.findMany({ where: { id: { in: dayIds }, bookId: book.id } });
  if (!days.length) return { ok: false, message: "DAY를 선택하세요." };
  try {
    const { generateItems } = await import("@/lib/exam-gen");
    const gen = await generateItems({ dayIds: days.map((d) => d.id), questionCount: Math.max(1, Math.min(count, 6)), seed });
    const total = await prisma.word.count({ where: { dayId: { in: days.map((d) => d.id) }, approved: true, excluded: false } });
    return { ok: true, items: gen.items.map((i) => ({ prompt: i.prompt, dayLabel: i.dayLabel, options: i.options })), total };
  } catch (e) {
    return { ok: false, message: await genErrorMessage(e instanceof Error ? e.message : String(e)) };
  }
}

export async function regenerateFormAction(examId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  try {
    const { gen } = await createFormForExam(examId);
    revalidatePath(`/app/tests/${examId}`);
    return { ok: true, message: `새 초안을 생성했습니다 (${gen.items.length}문항).` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: await genErrorMessage(msg) };
  }
}

export async function genErrorMessage(code: string) {
  if (code === "no_words") return "선택 범위에 출제 가능한 단어가 없습니다.";
  if (code.startsWith("distractor_shortage:")) return `오답 보기 후보가 부족한 단어가 있습니다: ${code.slice(20)}. 범위를 넓히거나 해당 단어를 출제 제외하세요. (범위 밖 뜻을 임의로 넣지 않습니다)`;
  return `출제 실패: ${code}`;
}

export async function publishFormAction(formId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const form = await prisma.examForm.findFirst({ where: { id: formId, exam: { academyId: ctx.member.academyId } }, include: { items: { include: { options: true } }, exam: true } });
  if (!form) return { ok: false, message: "권한이 없습니다." };
  if (form.status === "published") return { ok: false, message: "이미 발행된 버전입니다." };
  // 발행 전 검증: 문항별 보기 4개, 정답 정확히 1개, 보기 중복 없음
  for (const it of form.items) {
    if (it.options.length !== 4) return { ok: false, message: `${it.position}번 문항의 보기가 4개가 아닙니다.` };
    if (it.options.filter((o) => o.isCorrect).length !== 1) return { ok: false, message: `${it.position}번 문항의 정답이 1개가 아닙니다.` };
    if (new Set(it.options.map((o) => o.text.trim())).size !== 4) return { ok: false, message: `${it.position}번 문항에 중복 보기가 있습니다.` };
  }
  await prisma.$transaction([
    prisma.examForm.update({ where: { id: formId }, data: { status: "published", publishedAt: new Date() } }),
    prisma.exam.update({ where: { id: form.examId }, data: { status: "published" } }),
  ]);
  // 재시험이면 대상 학생에게 자동 배정 (기한 = task 기한)
  if (form.exam.isRetake) {
    const tasks = await prisma.retakeTask.findMany({ where: { retakeExamId: form.examId, status: { in: ["pending", "issued"] } } });
    for (const t of tasks) {
      const exists = await prisma.assignment.findUnique({ where: { examId_studentId: { examId: form.examId, studentId: t.studentId } } });
      if (!exists) await prisma.assignment.create({ data: { examId: form.examId, formId, studentId: t.studentId, dueAt: t.dueAt } });
    }
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "form.publish", target: formId });
  revalidatePath(`/app/tests/${form.examId}`);
  return { ok: true, message: `v${form.version} 을 발행했습니다. 이제 학생에게 배정할 수 있습니다.` };
}

export async function updateExamAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const examId = String(form.get("examId") ?? "");
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  const parsed = z.object({ title: z.string().min(1).max(80), answersReleased: z.string().optional(), status: z.enum(["draft", "published", "archived"]).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "입력을 확인하세요." };
  await prisma.exam.update({ where: { id: examId }, data: { title: parsed.data.title, answersReleased: parsed.data.answersReleased === "on", ...(parsed.data.status ? { status: parsed.data.status } : {}) } });
  revalidatePath(`/app/tests/${examId}`);
  return { ok: true, message: "저장했습니다." };
}

export async function releaseAnswersAction(examId: string, released: boolean): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  await prisma.exam.update({ where: { id: examId }, data: { answersReleased: released } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.release_answers", target: examId, detail: String(released) });
  revalidatePath(`/app/tests/${examId}`);
  return { ok: true, message: released ? "정답·오답노트를 학생에게 공개했습니다." : "정답 공개를 취소했습니다." };
}

/** 학생 배정 */
export async function assignStudentsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const examId = String(form.get("examId") ?? "");
  const formId = String(form.get("formId") ?? "");
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  const f = await prisma.examForm.findFirst({ where: { id: formId, examId, status: "published" } });
  if (!f) return { ok: false, message: "발행된 버전을 선택하세요." };
  let studentIds = form.getAll("studentIds").map(String);
  const classId = String(form.get("classId") ?? "");
  if (classId) {
    const cs = await prisma.student.findMany({ where: { ...studentScope(ctx), classId, status: "active" }, select: { id: true } });
    if (!cs.length && !studentIds.length) return { ok: false, message: ctx.isOwner ? "이 반에 활성 학생이 없어요." : "이 반에는 내 담당 학생이 없어요. 담당이 아닌 학생은 학원장이 추가할 수 있어요." };
    studentIds = [...new Set([...studentIds, ...cs.map((s) => s.id)])];
  }
  if (!studentIds.length) return { ok: false, message: "학생을 선택하세요." };
  const allowed = await prisma.student.findMany({ where: { ...studentScope(ctx), id: { in: studentIds } }, select: { id: true } });
  // 시작 "now" = 배정하는 순간(서버 시각). 비우면 제한 없음(바로 응시 가능)
  const startAt = form.get("startAt") === "now" ? new Date() : parseSeoulLocal(form.get("startAt"));
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  if (startAt && dueAt && dueAt <= startAt) return { ok: false, message: "마감이 시작보다 빠르거나 같습니다. 마감을 뒤로 잡아 주세요." };
  let n = 0;
  for (const s of allowed) {
    const exists = await prisma.assignment.findUnique({ where: { examId_studentId: { examId, studentId: s.id } } });
    if (exists) continue;
    await prisma.assignment.create({ data: { examId, formId, studentId: s.id, startAt, dueAt } });
    n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.assign", target: examId, detail: `${n}명` });
  revalidatePath(`/app/tests/${examId}`);
  return { ok: true, message: `${n}명에게 배정했습니다.${allowed.length - n > 0 ? ` (이미 배정된 ${allowed.length - n}명 제외)` : ""}` };
}

export async function updateAssignmentAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const id = String(form.get("assignmentId") ?? "");
  const a = await prisma.assignment.findFirst({ where: { id, exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } });
  if (!a) return { ok: false, message: "권한이 없습니다." };
  const op = String(form.get("op") ?? "");
  if (op === "remove") {
    if (a.status === "completed") return { ok: false, message: "완료된 배정은 삭제할 수 없습니다." };
    await prisma.assignment.delete({ where: { id } });
  } else if (op === "reset_mode") {
    // 방식 변경: 기존 종이 코드·미완료 응시 무효화
    await prisma.$transaction([
      prisma.printInstance.updateMany({ where: { attempt: { assignmentId: id } }, data: { status: "void" } }),
      prisma.attempt.updateMany({ where: { assignmentId: id, status: { in: ["in_progress", "review"] } }, data: { status: "void" } }),
      prisma.assignment.update({ where: { id }, data: { mode: null, status: "assigned" } }),
    ]);
    await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "assignment.reset_mode", target: id });
  } else if (op === "due") {
    const dueAt = parseSeoulLocal(form.get("dueAt"));
    await prisma.assignment.update({ where: { id }, data: { dueAt } });
  }
  revalidatePath(`/app/tests/${a.examId}`);
  return { ok: true };
}

/** 마감기한 일괄 변경: 이 시험의 안 친(assigned·in_progress) 배정 전부 또는 기한 경과분만 */
export async function updateExamDueAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const examId = String(form.get("examId") ?? "");
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  const scope = String(form.get("scope") ?? "open"); // open | overdue | all
  const where = {
    examId,
    student: studentScope(ctx),
    ...(scope === "all" ? {} : { status: { in: ["assigned", "in_progress"] } }),
    ...(scope === "overdue" ? { dueAt: { lt: new Date() } } : {}),
  };
  const r = await prisma.assignment.updateMany({ where, data: { dueAt } });
  // 진행 중 응시의 마감(deadlineAt)도 함께 (온라인은 단어당 시간으로 별도 계산되지만 상한은 마감)
  await prisma.attempt.updateMany({ where: { assignment: where, status: "in_progress" }, data: { deadlineAt: dueAt } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.due", target: examId, detail: `${scope} → ${dueAt?.toISOString() ?? "none"} (${r.count})` });
  revalidatePath(`/app/tests/${examId}`);
  revalidatePath("/app/results");
  revalidatePath("/app");
  return { ok: true, message: dueAt ? `${r.count}명의 마감을 ${dueAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 로 바꿨습니다.` : `${r.count}명의 마감을 없앴습니다.` };
}

/** 종이 시험지 발급 (학생별 PDF + manifest) */
export async function printAssignmentsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const examId = String(form.get("examId") ?? "");
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  const ids = form.getAll("assignmentIds").map(String);
  const assignments = await prisma.assignment.findMany({ where: { id: { in: ids }, examId, student: studentScope(ctx) }, include: { attempts: { orderBy: { attemptNo: "desc" } } } });
  if (!assignments.length) return { ok: false, message: "학생을 선택하세요." };
  let n = 0;
  let skipped = 0;
  for (const a of assignments) {
    if (a.mode === "online") {
      skipped++;
      continue;
    }
    if (a.status === "completed") {
      skipped++;
      continue;
    }
    let attempt = a.attempts.find((t) => t.status === "in_progress" && t.mode === "paper");
    if (!attempt) {
      attempt = await prisma.attempt.create({ data: { assignmentId: a.id, attemptNo: a.attempts.length + 1, mode: "paper", deadlineAt: a.dueAt } });
      await prisma.assignment.update({ where: { id: a.id }, data: { mode: "paper", status: "in_progress" } });
    }
    const active = await prisma.printInstance.findFirst({ where: { attemptId: attempt.id, status: "active" } });
    if (active) {
      skipped++;
      continue; // 재출력은 기존 PDF 사용
    }
    await enqueueJob("render_print", attempt.id, ctx.member.academyId, {}, `render_print:${attempt.id}:${Date.now()}`);
    n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "print.issue", target: examId, detail: `${n}명` });
  revalidatePath(`/app/tests/${examId}`);
  return { ok: true, message: `${n}명의 시험지를 생성 중입니다.${skipped ? ` (${skipped}명은 온라인 응시/완료/기발급이라 제외 — 재출력은 목록의 PDF 링크)` : ""}` };
}

/** 채점 정정: 특정 문항 정답 인정/불인정 후 재채점 */
export async function regradeAttemptAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const attemptId = String(form.get("attemptId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "정정 사유를 입력하세요." };
  const t = await assertAttempt(ctx, attemptId).catch(() => null);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  const r = await gradeAttempt(attemptId, { reason: `regrade: ${reason}`, by: ctx.user.id, force: true });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "attempt.regrade", target: attemptId, detail: reason });
  revalidatePath(`/app/results/${attemptId}`);
  return { ok: true, message: `재채점했습니다 (rev ${r.grade.revisionNo}, ${Math.round(r.grade.score)}점).` };
}

/** 문항 정답 키 정정: 새 form 이 아닌 동일 form 의 정답을 바꾸고 관련 응시 전체 재채점 */
export async function fixAnswerKeyAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const itemId = String(form.get("itemId") ?? "");
  const optionId = String(form.get("optionId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "정정 사유를 입력하세요." };
  const item = await prisma.formItem.findFirst({ where: { id: itemId, form: { exam: { academyId: ctx.member.academyId } } }, include: { options: true, form: true } });
  if (!item) return { ok: false, message: "권한이 없습니다." };
  if (!item.options.some((o) => o.id === optionId)) return { ok: false, message: "보기가 올바르지 않습니다." };
  await prisma.$transaction([
    prisma.formOption.updateMany({ where: { itemId }, data: { isCorrect: false } }),
    prisma.formOption.update({ where: { id: optionId }, data: { isCorrect: true } }),
  ]);
  const attempts = await prisma.attempt.findMany({ where: { assignment: { formId: item.formId }, status: "graded" }, select: { id: true } });
  for (const a of attempts) await gradeAttempt(a.id, { reason: `answer_key_fix: ${reason}`, by: ctx.user.id, force: true });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "form.fix_key", target: itemId, detail: reason });
  revalidatePath(`/app/tests/${item.form.examId}`);
  return { ok: true, message: `정답을 정정하고 ${attempts.length}개 응시를 재채점했습니다.` };
}

export async function voidAttemptAction(attemptId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const t = await assertAttempt(ctx, attemptId).catch(() => null);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  await prisma.$transaction([
    prisma.attempt.update({ where: { id: attemptId }, data: { status: "void" } }),
    prisma.gradeRevision.updateMany({ where: { attemptId }, data: { current: false } }),
    prisma.retakeTask.updateMany({ where: { sourceAttemptId: attemptId }, data: { status: "cancelled" } }),
    prisma.assignment.update({ where: { id: t.assignmentId }, data: { status: "assigned", mode: null } }),
  ]);
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "attempt.void", target: attemptId });
  revalidatePath(`/app/results/${attemptId}`);
  return { ok: true, message: "응시를 무효 처리했습니다. 과거 채점 기록은 보존됩니다." };
}
