import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveAnswers, ApiError } from "@/lib/attempts";
import { handle, ok, fail, readJson } from "@/lib/api";

const schema = z.object({ client_request_id: z.string().optional(), expected_revision: z.number().int().min(0), answers: z.array(z.object({ item_id: z.string(), option_id: z.string().nullable() })).max(500) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(422, "invalid_body");
    const r = await saveAnswers(id, user.id, parsed.data.expected_revision, parsed.data.answers.map((a) => ({ itemId: a.item_id, optionId: a.option_id })));
    return ok({ attempt_id: id, revision: r.revision, saved_at: r.savedAt });
  }, req);
}
