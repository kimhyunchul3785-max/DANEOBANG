import { prisma } from "./db";
import { gradeAttempt, studentFormDTO } from "./grading";
import { parseJSON } from "./util";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

/** 학생 본인의 배정 목록 */
export async function listStudentAssignments(userId: string) {
  const students = await prisma.student.findMany({ where: { userId, status: "active" }, select: { id: true } });
  const assignments = await prisma.assignment.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, exam: { status: "published" } },
    include: {
      exam: { select: { id: true, title: true, questionCount: true, passScore: true, timeLimitMin: true, secondsPerItem: true, isRetake: true, scoreVisibility: true, answerVisibility: true, answersReleased: true, academy: { select: { name: true } } } },
      attempts: { include: { grades: { where: { current: true } } }, orderBy: { attemptNo: "desc" } },
      student: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" }, // 출제된 순서(옛날 → 현재). 학생은 안 친 것을 차례대로 친다
  });
  const now = Date.now();
  return assignments.map((a) => {
    const latest = a.attempts[0];
    const g = latest?.grades[0];
    const expired = !!a.dueAt && a.dueAt.getTime() < now && a.status !== "completed";
    return {
      assignmentId: a.id,
      exam: a.exam,
      studentName: a.student.name,
      status: expired ? "expired" : a.status,
      mode: a.mode,
      startAt: a.startAt,
      dueAt: a.dueAt,
      attemptId: latest?.id ?? null,
      attemptStatus: latest?.status ?? null,
      score: g && a.exam.scoreVisibility === "immediate" ? { score: Math.round(g.score), correct: g.correctCount, total: g.totalCount, passed: g.passed } : g ? { hidden: true } : null,
      canStart: !expired && a.status !== "completed" && (a.mode === null || a.mode === "online") && (!a.startAt || a.startAt.getTime() <= now),
    };
  });
}

async function ownAssignment(assignmentId: string, userId: string) {
  const a = await prisma.assignment.findFirst({ where: { id: assignmentId, student: { userId } }, include: { exam: true, form: true, attempts: { orderBy: { attemptNo: "desc" } } } });
  if (!a) throw new ApiError(404, "not_found");
  return a;
}

/** 시험 시작: 방식 잠금(online), 기존 진행 중 attempt 재사용 */
export async function startAttempt(assignmentId: string, userId: string) {
  const a = await ownAssignment(assignmentId, userId);
  const now = new Date();
  if (a.exam.status !== "published") throw new ApiError(409, "exam_not_published");
  if (a.startAt && a.startAt > now) throw new ApiError(409, "not_started_yet", "아직 시작 시각이 아닙니다.");
  if (a.dueAt && a.dueAt < now) throw new ApiError(409, "expired", "기한이 지났습니다.");
  if (a.mode === "paper") throw new ApiError(409, "paper_mode", "종이 시험으로 발급된 시험입니다. 온라인 응시는 선생님이 방식을 변경해야 합니다.");
  const inProgress = a.attempts.find((t) => t.status === "in_progress");
  if (inProgress) {
    if (inProgress.deadlineAt && inProgress.deadlineAt < now) {
      // 시간 만료 → 저장된 답안으로 확정
      await gradeAttempt(inProgress.id, { reason: "time_expired" });
      throw new ApiError(409, "expired", "시간이 만료되어 저장된 답안으로 확정되었습니다.");
    }
    return inProgress;
  }
  if (a.status === "completed") throw new ApiError(409, "already_completed", "이미 응시를 완료했습니다.");
  // 단어당 제한 시간(기본 7초) × 문항 수 + 여유 20초 → 서버 기준 마감. 시간 제한(분)·기한이 더 이르면 그것을 따른다.
  const itemCount = await prisma.formItem.count({ where: { formId: a.formId } });
  const perItemMs = Math.max(3, a.exam.secondsPerItem || 7) * 1000;
  const deadlines = [a.dueAt, a.exam.timeLimitMin ? new Date(now.getTime() + a.exam.timeLimitMin * 60000) : null, new Date(now.getTime() + itemCount * perItemMs + 20000)].filter(Boolean) as Date[];
  const deadlineAt = deadlines.length ? new Date(Math.min(...deadlines.map((d) => d.getTime()))) : null;
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.assignment.findUnique({ where: { id: a.id }, include: { attempts: { where: { status: "in_progress" } } } });
    if (fresh?.attempts.length) return fresh.attempts[0];
    const attemptNo = a.attempts.length + 1;
    const attempt = await tx.attempt.create({ data: { assignmentId: a.id, attemptNo, mode: "online", deadlineAt } });
    await tx.assignment.update({ where: { id: a.id }, data: { mode: "online", status: "in_progress" } });
    return attempt;
  });
}

export async function getAttemptForStudent(attemptId: string, userId: string) {
  const t = await prisma.attempt.findFirst({
    where: { id: attemptId, assignment: { student: { userId } } },
    include: {
      answers: true,
      assignment: { include: { exam: { select: { id: true, title: true, questionCount: true, timeLimitMin: true, secondsPerItem: true, scoreVisibility: true, answerVisibility: true, answersReleased: true, passScore: true } }, form: { include: { items: { include: { options: { select: { id: true, position: true, text: true } } }, orderBy: { position: "asc" } } } } } },
      grades: { where: { current: true } },
    },
  });
  if (!t) throw new ApiError(404, "not_found");
  return t;
}

