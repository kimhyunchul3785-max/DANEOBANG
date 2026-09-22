import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { submitAttempt, ApiError } from "@/lib/attempts";
import { handle, ok, fail } from "@/lib/api";

const schema = z.object({ expected_revision: z.number().int().min(0).optional(), answers: z.array(z.object({ item_id: z.string(), option_id: z.string().nullable() })).max(500).optional() });

/** 최종 제출. 미전송 답안이 있으면 expected_revision 과 함께 원자적으로 저장 후 채점. 반복 제출은 기존 결과 반환. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    let final: { expectedRevision: number; answers: { itemId: string; optionId: string | null }[] } | undefined;
    const text = await req.text();
    if (text.trim()) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ApiError(422, "invalid_json");
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new ApiError(422, "invalid_body");
      if (parsed.data.answers?.length && parsed.data.expected_revision !== undefined) {
        final = { expectedRevision: parsed.data.expected_revision, answers: parsed.data.answers.map((a) => ({ itemId: a.item_id, optionId: a.option_id })) };
      }
    }
    const r = await submitAttempt(id, user.id, final);
    return ok({ attempt_id: id, graded: true, already_graded: r.alreadyGraded, expired: "expired" in r ? r.expired : false });
  }, req);
}
