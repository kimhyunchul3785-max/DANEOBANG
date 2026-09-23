import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, upsertOAuthUser, type Provider } from "@/lib/oauth";
import { createWebSession, audit, landingAfterLogin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "kakao") return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  const p = provider as Provider;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = req.cookies.get("oauth_state")?.value;
  const [savedState, next] = (saved || "").split("|");
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", req.url));
  }
  try {
    const profile = await exchangeCode(p, code);
    const user = await upsertOAuthUser(p, profile);
    if (user.status !== "active") return NextResponse.redirect(new URL("/login?error=suspended", req.url));
    await createWebSession(user.id);
    await audit({ userId: user.id, action: "login", detail: p });
    const res = NextResponse.redirect(new URL(await landingAfterLogin(user.id, next), req.url));
    res.cookies.delete("oauth_state");
    return res;
  } catch (e) {
    console.error("oauth callback failed", e);
    return NextResponse.redirect(new URL(`/login?error=${p}_failed`, req.url));
  }
}
