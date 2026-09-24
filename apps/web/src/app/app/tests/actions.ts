"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { assertBook, assertExam, assertAttempt, studentScope } from "@/lib/scope";
import { createFormForExam } from "@/lib/exam-gen";
import { gradeAttempt } from "@/lib/grading";
import { enqueueJob, scheduleJob } from "@/lib/jobs";
import { parseSeoulLocal, fmtMDHM } from "@/lib/util";
import { notifyUser } from "@/lib/notify";
import { purgeExam } from "@/lib/purge";
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
  // 출제(발행)는 대상이 있어야 한다 — 대상 없는 시험(0/0)이 생기지 않게. 초안은 예외.
  const publishNow = form.get("publishNow") !== "off";
  const classIds = form.getAll("assignClassIds").map(String).filter(Boolean);
  if (publishNow && classIds.length === 0) return { error: "대상 반을 골라야 출제할 수 있어요. 대상 없이 두려면 [초안만 저장]." };
  // 제목 자동: "단어장 DAY 1–3 (9/22)" — 같은 이름이 이미 있으면 "(9/22 · 2차)" 처럼 차수를 붙인다
  const nos = validDays.map((x) => x.dayNo);
  const range = nos.length === 1 ? `DAY ${nos[0]}` : nos.every((n, i) => i === 0 || n === nos[i - 1] + 1) ? `DAY ${nos[0]}–${nos[nos.length - 1]}` : `DAY ${nos.join(",")}`;
  const now = new Date(Date.now() + 9 * 3600e3);
  const custom = (d.title ?? "").trim();
  let title = custom || `${book.title} ${range} (${now.getUTCMonth() + 1}/${now.getUTCDate()})`;
  if (!custom) {
    const base = `${book.title} ${range} (${now.getUTCMonth() + 1}/${now.getUTCDate()}`;
    const same = await prisma.exam.count({ where: { academyId: ctx.member.academyId, title: { startsWith: base } } });
    if (same > 0) title = `${base} · ${same + 1}차)`;
  }
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
    revalidatePath(`/app/tests/${examId}`, "layout");
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
  revalidatePath(`/app/tests/${form.examId}`, "layout");
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
  revalidatePath(`/app/tests/${examId}`, "layout");
  return { ok: true, message: "저장했습니다." };
}

