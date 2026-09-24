import { getAcademyContext } from "@/lib/auth";
import { handle, ok, fail, readJson } from "@/lib/api";
import { issueCombinedRetake, defaultRetakeDue } from "@/lib/retake";

/** 한 학생의 출제 전 재시험 여러 건 → 누적 오답 재시험 하나 (모바일 재시험 화면의 학생별 주 동작): body { taskIds: string[], days?: number } */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const body = await readJson<{ taskIds?: unknown; days?: number }>(req).catch(() => ({}) as { taskIds?: unknown; days?: number });
    const taskIds = Array.isArray(body.taskIds) ? body.taskIds.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
    if (!taskIds.length) return fail(400, "bad_request", "taskIds 가 필요합니다.");
    let dueAt = defaultRetakeDue();
    if (typeof body.days === "number" && body.days >= 0 && body.days <= 60) {
      const l = new Date(Date.now() + 9 * 3600e3);
      dueAt = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + Math.round(body.days), 14, 59));
    }
    const r = await issueCombinedRetake(ctx, taskIds, dueAt);
    if (!r.ok) return fail(422, "issue_failed", r.message);
    return ok({ examId: r.examId, questionCount: r.questionCount, dueAt, tasks: r.tasks ?? taskIds.length });
  }, req);
}
