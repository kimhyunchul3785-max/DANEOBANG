import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const exams = await prisma.exam.findMany({ where: { academyId: ctx.member.academyId }, include: { book: { select: { title: true } }, _count: { select: { assignments: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return ok(exams.map((e) => ({ id: e.id, title: e.title, book: e.book.title, questionCount: e.questionCount, passScore: e.passScore, status: e.status, isRetake: e.isRetake, answersReleased: e.answersReleased, assignments: e._count.assignments, createdAt: e.createdAt })));
  }, req);
}
