import { NextRequest, NextResponse } from "next/server";
import { destroyWebSession } from "@/lib/auth";

/** 로그아웃. form 의 next 가 있으면 그 경로(사이트 내부)로 돌아간다 — QR 화면에서 "다른 계정으로 로그인" */
export async function POST(req: NextRequest) {
  await destroyWebSession();
  let next = "/";
  try {
    const form = await req.formData();
    const n = String(form.get("next") ?? "");
    if (n.startsWith("/") && !n.startsWith("//")) next = n.startsWith("/q/") || n.startsWith("/invite/") || n.startsWith("/join/") ? `/login?next=${encodeURIComponent(n)}` : n;
  } catch {
    /* no body */
  }
  return NextResponse.redirect(new URL(next, req.url), { status: 303 });
}
