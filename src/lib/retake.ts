import { prisma } from "./db";
import type { AcademyContext } from "./auth";
import { audit } from "./auth";
import { studentScope } from "./scope";
import { createFormForExam } from "./exam-gen";
import { parseJSON, fmtMDHM } from "./util";
import { notifyUser } from "./notify";

/**
 * 재시험 (v4.4)
 *  - 통과 미달이면 채점 시 RetakeTask(kind=failed) 가 자동으로 생긴다 (pending = 출제 전).
 *  - 선생님이 범위(오답만 / 같은 범위)와 마감을 정해 "출제"하면: 시험 생성 → 문항 생성 → 발행 → 그 학생에게 배정(마감) → 학생 알림 → status=issued.
 *  - 학생 상세의 반복 오답 n개로 만드는 재시험은 kind=weak_words (원 응시 없음) 로 같은 흐름.
 *  - 재시험을 통과하면 completed, 또 미달이면 그 응시를 원 응시로 하는 새 task 가 생겨 이어진다(2차, 3차 …).
 *  - 보강 일정(scheduledAt) 개념은 없다. 마감(dueAt)이 곧 언제까지 치는지다.
 */
export const RETAKE_OPEN = ["pending", "issued"] as const;
export type RetakeMode = "wrong" | "same" | "words";

export const RETAKE_INCLUDE = {
  student: { include: { classRoom: true } },
  sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { include: { scopes: true } }, form: { include: { items: true } } } } } },
} as const;

export async function ownRetakeTask(ctx: AcademyContext, taskId: string) {
  return prisma.retakeTask.findFirst({ where: { id: taskId, student: studentScope(ctx) }, include: RETAKE_INCLUDE });
}

/** 기본 마감: 3일 뒤 23:59 (KST) */
export function defaultRetakeDue(now = new Date()) {
  const l = new Date(now.getTime() + 9 * 3600e3);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + 3, 14, 59));
}

/** 원 응시의 오답 단어 id */
export function wrongWordIdsOf(task: { sourceAttempt: { grades: { itemResults: string }[]; assignment: { form: { items: { id: string; wordId: string }[] } } } | null }) {
  const src = task.sourceAttempt;
  if (!src) return [] as string[];
  const g = src.grades[0];
  if (!g) return [] as string[];
  const wrongItemIds = new Set(parseJSON<{ itemId: string; correct: boolean }[]>(g.itemResults, []).filter((r) => !r.correct).map((r) => r.itemId));
  return src.assignment.form.items.filter((i) => wrongItemIds.has(i.id)).map((i) => i.wordId);
}

/** 몇 차 재시험인지 (원 응시가 재시험이면 +1 로 거슬러 올라간다) */
export async function retakeRound(task: { sourceAttemptId: string | null }): Promise<number> {
  let round = 1;
  let attemptId = task.sourceAttemptId;
  for (let guard = 0; attemptId && guard < 10; guard++) {
    const a = await prisma.attempt.findUnique({ where: { id: attemptId }, select: { assignment: { select: { exam: { select: { isRetake: true, id: true } } } } } });
    if (!a?.assignment.exam.isRetake) break;
    round++;
    const prev = await prisma.retakeTask.findFirst({ where: { retakeExamId: a.assignment.exam.id }, select: { sourceAttemptId: true } });
    attemptId = prev?.sourceAttemptId ?? null;
  }
  return round;
}

type IssueResult = { ok: true; examId: string; questionCount: number } | { ok: false; message: string };

/**
 * 재시험 출제: 시험 생성 → 문항 → 발행 → 배정(마감) → 알림.
 * mode=wrong: 오답 단어만(보기 후보는 원 범위 전체), same: 원 시험과 같은 범위·문항 수, words: 지정 단어(wordIds).
 */
