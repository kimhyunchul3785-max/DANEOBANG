import type { Prisma } from "@/generated/prisma/client";
import type { AcademyContext } from "./auth";
import { prisma } from "./db";

/** 현재 교사가 볼 수 있는 학생 범위. 학원장은 전체, 선생님은 담당 학생. */
export function studentScope(ctx: AcademyContext): Prisma.StudentWhereInput {
  if (ctx.isOwner) return { academyId: ctx.member.academyId };
  return { academyId: ctx.member.academyId, teachers: { some: { memberId: ctx.member.id } } };
}

export async function canAccessStudent(ctx: AcademyContext, studentId: string) {
  const s = await prisma.student.findFirst({ where: { id: studentId, ...studentScope(ctx) }, select: { id: true } });
  return !!s;
}

/** 학원 경계 검사: 리소스가 현재 학원 소속인지 */
export async function assertBook(ctx: AcademyContext, bookId: string) {
  const b = await prisma.vocabBook.findFirst({ where: { id: bookId, academyId: ctx.member.academyId } });
  if (!b) throw new Error("not_found");
  return b;
}

export async function assertExam(ctx: AcademyContext, examId: string) {
  const e = await prisma.exam.findFirst({ where: { id: examId, academyId: ctx.member.academyId } });
  if (!e) throw new Error("not_found");
  return e;
}

export async function assertImport(ctx: AcademyContext, importId: string) {
  const i = await prisma.import.findFirst({ where: { id: importId, academyId: ctx.member.academyId } });
  if (!i) throw new Error("not_found");
  return i;
}

/** attempt → 현재 학원 소속 + 학생 범위 검사 */
export async function assertAttempt(ctx: AcademyContext, attemptId: string) {
  const a = await prisma.attempt.findFirst({
    where: { id: attemptId, assignment: { exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } },
    include: { assignment: { include: { student: true, exam: true, form: true } } },
  });
  if (!a) throw new Error("not_found");
  return a;
}
