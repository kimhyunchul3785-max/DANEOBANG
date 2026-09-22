import { getCurrentUser } from "@/lib/auth";
import { attemptResultForStudent } from "@/lib/attempts";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { id } = await params;
    return ok(await attemptResultForStudent(id, user.id));
  }, req);
}
