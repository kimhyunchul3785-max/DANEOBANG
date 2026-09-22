import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";

/** 교사용: 내가 속한 학원 목록. 이후 요청은 x-academy-id 헤더로 학원을 지정한다. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const m = await prisma.academyMember.findMany({ where: { userId: user.id, status: "active" }, include: { academy: { select: { id: true, name: true, slug: true, status: true } } } });
    return ok(m.map((x) => ({ ...x.academy, role: x.role })));
  }, req);
}
