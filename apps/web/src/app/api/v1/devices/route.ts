import { deviceRegisterSchema } from "@daneobang/validation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { handle, ok, fail, readJson } from "@/lib/api";

/** 모바일 푸시 토큰 등록 (Expo push token / FCM / APNs). 발송은 후속 범위. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const parsed = deviceRegisterSchema.safeParse(await readJson(req));
    if (!parsed.success) return fail(422, "invalid_body");
    await prisma.deviceToken.upsert({ where: { token: parsed.data.token }, update: { userId: user.id, platform: parsed.data.platform }, create: { userId: user.id, ...parsed.data } });
    return ok({ registered: true });
  }, req);
}
