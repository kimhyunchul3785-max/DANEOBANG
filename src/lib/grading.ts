import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export type ItemResult = { itemId: string; position: number; optionId: string | null; correct: boolean };

/**
 * 공통 채점 함수. 온라인 제출과 종이 확정이 모두 이 함수를 사용한다.
 * - 답안(attempt_answers)을 정답 키(form_options.isCorrect)와 비교
 * - grade_revision 생성 (이전 revision 은 current=false)
 * - 미달 시 재시험 task 1회 생성, 재시험 통과 시 원 task 완료
 * 멱등: 같은 attempt 에 initial 채점이 이미 있으면 다시 만들지 않는다.
 */
export async function gradeAttempt(attemptId: string, opts: { reason?: string; by?: string | null; force?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        answers: true,
        assignment: { include: { exam: true, form: { include: { items: { include: { options: true }, orderBy: { position: "asc" } } } }, student: true } },
        grades: { where: { current: true } },
      },
    });
    if (attempt.grades.length && !opts.force) return { attempt, grade: attempt.grades[0], created: false };

    const answerMap = new Map(attempt.answers.map((a) => [a.itemId, a.optionId]));
    const results: ItemResult[] = [];
    let correct = 0;
    for (const item of attempt.assignment.form.items) {
      const optionId = answerMap.get(item.id) ?? null;
      const opt = item.options.find((o) => o.id === optionId);
      const ok = !!opt && opt.isCorrect;
      if (ok) correct++;
      results.push({ itemId: item.id, position: item.position, optionId, correct: ok });
    }
    const total = attempt.assignment.form.items.length;
    const ratio = total ? correct / total : 0;
    const score = ratio * 100;
    // 통과 판정은 반올림 전 비율로 비교
    const passed = ratio >= attempt.assignment.exam.passScore / 100 - 1e-9;
    const revisionNo = (await tx.gradeRevision.count({ where: { attemptId } })) + 1;
    await tx.gradeRevision.updateMany({ where: { attemptId, current: true }, data: { current: false } });
    const grade = await tx.gradeRevision.create({
      data: { attemptId, revisionNo, correctCount: correct, totalCount: total, score, passed, reason: opts.reason ?? (revisionNo === 1 ? "initial" : "regrade"), itemResults: JSON.stringify(results), createdBy: opts.by ?? null },
    });
    await tx.attempt.update({ where: { id: attemptId }, data: { status: "graded", submittedAt: attempt.submittedAt ?? new Date() } });
    await tx.assignment.update({ where: { id: attempt.assignmentId }, data: { status: "completed" } });

    await syncRetakeState(tx, { attemptId, studentId: attempt.assignment.studentId, examId: attempt.assignment.examId, isRetakeExam: attempt.assignment.exam.isRetake, passed });
    await tx.usageEvent.create({ data: { academyId: attempt.assignment.exam.academyId, kind: "attempt", amount: 1 } });
    return { attempt, grade, created: true };
  });
}

async function syncRetakeState(tx: Prisma.TransactionClient, p: { attemptId: string; studentId: string; examId: string; isRetakeExam: boolean; passed: boolean }) {
  if (!p.passed) {
    // 미달 → 출제 전(pending) task. 재채점으로 다시 미달이 되어도 같은 task 를 되살린다
    const existing = await tx.retakeTask.findUnique({ where: { sourceAttemptId: p.attemptId } });
    if (existing) {
      if (existing.status === "cancelled" || existing.status === "completed") await tx.retakeTask.update({ where: { id: existing.id }, data: { status: existing.retakeExamId ? "issued" : "pending", completedAt: null } });
    } else {
      await tx.retakeTask.create({ data: { studentId: p.studentId, sourceAttemptId: p.attemptId, kind: "failed" } });
    }
  } else {
    // 재채점으로 통과가 되면 미완료 task 취소
    await tx.retakeTask.updateMany({ where: { sourceAttemptId: p.attemptId, status: { in: ["pending", "issued"] } }, data: { status: "cancelled" } });
  }
  if (p.isRetakeExam) {
    // 이 재시험을 낸 task: 통과면 완료. 미달이면 위에서 이 응시를 원 응시로 하는 새 task(다음 차수)가 생겼으므로 이 task 도 완료 처리해 큐에 한 줄만 남긴다
    await tx.retakeTask.updateMany({ where: { studentId: p.studentId, retakeExamId: p.examId, status: { in: ["pending", "issued"] } }, data: { status: "completed", completedAt: new Date() } });
  }
}

/** 학생에게 보내는 문제 DTO: 정답·출처·seed 없음 */
export function studentFormDTO(form: { items: { id: string; position: number; prompt: string; options: { id: string; position: number; text: string }[] }[] }) {
  return form.items
    .sort((a, b) => a.position - b.position)
    .map((it) => ({ itemId: it.id, position: it.position, prompt: it.prompt, options: it.options.sort((a, b) => a.position - b.position).map((o) => ({ optionId: o.id, position: o.position, text: o.text })) }));
}
