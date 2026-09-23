import { getCurrentUser } from "@/lib/auth";
import { getAttemptForStudent, attemptDTO } from "@/lib/attempts";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    return ok(attemptDTO(await getAttemptForStudent(id, user.id)));
  }, req);
}
