import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, landingAfterLogin } from "@/lib/auth";

/**
 * 이미 로그인된 사용자가 /login 을 열었을 때 "있어야 할 곳"으로 보낸다.
 * landingAfterLogin 은 자리가 하나뿐이면 학원/학생 쿠키를 굽는데, 쿠키 쓰기는 Route Handler·Server Action 에서만 되므로
 * 페이지(Server Component)가 직접 부르지 않고 여기로 돌린다 (이전엔 자리 1개 계정이 /login 재방문 시 500).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const next = req.nextUrl.searchParams.get("next");
  if (!user) return NextResponse.redirect(new URL(next ? `/login?next=${encodeURIComponent(next)}` : "/login", req.url), { status: 303 });
  const to = await landingAfterLogin(user.id, next);
  return NextResponse.redirect(new URL(to, req.url), { status: 303 });
}
