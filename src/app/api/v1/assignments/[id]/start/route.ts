import { getCurrentUser } from "@/lib/auth";
import { startAttempt } from "@/lib/attempts";
import { handle, ok, fail } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    const attempt = await startAttempt(id, user.id);
    return ok({ attemptId: attempt.id, deadlineAt: attempt.deadlineAt });
  }, req);
}
