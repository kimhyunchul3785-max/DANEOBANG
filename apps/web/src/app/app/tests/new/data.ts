import { prisma } from "@/lib/db";
import type { AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";

/** 출제 폼 데이터 — 시험 탭 위저드(모든 단어장)와 단어장 고정 출제(하나)가 같이 쓴다 */
export async function loadComposeBooks(ctx: AcademyContext, bookId?: string) {
  const books = await prisma.vocabBook.findMany({
    where: { academyId: ctx.member.academyId, status: "active", ...(bookId ? { id: bookId } : {}) },
    include: { days: { orderBy: { dayNo: "asc" }, include: { _count: { select: { words: { where: { approved: true, excluded: false } } } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return books.map((b) => ({ id: b.id, title: b.title, days: b.days.map((d) => ({ id: d.id, dayNo: d.dayNo, label: d.label, count: d._count.words })) }));
}

/** 반 칩의 인원 = 이 선생님이 배정할 수 있는 학생 수 (학원장은 전체, 선생님은 담당 학생만) */
export async function loadComposeClasses(ctx: AcademyContext) {
  const classes = await prisma.classRoom.findMany({ where: { academyId: ctx.member.academyId, archived: false }, include: { _count: { select: { students: { where: { ...studentScope(ctx), status: "active" } } } } }, orderBy: { name: "asc" } });
  return classes.map((c) => ({ id: c.id, name: c.name, count: c._count.students }));
}
