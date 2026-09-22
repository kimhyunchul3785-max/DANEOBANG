import { getCurrentUser } from "@/lib/auth";
import { listStudentAssignments } from "@/lib/attempts";
import { handle, ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    return ok(await listStudentAssignments(user.id));
  }, req);
}
