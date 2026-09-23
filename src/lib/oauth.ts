import { prisma } from "./db";

export type Provider = "google" | "kakao";

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function providerConfigured(p: Provider) {
  if (p === "google") return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return !!process.env.KAKAO_CLIENT_ID;
}

export function redirectUri(p: Provider) {
  return `${appUrl()}/api/auth/callback/${p}`;
}

export function authorizeUrl(p: Provider, state: string) {
  if (p === "google") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    u.searchParams.set("redirect_uri", redirectUri(p));
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email profile");
    u.searchParams.set("state", state);
    u.searchParams.set("prompt", "select_account");
    return u.toString();
  }
  const u = new URL("https://kauth.kakao.com/oauth/authorize");
  u.searchParams.set("client_id", process.env.KAKAO_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri(p));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  u.searchParams.set("scope", "profile_nickname account_email");
  return u.toString();
}

export type OAuthProfile = { providerId: string; email: string | null; name: string };

export async function exchangeCode(p: Provider, code: string): Promise<OAuthProfile> {
  if (p === "google") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(p),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error("google_token_failed");
    const tok = (await res.json()) as { access_token: string };
    const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    if (!me.ok) throw new Error("google_userinfo_failed");
    const j = (await me.json()) as { sub: string; email?: string; name?: string };
    return { providerId: j.sub, email: j.email ?? null, name: j.name || j.email?.split("@")[0] || "사용자" };
  }
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_CLIENT_ID!,
    redirect_uri: redirectUri(p),
    code,
  };
  if (process.env.KAKAO_CLIENT_SECRET) body.client_secret = process.env.KAKAO_CLIENT_SECRET;
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error("kakao_token_failed");
  const tok = (await res.json()) as { access_token: string };
  const me = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  if (!me.ok) throw new Error("kakao_userinfo_failed");
  const j = (await me.json()) as {
    id: number;
    kakao_account?: { email?: string; profile?: { nickname?: string } };
  };
  return {
    providerId: String(j.id),
    email: j.kakao_account?.email ?? null,
    name: j.kakao_account?.profile?.nickname || "카카오 사용자",
  };
}

/**
 * OAuth 프로필 → 사용자. 처음이면 가입, 기존이면 로그인.
 *   1. 같은 (provider, providerId) 로그인 수단이 있으면 그 계정
 *   2. 같은 이메일의 기존 계정(이메일 가입 등)이 있으면 새 계정을 만들지 않고 로그인 수단만 붙인다
 *   3. 없으면 새 계정 + 로그인 수단
 */
export async function upsertOAuthUser(p: Provider, profile: OAuthProfile) {
  const idn = await prisma.userIdentity.findUnique({ where: { provider_providerId: { provider: p, providerId: profile.providerId } }, include: { user: true } });
  if (idn) return idn.user;
  // 구버전(User.provider/providerId 만 있던 시절) 호환
  const legacy = await prisma.user.findFirst({ where: { provider: p, providerId: profile.providerId } });
  if (legacy) {
    await prisma.userIdentity.create({ data: { userId: legacy.id, provider: p, providerId: profile.providerId, email: profile.email } });
    return legacy;
  }
  const email = (profile.email ?? `${p}_${profile.providerId}@noemail.daneobang.local`).toLowerCase();
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    await prisma.userIdentity.create({ data: { userId: byEmail.id, provider: p, providerId: profile.providerId, email: profile.email } });
    return byEmail;
  }
  return prisma.user.create({
    data: { email, name: profile.name, provider: p, providerId: profile.providerId, emailVerifiedAt: profile.email ? new Date() : null, identities: { create: { provider: p, providerId: profile.providerId, email: profile.email } } },
  });
}
