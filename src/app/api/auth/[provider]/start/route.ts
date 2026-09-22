import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, providerConfigured, type Provider } from "@/lib/oauth";
import { randomToken } from "@/lib/util";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "kakao") return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  const p = provider as Provider;
  if (!providerConfigured(p)) {
    return NextResponse.redirect(new URL(`/login?error=${p}_not_configured`, req.url));
  }
  const state = randomToken(16);
  const next = req.nextUrl.searchParams.get("next") || "/workspaces";
  const res = NextResponse.redirect(authorizeUrl(p, state));
  res.cookies.set("oauth_state", `${state}|${next}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