export async function releaseAnswersAction(examId: string, released: boolean): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  await prisma.exam.update({ where: { id: examId }, data: { answersReleased: released } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.release_answers", target: examId, detail: String(released) });
  let notified = 0;
  if (released && !exam.answersReleased) {
    // 공개를 기다리던 학생(제출 완료)에게 알림
    const { notifyUser, pushToUsers } = await import("@/lib/notify");
    const done = await prisma.assignment.findMany({ where: { examId, status: "completed" }, select: { student: { select: { userId: true } }, attempts: { where: { status: "graded" }, orderBy: { attemptNo: "desc" }, take: 1, select: { id: true } } } });
    const what = exam.scoreVisibility === "after_release" ? "점수와 정답" : "정답·오답노트";
    const users: string[] = [];
    for (const a of done) {
      const uid = a.student.userId;
      if (!uid) continue;
      users.push(uid);
      await notifyUser(uid, `${what}이 공개됐어요`, exam.title, a.attempts[0] ? `/learn/results/${a.attempts[0].id}` : "/learn/grades");
      notified++;
    }
    await pushToUsers([...new Set(users)], { title: `${what}이 공개됐어요`, body: exam.title, data: { link: "/learn/grades" } });
  }
  revalidatePath(`/app/tests/${examId}`, "layout");
  return { ok: true, message: released ? `학생에게 공개했습니다.${notified ? ` ${notified}명에게 알림을 보냈어요.` : ""}` : "공개를 취소했습니다." };
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
  const classIds = form.getAll("classId").map(String).filter(Boolean);
  if (classIds.length) {
    const cs = await prisma.student.findMany({ where: { ...studentScope(ctx), classId: { in: classIds }, status: "active" }, select: { id: true } });
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
  const notifyIds: string[] = [];
  for (const s of allowed) {
    const exists = await prisma.assignment.findUnique({ where: { examId_studentId: { examId, studentId: s.id } } });
    if (exists) continue;
    const a = await prisma.assignment.create({ data: { examId, formId, studentId: s.id, startAt, dueAt }, select: { student: { select: { userId: true } } } });
    if (a.student.userId) notifyIds.push(a.student.userId);
    n++;
  }
  // 바로 시작하는 출제는 지금 알림 (예약 시작은 아래 notify_start 작업이 그 시각에)
  if (n > 0 && !(startAt && startAt.getTime() > Date.now() + 30 * 1000)) {
    for (const uid of notifyIds) await notifyUser(uid, "새 시험이 나왔어요", `${exam.title}${dueAt ? ` · ${fmtMDHM(dueAt)}까지` : ""}`, "/learn");
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.assign", target: examId, detail: `${n}명` });
  // 예약 시작이면 그 시각에 학생에게 "시험이 시작됐어요" 알림 (종 + 앱 푸시)
  if (n > 0 && startAt && startAt.getTime() > Date.now() + 30 * 1000) {
    await scheduleJob("notify_start", examId, ctx.member.academyId, startAt, { startAt: startAt.toISOString() }, `notify_start:${examId}:${startAt.toISOString()}`);
  }
  revalidatePath(`/app/tests/${examId}`, "layout");
  if (n === 0) return { ok: false, message: allowed.length ? "고른 학생은 모두 이미 대상이에요." : "학생을 선택하세요." };
  return { ok: true, message: `${n}명에게 출제했어요.${startAt && startAt.getTime() > Date.now() + 30 * 1000 ? " 시작 시각에 학생에게 알림이 가요." : " 학생 앱에 바로 보여요."}`, data: { issued: n } };
}

/** 대상에서 제외 (버튼용) */
export async function removeAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const fd = new FormData();
  fd.set("assignmentId", assignmentId);
  fd.set("op", "remove");
  const r = await updateAssignmentAction(fd);
  return r.ok ? { ok: true, message: "대상에서 뺐어요." } : r;
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
  revalidatePath(`/app/tests/${a.examId}`, "layout");
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
  if (dueAt && dueAt.getTime() <= Date.now()) return { ok: false, message: "마감은 지금보다 뒤여야 해요." };
  const targets = await prisma.assignment.findMany({ where, select: { student: { select: { userId: true } } } });
  const r = await prisma.assignment.updateMany({ where, data: { dueAt } });
  // 진행 중 응시의 마감(deadlineAt)도 함께 (온라인은 단어당 시간으로 별도 계산되지만 상한은 마감)
  await prisma.attempt.updateMany({ where: { assignment: where, status: "in_progress" }, data: { deadlineAt: dueAt } });
  for (const t of targets) if (t.student.userId) await notifyUser(t.student.userId, "시험 마감이 바뀌었어요", `${exam.title} · ${dueAt ? `${fmtMDHM(dueAt)}까지` : "마감 없음"}`, "/learn");
  revalidatePath("/app/tests");
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.due", target: examId, detail: `${scope} → ${dueAt?.toISOString() ?? "none"} (${r.count})` });
  revalidatePath(`/app/tests/${examId}`, "layout");
  revalidatePath("/app/results");
  revalidatePath("/app");
  return { ok: true, message: dueAt ? `${r.count}명의 마감을 ${fmtMDHM(dueAt)}로 바꿨어요. 학생에게 알림을 보냈어요.` : `${r.count}명의 마감을 없앴어요.` };
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
  revalidatePath(`/app/tests/${examId}`, "layout");
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
  revalidatePath(`/app/tests/${item.form.examId}`, "layout");
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

/** 한 학생의 마감 늘리기 (미응시·기한 경과에서): 마감을 바꾸면 시험이 다시 열리고 학생에게 알림 */
export async function extendAssignmentDueAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const id = String(form.get("assignmentId") ?? "");
  const a = await prisma.assignment.findFirst({ where: { id, exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) }, include: { exam: { select: { title: true } }, student: { select: { userId: true, name: true } } } });
  if (!a) return { ok: false, message: "권한이 없습니다." };
  if (a.status === "completed") return { ok: false, message: "이미 끝낸 시험이에요." };
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  if (!dueAt || dueAt.getTime() <= Date.now()) return { ok: false, message: "지금보다 뒤의 마감을 고르세요." };
  await prisma.assignment.update({ where: { id }, data: { dueAt } });
  await prisma.attempt.updateMany({ where: { assignmentId: id, status: "in_progress" }, data: { deadlineAt: dueAt } });
  if (a.student.userId) await notifyUser(a.student.userId, "시험을 다시 칠 수 있어요", `${a.exam.title} · ${fmtMDHM(dueAt)}까지`, "/learn");
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "assignment.extend", target: id, detail: dueAt.toISOString() });
  revalidatePath("/app/results");
  revalidatePath(`/app/tests/${a.examId}`, "layout");
  revalidatePath("/app");
  return { ok: true, message: `${a.student.name} · ${fmtMDHM(dueAt)}까지 늘렸어요. 학생에게 알림을 보냈어요.` };
}

/** 휴지통으로 (status archived) — 학생 화면에서 바로 사라진다. 복원하면 원래 상태로 */
export async function trashExamAction(examId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  await prisma.exam.update({ where: { id: examId }, data: { status: "archived" } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.trash", target: examId });
  revalidatePath("/app/tests");
  revalidatePath(`/app/tests/${examId}`, "layout");
  return { ok: true, message: "휴지통으로 옮겼어요." };
}

export async function restoreExamAction(examId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  const published = await prisma.examForm.count({ where: { examId, status: "published" } });
  await prisma.exam.update({ where: { id: examId }, data: { status: published ? "published" : "draft" } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.restore", target: examId });
  revalidatePath("/app/tests");
  return { ok: true, message: "복원했어요." };
}

/** 영구 삭제 — 휴지통 안에서만. 배정·응시·답안·성적·시험지·이 시험에서 생긴 재시험까지 지운다 */
export async function purgeExamAction(examId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const exam = await assertExam(ctx, examId).catch(() => null);
  if (!exam) return { ok: false, message: "권한이 없습니다." };
  if (exam.status !== "archived") return { ok: false, message: "휴지통에 있는 시험만 영구 삭제할 수 있어요." };
  const n = await purgeExam(examId);
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.purge", target: examId, detail: `${exam.title} · 배정 ${n}` });
  revalidatePath("/app/tests");
  revalidatePath("/app/results");
  revalidatePath("/app/retakes");
  revalidatePath("/app");
  return { ok: true, message: `"${exam.title}"을 영구 삭제했어요.` };
}
