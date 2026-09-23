import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const { id } = await params;
    const e = await prisma.exam.findFirst({
      where: { id, academyId: ctx.member.academyId },
      include: { scopes: true, forms: { select: { id: true, version: true, status: true, publishedAt: true } }, assignments: { where: { student: studentScope(ctx) }, include: { student: { select: { id: true, name: true } }, attempts: { include: { grades: { where: { current: true } } }, orderBy: { attemptNo: "desc" }, take: 1 } } } },
    });
    if (!e) return fail(404, "not_found");
    return ok({
      id: e.id,
      title: e.title,
      questionCount: e.questionCount,
      passScore: e.passScore,
      status: e.status,
      forms: e.forms,
      assignments: e.assignments.map((a) => ({ assignmentId: a.id, student: a.student, status: a.status, mode: a.mode, dueAt: a.dueAt, latest: a.attempts[0] ? { attemptId: a.attempts[0].id, status: a.attempts[0].status, grade: a.attempts[0].grades[0] ? { score: Math.round(a.attempts[0].grades[0].score), passed: a.attempts[0].grades[0].passed } : null } : null })),
    });
  }, req);
}
