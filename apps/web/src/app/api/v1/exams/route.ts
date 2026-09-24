import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";

/** 시험 목록 — 모바일 "현장 확인"용으로 진행 상태(웹 시험 탭과 같은 분류) · 완료/배정 · 공통 마감까지 */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const exams = await prisma.exam.findMany({
      where: { academyId: ctx.member.academyId },
      include: { book: { select: { title: true } }, assignments: { where: { student: studentScope(ctx) }, select: { status: true, dueAt: true, startAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const now = Date.now();
    return ok(
      exams.map((e) => {
        const as = e.assignments;
        const open = as.filter((a) => a.status !== "completed");
        const overdue = open.filter((a) => a.dueAt && a.dueAt.getTime() < now).length;
        const dues = [...new Set(open.map((a) => a.dueAt?.getTime() ?? 0))];
        const state =
          e.status === "draft" ? "draft" : e.status === "archived" ? "archived" : as.length === 0 ? "none" : as.every((a) => a.startAt && a.startAt.getTime() > now) ? "scheduled" : open.length === 0 ? "done" : overdue ? "overdue" : "open";
        return {
          id: e.id,
          title: e.title,
          book: e.book.title,
          questionCount: e.questionCount,
          passScore: e.passScore,
          status: e.status,
          isRetake: e.isRetake,
          answersReleased: e.answersReleased,
          assignments: as.length,
          completed: as.length - open.length,
          overdue,
          dueAt: dues.length === 1 && dues[0] ? new Date(dues[0]).toISOString() : null,
          state,
          createdAt: e.createdAt,
        };
      }),
    );
  }, req);
}
