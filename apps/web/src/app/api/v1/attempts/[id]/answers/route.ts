import { answersPatchSchema } from "@daneobang/validation";
import { getCurrentUser } from "@/lib/auth";
import { saveAnswers, ApiError } from "@/lib/attempts";
import { handle, ok, fail, readJson } from "@/lib/api";


export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    const parsed = answersPatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(422, "invalid_body");
    const r = await saveAnswers(id, user.id, parsed.data.expected_revision, parsed.data.answers.map((a) => ({ itemId: a.item_id, optionId: a.option_id })));
    return ok({ attempt_id: id, revision: r.revision, saved_at: r.savedAt });
  }, req);
}
