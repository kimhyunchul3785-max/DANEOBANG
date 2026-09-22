import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const { id } = await params;
    const s = await prisma.student.findFirst({
      where: { id, ...studentScope(ctx) },
      include: { classRoom: true, assignments: { include: { exam: { select: { id: true, title: true, isRetake: true } }, attempts: { include: { grades: { where: { current: true } } }, orderBy: { attemptNo: "asc" } } }, orderBy: { createdAt: "desc" } }, retakes: { where: { status: { in: ["pending", "scheduled"] } } } },
    });
    if (!s) return fail(404, "not_found");
    return ok({
      id: s.id,
      name: s.name,
      school: s.school,
      grade: s.grade,
      class: s.classRoom ? { id: s.classRoom.id, name: s.classRoom.name } : null,
      linked: !!s.userId,
      history: s.assignments.map((a) => ({ assignmentId: a.id, exam: a.exam, status: a.status, mode: a.mode, dueAt: a.dueAt, attempts: a.attempts.map((t) => ({ attemptId: t.id, attemptNo: t.attemptNo, mode: t.mode, status: t.status, submittedAt: t.submittedAt, grade: t.grades[0] ? { score: Math.round(t.grades[0].score), correct: t.grades[0].correctCount, total: t.grades[0].totalCount, passed: t.grades[0].passed } : null })) })),
      pendingRetakes: s.retakes.map((r) => ({ id: r.id, dueAt: r.dueAt, status: r.status })),
    });
  }, req);
}
