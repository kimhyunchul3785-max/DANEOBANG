import { prisma } from "@/lib/db";
import { getCurrentUser, getStudentContexts } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const memberships = await prisma.academyMember.findMany({ where: { userId: user.id, status: "active" }, include: { academy: { select: { id: true, name: true, slug: true, status: true } } } });
    const students = await getStudentContexts(user.id);
    return ok({
      user: { id: user.id, name: user.name, email: user.email, isPlatformAdmin: user.isPlatformAdmin },
      memberships: memberships.map((m) => ({ academy: m.academy, role: m.role })),
      students: students.map((s) => ({ studentId: s.id, name: s.name, academy: s.academy })),
    });
  }, req);
}
