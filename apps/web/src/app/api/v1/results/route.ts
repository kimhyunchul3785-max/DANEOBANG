import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const sp = new URL(req.url).searchParams;
    const grades = await prisma.gradeRevision.findMany({
      where: { current: true, attempt: { status: "graded", assignment: { exam: { academyId: ctx.member.academyId, ...(sp.get("examId") ? { id: sp.get("examId")! } : {}) }, student: { ...studentScope(ctx), ...(sp.get("studentId") ? { id: sp.get("studentId")! } : {}) } } } },
      include: { attempt: { include: { assignment: { include: { student: { select: { id: true, name: true } }, exam: { select: { id: true, title: true, isRetake: true } } } } } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return ok(grades.map((g) => ({ attemptId: g.attemptId, student: g.attempt.assignment.student, exam: g.attempt.assignment.exam, attemptNo: g.attempt.attemptNo, mode: g.attempt.mode, score: Math.round(g.score), correct: g.correctCount, total: g.totalCount, passed: g.passed, revision: g.revisionNo, at: g.createdAt })));
  }, req);
}
