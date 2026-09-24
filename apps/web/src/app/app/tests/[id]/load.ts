import { prisma } from "@/lib/db";
import type { AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";

/** 시험 상세(진행 · 문항 · 대상) 세 페이지가 같이 쓰는 로딩 + 파생값 */
export async function loadExam(ctx: AcademyContext, id: string) {
  const exam = await prisma.exam.findFirst({
    where: { id, academyId: ctx.member.academyId },
    include: {
      book: true,
      scopes: true,
      forms: { orderBy: { version: "desc" }, include: { items: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } }, _count: { select: { assignments: true } } } },
      assignments: {
        where: { student: studentScope(ctx) },
        include: {
          student: { include: { classRoom: true } },
          form: { select: { version: true } },
          attempts: { orderBy: { attemptNo: "desc" }, include: { grades: { where: { current: true } }, prints: { where: { status: "active" }, include: { pages: true } } } },
        },
        orderBy: [{ student: { classId: "asc" } }, { student: { name: "asc" } }],
      },
    },
  });
  if (!exam) return null;
  const days = await prisma.bookDay.findMany({ where: { id: { in: exam.scopes.map((s) => s.dayId) } }, orderBy: { dayNo: "asc" } });
  const published = exam.forms.filter((f) => f.status === "published");
  const draft = exam.forms.find((f) => f.status === "draft");
  const now = new Date();
  const graded = exam.assignments.flatMap((a) => a.attempts.filter((t) => t.grades[0] && t.attemptNo === 1).map((t) => t.grades[0]));
  const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.score, 0) / graded.length) : null;
  const passRate = graded.length ? Math.round((graded.filter((g) => g.passed).length / graded.length) * 100) : null;
  const done = exam.assignments.filter((a) => a.status === "completed").length;
  const overdue = exam.assignments.filter((a) => a.dueAt && a.dueAt < now && a.status !== "completed").length;
  const prints = exam.assignments.flatMap((a) => a.attempts.flatMap((t) => t.prints)).length;
  // 공통 마감: 안 친 학생 기준, 모두 완료했으면 전체 기준
  const openOnes = exam.assignments.filter((a) => a.status !== "completed");
  const dueBase = openOnes.length ? openOnes : exam.assignments;
  const dueList = [...new Set(dueBase.map((a) => a.dueAt?.getTime() ?? 0))];
  const commonDue = dueList.length === 1 && dueList[0] ? new Date(dueList[0]) : null;
  const futureStarts = [...new Set(dueBase.filter((a) => a.startAt && a.startAt > now).map((a) => a.startAt!.getTime()))];
  const pastStarts = dueBase.filter((a) => !a.startAt || a.startAt <= now).map((a) => a.startAt?.getTime() ?? 0).filter(Boolean);
  const commonStart = futureStarts.length === 1 && futureStarts.length + (pastStarts.length ? 1 : 0) === 1 ? new Date(futureStarts[0]) : futureStarts.length === 0 && pastStarts.length ? new Date(Math.min(...pastStarts)) : null;
  const startPending = !!commonStart && commonStart > now;
  const startMixed = futureStarts.length > 1 || (futureStarts.length === 1 && pastStarts.length > 0);
  return { exam, days, published, draft, now, graded, avg, passRate, done, overdue, prints, openOnes, dueList, commonDue, commonStart, startPending, startMixed };
}
export type LoadedExam = NonNullable<Awaited<ReturnType<typeof loadExam>>>;

export const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16) : "");

/** 출제 대상 고르기용: 내 범위의 활성 학생 중 아직 대상이 아닌 학생을 반별로 (반 없음은 마지막) */
export async function loadPickGroups(ctx: AcademyContext, assignedIds: string[]) {
  const students = await prisma.student.findMany({ where: { ...studentScope(ctx), status: "active", id: { notIn: assignedIds } }, include: { classRoom: true }, orderBy: [{ name: "asc" }] });
  const map = new Map<string, { id: string; name: string; students: { id: string; name: string }[] }>();
  for (const s of students) {
    const key = s.classRoom?.id ?? "none";
    const g = map.get(key) ?? { id: key, name: s.classRoom?.name ?? "반 없음", students: [] };
    g.students.push({ id: s.id, name: s.name });
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : a.name.localeCompare(b.name, "ko")));
}