export async function issueRetake(ctx: AcademyContext, taskId: string, opts: { mode: RetakeMode; dueAt: Date | null; wordIds?: string[] }): Promise<IssueResult> {
  const t = await ownRetakeTask(ctx, taskId);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  if (t.status === "completed" || t.status === "cancelled") return { ok: false, message: "이미 끝난 재시험입니다." };
  if (t.retakeExamId) return { ok: false, message: "이미 출제된 재시험입니다. 마감만 바꿀 수 있습니다." };

  let bookId: string;
  let dayIds: string[];
  let onlyWordIds: string[] | undefined;
  let questionCount: number;
  let title: string;
  let base: { passScore: number; timeLimitMin: number | null; secondsPerItem: number; scoreVisibility: string; answerVisibility: string } = { passScore: 90, timeLimitMin: null, secondsPerItem: 7, scoreVisibility: "immediate", answerVisibility: "immediate" };

  if (opts.mode === "words" || t.kind === "weak_words") {
    const ids = [...new Set((opts.wordIds ?? parseJSON<string[]>(t.wordIds, [])).filter(Boolean))];
    if (!ids.length) return { ok: false, message: "단어를 선택하세요." };
    const words = await prisma.word.findMany({ where: { id: { in: ids }, book: { academyId: ctx.member.academyId } }, select: { id: true, bookId: true, dayId: true } });
    if (!words.length) return { ok: false, message: "단어를 찾을 수 없습니다." };
    // 단어장이 여러 개면 가장 많은 단어장 하나로 (보기 후보가 같은 단어장에서 나와야 한다)
    const byBook = new Map<string, typeof words>();
    for (const w of words) byBook.set(w.bookId, [...(byBook.get(w.bookId) ?? []), w]);
    const [bk, picked] = [...byBook.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    bookId = bk;
    dayIds = [...new Set(picked.map((w) => w.dayId))];
    onlyWordIds = picked.map((w) => w.id);
    questionCount = picked.length;
    const l = new Date(Date.now() + 9 * 3600e3);
    title = `${t.student.name} 반복 오답 재시험 (${l.getUTCMonth() + 1}/${l.getUTCDate()})`;
  } else {
    const src = t.sourceAttempt;
    if (!src) return { ok: false, message: "원 응시가 없습니다." };
    const exam = src.assignment.exam;
    const wrong = wrongWordIdsOf(t);
    bookId = exam.bookId;
    dayIds = exam.scopes.map((s) => s.dayId);
    base = { passScore: exam.passScore, timeLimitMin: exam.timeLimitMin, secondsPerItem: exam.secondsPerItem, scoreVisibility: exam.scoreVisibility, answerVisibility: exam.answerVisibility };
    if (opts.mode === "wrong") {
      if (!wrong.length) return { ok: false, message: "오답이 없어 오답만 재시험을 만들 수 없습니다. 같은 범위로 출제하세요." };
      onlyWordIds = wrong;
      questionCount = wrong.length;
    } else {
      questionCount = exam.questionCount;
    }
    const baseTitle = exam.title.replace(/\s*재시험(?:\s*\d+차)?\s*\([^)]*\)\s*$/, "");
    const round = await retakeRound(t);
    title = `${baseTitle} 재시험${round > 1 ? ` ${round}차` : ""} (${t.student.name})`;
  }

  const exam = await prisma.exam.create({
    data: {
      academyId: ctx.member.academyId,
      bookId,
      createdById: ctx.user.id,
      title,
      questionCount,
      passScore: base.passScore,
      timeLimitMin: base.timeLimitMin,
      secondsPerItem: base.secondsPerItem,
      scoreVisibility: base.scoreVisibility,
      answerVisibility: base.answerVisibility,
      isRetake: true,
      scopes: { create: dayIds.map((dayId) => ({ dayId })) },
    },
  });
  let formId: string;
  let items: number;
  try {
    const r = await createFormForExam(exam.id, onlyWordIds ? { onlyWordIds } : undefined);
    formId = r.form.id;
    items = r.gen.items.length;
  } catch (e) {
    await prisma.exam.delete({ where: { id: exam.id } });
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg.startsWith("distractor_shortage") ? "보기(오답)로 쓸 단어가 부족합니다. 같은 범위로 출제하거나 단어장을 확인하세요." : `문항 생성 실패: ${msg}` };
  }
  await prisma.$transaction([
    prisma.examForm.update({ where: { id: formId }, data: { status: "published", publishedAt: new Date() } }),
    prisma.exam.update({ where: { id: exam.id }, data: { status: "published" } }),
    prisma.assignment.create({ data: { examId: exam.id, formId, studentId: t.studentId, dueAt: opts.dueAt } }),
    prisma.retakeTask.update({ where: { id: taskId }, data: { retakeExamId: exam.id, status: "issued", mode: opts.mode, dueAt: opts.dueAt, issuedAt: new Date(), ...(onlyWordIds && (opts.mode === "words" || t.kind === "weak_words") ? { wordIds: JSON.stringify(onlyWordIds) } : {}) } }),
  ]);
  if (t.student.userId) {
    await notifyUser(t.student.userId, `재시험이 나왔어요 · ${items}문항`, `${title}${opts.dueAt ? ` · ${fmtMDHM(opts.dueAt)}까지` : ""}`, "/learn/retake");
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.issue", target: taskId, detail: `${opts.mode} ${items}q due=${opts.dueAt?.toISOString() ?? "-"}` });
  return { ok: true, examId: exam.id, questionCount: items };
}

/** 출제된 재시험의 마감 변경 (배정 기한·진행 중 응시 마감도 함께) */
export async function setRetakeDue(ctx: AcademyContext, taskId: string, dueAt: Date | null) {
  const t = await ownRetakeTask(ctx, taskId);
  if (!t) return { ok: false as const, message: "권한이 없습니다." };
  await prisma.retakeTask.update({ where: { id: taskId }, data: { dueAt } });
  if (t.retakeExamId) {
    await prisma.assignment.updateMany({ where: { examId: t.retakeExamId, studentId: t.studentId, status: { in: ["assigned", "in_progress"] } }, data: { dueAt } });
    if (t.student.userId) await notifyUser(t.student.userId, "재시험 마감이 바뀌었어요", dueAt ? `${fmtMDHM(dueAt)}까지` : "마감이 없어졌어요", "/learn/retake");
  }
  return { ok: true as const };
}

/** 학생 상세: 반복 오답 단어 n개로 재시험 task 를 만들고 바로 출제 */
export async function issueWeakWordsRetake(ctx: AcademyContext, studentId: string, wordIds: string[], dueAt: Date | null) {
  const task = await prisma.retakeTask.create({ data: { studentId, kind: "weak_words", status: "pending", wordIds: JSON.stringify(wordIds) } });
  const r = await issueRetake(ctx, task.id, { mode: "words", dueAt, wordIds });
  if (!r.ok) await prisma.retakeTask.delete({ where: { id: task.id } });
  return r;
}
