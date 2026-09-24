import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail } from "@/lib/api";
import { parseJSON } from "@/lib/util";

/** 끝나지 않은 재시험 (출제 전 · 응시 대기) — 모바일 재시험 화면 */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId") ?? undefined;
    const tasks = await prisma.retakeTask.findMany({
      where: { student: studentScope(ctx), ...(studentId ? { studentId } : {}), status: { in: ["pending", "issued"] } },
      include: { student: { select: { id: true, name: true } }, sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { select: { exam: { select: { title: true, questionCount: true } } } } } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
    return ok(
      tasks.map((t) => {
        const g = t.sourceAttempt?.grades[0];
        const wrong = g ? parseJSON<{ correct: boolean }[]>(g.itemResults, []).filter((r) => !r.correct).length : parseJSON<string[]>(t.wordIds, []).length;
        return {
          id: t.id,
          student: t.student,
          title: t.sourceAttempt?.assignment.exam.title ?? "반복 오답 재시험",
          score: g ? Math.round(g.score) : null,
          wrong,
          sameCount: t.sourceAttempt?.assignment.exam.questionCount ?? wrong,
          issued: !!t.retakeExamId,
          dueAt: t.dueAt,
          createdAt: t.createdAt,
        };
      }),
    );
  }, req);
}
