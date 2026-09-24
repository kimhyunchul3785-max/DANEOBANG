import { getAcademyContext } from "@/lib/auth";
import { handle, ok, fail, readJson } from "@/lib/api";
import { issueRetake, defaultRetakeDue } from "@/lib/retake";

/** 재시험 출제 (모바일 현장 처리): body { mode?: "wrong" | "same", days?: number } — 기본 오답만 · 3일 뒤 23:59 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const { id } = await params;
    const body = await readJson<{ mode?: string; days?: number }>(req).catch(() => ({}) as { mode?: string; days?: number });
    const mode = body.mode === "same" ? "same" : "wrong";
    let dueAt = defaultRetakeDue();
    if (typeof body.days === "number" && body.days >= 0 && body.days <= 60) {
      const l = new Date(Date.now() + 9 * 3600e3);
      dueAt = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + Math.round(body.days), 14, 59));
    }
    const r = await issueRetake(ctx, id, { mode, dueAt });
    if (!r.ok) return fail(422, "issue_failed", r.message);
    return ok({ examId: r.examId, questionCount: r.questionCount, dueAt });
  }, req);
}
