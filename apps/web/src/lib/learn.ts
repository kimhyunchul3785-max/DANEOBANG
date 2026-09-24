import { prisma } from "./db";
import { parseJSON } from "./util";
import { listStudentAssignments } from "./attempts";

/** 학생 본인의 재시험 목록 (연결된 모든 명단). 출제된 것은 마감 빠른 순 */
export async function studentRetakes(userId: string, studentId?: string) {
  const tasks = await prisma.retakeTask.findMany({
    where: { student: { userId, status: "active", ...(studentId ? { id: studentId } : {}) } },
    include: {
      student: { select: { id: true, name: true, academy: { select: { name: true } } } },
      sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { select: { id: true, title: true, passScore: true, answersReleased: true, answerVisibility: true, scoreVisibility: true } }, form: { select: { id: true } } } } } },
    },
    orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const assignments = await listStudentAssignments(userId, studentId);
  const retakeExamIds = tasks.map((t) => t.retakeExamId).filter((x): x is string => !!x);
  const retakeExams = retakeExamIds.length ? await prisma.exam.findMany({ where: { id: { in: retakeExamIds } }, select: { id: true, title: true, questionCount: true, passScore: true } }) : [];
  return Promise.all(
    tasks.map(async (t) => {
      const g = t.sourceAttempt?.grades[0];
      const exam = t.sourceAttempt?.assignment.exam ?? null;
      const results = g ? parseJSON<{ itemId: string; correct: boolean }[]>(g.itemResults, []) : [];
      const wrongIds = results.filter((r) => !r.correct).map((r) => r.itemId);
      const showAnswers = !exam || exam.answerVisibility === "immediate" || exam.answersReleased;
      let wrongWords: { english: string; meaning: string }[] = [];
      if (showAnswers && wrongIds.length) {
        wrongWords = (await prisma.formItem.findMany({ where: { id: { in: wrongIds } }, include: { word: { select: { meaning: true } } }, orderBy: { position: "asc" } })).map((it) => ({ english: it.prompt, meaning: it.word.meaning }));
      } else if (t.kind === "weak_words") {
        const ids = parseJSON<string[]>(t.wordIds, []);
        wrongWords = ids.length ? (await prisma.word.findMany({ where: { id: { in: ids } }, select: { english: true, meaning: true } })).map((w) => ({ english: w.english, meaning: w.meaning })) : [];
      }
      const retakeAssignment = t.retakeExamId ? assignments.find((a) => a.exam.id === t.retakeExamId) ?? null : null;
      const rex = retakeExams.find((e) => e.id === t.retakeExamId) ?? null;
      const rg = retakeAssignment?.score && "score" in retakeAssignment.score ? retakeAssignment.score : null;
      return {
        id: t.id,
        kind: t.kind,
        mode: t.mode,
        sourceAttemptId: t.sourceAttemptId,
        status: t.status,
        dueAt: retakeAssignment?.dueAt ?? t.dueAt,
        issuedAt: t.issuedAt,
        studentName: t.student.name,
        academyName: t.student.academy.name,
        sourceExam: exam ? { id: exam.id, title: exam.title, passScore: exam.passScore } : { id: null, title: "반복 오답 재시험", passScore: rex?.passScore ?? 90 },
        sourceScore: g && (!exam || exam.scoreVisibility === "immediate" || exam.answersReleased) ? Math.round(g.score) : null,
        wrongCount: wrongIds.length || wrongWords.length,
        wrongWords,
        retakeExam: rex,
        retakeAssignment,
        retakeScore: rg ? { score: rg.score, passed: rg.passed } : null,
      };
    }),
  );
}

/** 학생 본인의 채점 결과 (점수 공개된 것만), 오래된 순 */
export async function studentGrades(userId: string, studentId?: string) {
  const gs = await prisma.gradeRevision.findMany({
    where: { current: true, attempt: { assignment: { student: { userId, status: "active", ...(studentId ? { id: studentId } : {}) } } } },
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
