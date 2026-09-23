import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { upsertOAuthUser, type OAuthProfile } from "@/lib/oauth";
import { handle, ok, fail, readJson } from "@/lib/api";
import { mobileOAuthSchema } from "@daneobang/validation";

/**
 * 모바일 OAuth: 앱이 Google/Kakao SDK 로 받은 access token 을 서버가 공급사에 검증한 뒤 단어방 토큰 발급.
 * 공급사 토큰을 세션으로 쓰지 않는다.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const parsed = mobileOAuthSchema.safeParse(await readJson(req));
    if (!parsed.success) return fail(422, "bad_request", "provider(google|kakao) 와 accessToken 이 필요합니다.");
    const body = parsed.data;
    let profile: OAuthProfile;
    if (body.provider === "google") {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${body.accessToken}` } });
      if (!r.ok) return fail(401, "provider_token_invalid");
      const j = (await r.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
      profile = { providerId: j.sub, email: j.email ?? null, name: j.name || "사용자", emailVerified: j.email_verified === true };
    } else {
      const r = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { authorization: `Bearer ${body.accessToken}` } });
      if (!r.ok) return fail(401, "provider_token_invalid");
      const j = (await r.json()) as { id: number; kakao_account?: { email?: string; is_email_valid?: boolean; is_email_verified?: boolean; profile?: { nickname?: string } } };
      profile = { providerId: String(j.id), email: j.kakao_account?.email ?? null, name: j.kakao_account?.profile?.nickname || "카카오 사용자", emailVerified: j.kakao_account?.is_email_valid === true && j.kakao_account?.is_email_verified === true };
    }
    const user = await upsertOAuthUser(body.provider, profile);
    if (user.status !== "active") return fail(403, "suspended");
    await prisma.auditLog.create({ data: { userId: user.id, action: "login", detail: `mobile:${body.provider}` } });
    const token = await signToken(user.id, "mobile", "30d");
    return ok({ token, user: { id: user.id, name: user.name, email: user.email } });
  }, req);
}
