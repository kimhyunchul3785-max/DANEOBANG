import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";

/** job 상태: progress·오류 코드만. 내부 payload 는 노출하지 않음 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const { id } = await params;
    const j = await prisma.job.findFirst({ where: { id, academyId: ctx.member.academyId } });
    if (!j) return fail(404, "not_found");
    return ok({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, error: j.error, updatedAt: j.updatedAt });
  }, req);
}
