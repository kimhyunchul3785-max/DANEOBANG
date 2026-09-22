import { prisma } from "./db";
import { parseJSON } from "./util";
import { listStudentAssignments } from "./attempts";

/** 학생 본인의 재시험·보강 목록 (연결된 모든 명단) */
export async function studentRetakes(userId: string) {
  const tasks = await prisma.retakeTask.findMany({
    where: { student: { userId, status: "active" } },
    include: {
      student: { select: { id: true, name: true, academy: { select: { name: true } } } },
      sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { select: { id: true, title: true, passScore: true, answersReleased: true, answerVisibility: true } }, form: { select: { id: true } } } } } },
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { createdAt: "desc" }],
  });
  const assignments = await listStudentAssignments(userId);
  return Promise.all(
    tasks.map(async (t) => {
      const g = t.sourceAttempt.grades[0];
      const exam = t.sourceAttempt.assignment.exam;
      const results = g ? parseJSON<{ itemId: string; correct: boolean }[]>(g.itemResults, []) : [];
      const wrongIds = results.filter((r) => !r.correct).map((r) => r.itemId);
      const showAnswers = exam.answerVisibility === "immediate" || exam.answersReleased;
      const wrongWords = showAnswers && wrongIds.length ? (await prisma.formItem.findMany({ where: { id: { in: wrongIds } }, include: { word: { select: { english: true, meaning: true } } }, orderBy: { position: "asc" } })).map((it) => ({ english: it.prompt, meaning: it.word.meaning })) : [];
      const retakeAssignment = t.retakeExamId ? assignments.find((a) => a.exam.id === t.retakeExamId) ?? null : null;
      return {
        id: t.id,
        sourceAttemptId: t.sourceAttemptId,
        status: t.status,
        scheduledAt: t.scheduledAt,
        dueAt: t.dueAt,
        note: t.note,
        studentName: t.student.name,
        academyName: t.student.academy.name,
        sourceExam: { id: exam.id, title: exam.title, passScore: exam.passScore },
        sourceScore: g ? Math.round(g.score) : null,
        wrongCount: wrongIds.length,
        wrongWords,
        retakeAssignment,
      };
    }),
  );
}

/** 학생 본인의 채점 결과 (점수 공개된 것만), 오래된 순 */
export async function studentGrades(userId: string) {
  const gs = await prisma.gradeRevision.findMany({
    where: { current: true, attempt: { assignment: { student: { userId, status: "active" } } } },
    include: { attempt: { select: { id: true, attemptNo: true, submittedAt: true, assignment: { select: { exam: { select: { id: true, title: true, passScore: true, isRetake: true, scoreVisibility: true, answersReleased: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  return gs
    .filter((g) => g.attempt.assignment.exam.scoreVisibility === "immediate" || g.attempt.assignment.exam.answersReleased)
    .map((g) => ({
      attemptId: g.attempt.id,
      examId: g.attempt.assignment.exam.id,
      title: g.attempt.assignment.exam.title,
      isRetake: g.attempt.assignment.exam.isRetake,
      passScore: g.attempt.assignment.exam.passScore,
      score: Math.round(g.score),
      passed: g.passed,
      correct: g.correctCount,
      total: g.totalCount,
      at: g.attempt.submittedAt ?? g.createdAt,
    }));
}
