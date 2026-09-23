import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";

/** 내 알림 (최근 30) · POST { ids?: string[] } → 읽음 처리 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
    return ok({ items, unread: items.filter((n) => !n.read).length });
  }, req);
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    await prisma.notification.updateMany({ where: { userId: user.id, ...(body.ids?.length ? { id: { in: body.ids } } : {}), read: false }, data: { read: true } });
    return ok({ ok: true });
  }, req);
}
