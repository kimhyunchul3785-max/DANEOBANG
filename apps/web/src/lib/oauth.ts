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

/** emailVerified: 공급사가 이 이메일의 소유를 확인했는지. 검증된 이메일만 기존 계정에 자동으로 붙인다 */
export type OAuthProfile = { providerId: string; email: string | null; name: string; emailVerified: boolean };

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
    const j = (await me.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
    return { providerId: j.sub, email: j.email ?? null, name: j.name || j.email?.split("@")[0] || "사용자", emailVerified: j.email_verified === true };
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
    kakao_account?: { email?: string; is_email_valid?: boolean; is_email_verified?: boolean; profile?: { nickname?: string } };
  };
  return {
    providerId: String(j.id),
    email: j.kakao_account?.email ?? null,
    name: j.kakao_account?.profile?.nickname || "카카오 사용자",
    emailVerified: j.kakao_account?.is_email_valid === true && j.kakao_account?.is_email_verified === true,
  };
}

/**
 * OAuth 프로필 → 사용자. 처음이면 가입, 기존이면 로그인.
 *   1. 같은 (provider, providerId) 로그인 수단이 있으면 그 계정
 *   2. 공급사가 검증한 이메일이 기존 계정(이메일 가입 등)과 같으면 새 계정을 만들지 않고 로그인 수단만 붙인다
 *      (검증되지 않은 이메일로는 자동 병합하지 않는다 — 남의 이메일을 적어 계정을 가로채는 것 방지)
 *   3. 없으면 새 계정 + 로그인 수단. 검증 안 된 이메일이 이미 다른 계정에 쓰이면 내부용 주소로 만든다
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
  const placeholder = `${p}_${profile.providerId}@noemail.daneobang.local`;
  let email = (profile.email ?? placeholder).toLowerCase();
  const byEmail = profile.email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (byEmail) {
    if (profile.emailVerified) {
      await prisma.userIdentity.create({ data: { userId: byEmail.id, provider: p, providerId: profile.providerId, email: profile.email } });
      return byEmail;
    }
    email = placeholder; // 검증 안 된 이메일 — 기존 계정과 합치지 않고 별도 계정
  }
  return prisma.user.create({
    data: { email, name: profile.name, provider: p, providerId: profile.providerId, emailVerifiedAt: profile.email && profile.emailVerified ? new Date() : null, identities: { create: { provider: p, providerId: profile.providerId, email: profile.emailVerified ? profile.email : null } } },
  });
}
