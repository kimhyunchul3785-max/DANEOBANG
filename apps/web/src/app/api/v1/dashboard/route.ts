import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { seoulWeekRange } from "@/lib/util";
import { handle, ok, fail } from "@/lib/api";
import { todayAssignmentWhere, overdueAssignmentWhere } from "@/lib/metrics";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy", "x-academy-id 헤더로 학원을 지정하세요.");
    const academyId = ctx.member.academyId;
    const scope = studentScope(ctx);
    const now = new Date();
    const week = seoulWeekRange(now);
    const [students, todayAssignments, overdue, retakes, scansPending, recent] = await Promise.all([
      prisma.student.count({ where: { ...scope, status: "active" } }),
      prisma.assignment.findMany({ where: todayAssignmentWhere(academyId, scope, now), select: { status: true } }),
      prisma.assignment.count({ where: overdueAssignmentWhere(academyId, scope, now) }),
      prisma.retakeTask.count({ where: { student: scope, status: { in: ["pending", "issued"] }, OR: [{ dueAt: null }, { dueAt: { gte: week.start, lt: week.end } }] } }),
      prisma.scanUpload.count({ where: { academyId, status: { in: ["needs_review", "unrecognized"] } } }),
      prisma.gradeRevision.findMany({ where: { current: true, attempt: { assignment: { exam: { academyId }, student: scope } } }, include: { attempt: { include: { assignment: { include: { student: { select: { id: true, name: true } }, exam: { select: { id: true, title: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return ok({
      academy: ctx.member.academy,
      role: ctx.member.role,
      students,
      today: { total: todayAssignments.length, completed: todayAssignments.filter((a) => a.status === "completed").length },
      overdue,
      retakesThisWeek: retakes,
      scansPending,
      recentGrades: recent.map((g) => ({ attemptId: g.attemptId, student: g.attempt.assignment.student, exam: g.attempt.assignment.exam, score: Math.round(g.score), correct: g.correctCount, total: g.totalCount, passed: g.passed, at: g.createdAt })),
    });
  }, req);
}