export function attemptDTO(t: Awaited<ReturnType<typeof getAttemptForStudent>>) {
  return {
    attemptId: t.id,
    status: t.status,
    revision: t.revision,
    deadlineAt: t.deadlineAt,
    serverTime: new Date(),
    exam: t.assignment.exam,
    items: studentFormDTO(t.assignment.form),
    answers: Object.fromEntries(t.answers.map((a) => [a.itemId, a.optionId])),
  };
}

/** 답안 저장 (revision 낙관적 잠금) */
export async function saveAnswers(attemptId: string, userId: string, expectedRevision: number, answers: { itemId: string; optionId: string | null }[]) {
  const t = await getAttemptForStudent(attemptId, userId);
  if (t.status !== "in_progress") throw new ApiError(409, "not_in_progress", "진행 중인 응시가 아닙니다.");
  if (t.deadlineAt && t.deadlineAt < new Date()) {
    await gradeAttempt(t.id, { reason: "time_expired" });
    throw new ApiError(409, "expired", "시간이 만료되었습니다. 저장된 답안으로 확정됩니다.");
  }
  if (t.revision !== expectedRevision) throw new ApiError(409, "revision_conflict", "다른 화면에서 답안이 변경되었습니다. 최신 상태를 불러옵니다.", { revision: t.revision });
  const itemMap = new Map(t.assignment.form.items.map((i) => [i.id, i]));
  for (const a of answers) {
    const item = itemMap.get(a.itemId);
    if (!item) throw new ApiError(422, "bad_item");
    if (a.optionId && !item.options.some((o) => o.id === a.optionId)) throw new ApiError(422, "bad_option", "보기가 이 문항에 속하지 않습니다.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.attempt.updateMany({ where: { id: attemptId, revision: expectedRevision, status: "in_progress" }, data: { revision: { increment: 1 } } });
    if (updated.count === 0) throw new ApiError(409, "revision_conflict", "답안 버전이 충돌했습니다.", { revision: t.revision });
    for (const a of answers) {
      await tx.attemptAnswer.upsert({ where: { attemptId_itemId: { attemptId, itemId: a.itemId } }, update: { optionId: a.optionId }, create: { attemptId, itemId: a.itemId, optionId: a.optionId } });
    }
    return { revision: expectedRevision + 1, savedAt: new Date() };
  });
}

/** 최종 제출 → 공통 채점. 반복 제출은 기존 결과 반환(멱등). */
export async function submitAttempt(attemptId: string, userId: string, final?: { expectedRevision: number; answers: { itemId: string; optionId: string | null }[] }) {
  const t = await getAttemptForStudent(attemptId, userId);
  if (t.status === "graded" && t.grades[0]) return { alreadyGraded: true, grade: t.grades[0] };
  if (t.status !== "in_progress") throw new ApiError(409, "not_in_progress");
  if (t.deadlineAt && t.deadlineAt.getTime() + 5000 < Date.now()) {
    const r = await gradeAttempt(t.id, { reason: "time_expired" });
    return { alreadyGraded: false, grade: r.grade, expired: true };
  }
  if (final && final.answers.length) await saveAnswers(attemptId, userId, final.expectedRevision, final.answers);
  await prisma.attempt.update({ where: { id: attemptId }, data: { status: "submitted", submittedAt: new Date() } });
  const r = await gradeAttempt(attemptId, { reason: "initial" });
  return { alreadyGraded: !r.created, grade: r.grade };
}

/** 결과 DTO: 점수/정답 공개 정책 적용 */
export async function attemptResultForStudent(attemptId: string, userId: string) {
  const t = await getAttemptForStudent(attemptId, userId);
  const g = t.grades[0];
  const exam = t.assignment.exam;
  const showScore = !!g && (exam.scoreVisibility === "immediate" || exam.answersReleased);
  const showAnswers = !!g && (exam.answerVisibility === "immediate" || exam.answersReleased);
  const results = g ? parseJSON<{ itemId: string; optionId: string | null; correct: boolean }[]>(g.itemResults, []) : [];
  let wrongItems: { position: number; prompt: string; options: { text: string; chosen: boolean; correct: boolean }[] }[] = [];
  if (showAnswers) {
    const full = await prisma.formItem.findMany({ where: { formId: t.assignment.form.id }, include: { options: true }, orderBy: { position: "asc" } });
    wrongItems = full
      .filter((it) => !results.find((r) => r.itemId === it.id)?.correct)
      .map((it) => {
        const chosen = results.find((r) => r.itemId === it.id)?.optionId ?? null;
        return { position: it.position, prompt: it.prompt, options: it.options.sort((a, b) => a.position - b.position).map((o) => ({ text: o.text, chosen: o.id === chosen, correct: o.isCorrect })) };
      });
  }
  return {
    attemptId: t.id,
    status: t.status,
    examTitle: exam.title,
    graded: !!g,
    score: showScore && g ? { score: Math.round(g.score), correct: g.correctCount, total: g.totalCount, passed: g.passed, passScore: exam.passScore } : null,
    scoreHidden: !!g && !showScore,
    answersReleased: showAnswers,
    wrongItems,
  };
}
