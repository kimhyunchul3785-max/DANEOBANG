import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";
import { studentsQuerySchema } from "@daneobang/validation";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const q = studentsQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams)).q ?? "";
    const students = await prisma.student.findMany({ where: { ...studentScope(ctx), ...(q ? { name: { contains: q } } : {}) }, include: { classRoom: { select: { id: true, name: true } } }, orderBy: { name: "asc" }, take: 500 });
    return ok(students.map((s) => ({ id: s.id, name: s.name, school: s.school, grade: s.grade, class: s.classRoom, linked: !!s.userId, status: s.status })));
  }, req);
}
