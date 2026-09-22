import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/util";
import { finalizeAccount } from "@/lib/signup";
import { appUrl } from "@/lib/oauth";

/**
 * 인증 메일의 링크 (Route Handler — 쿠키를 설정해야 하므로 페이지가 아니다).
 * 유효하면 계정·학원(결제 대기)을 만들고 로그인시킨 뒤 /start (⑤ 결제) 로 보낸다.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const to = (q: string) => NextResponse.redirect(`${appUrl()}/start${q}`);
  const s = await prisma.signupSession.findUnique({ where: { verifyTokenHash: hashToken(token) } });
  if (!s) return to("?verify=invalid");
  if (s.expiresAt < new Date() || (s.verifySentAt && Date.now() - s.verifySentAt.getTime() > 24 * 3600e3)) return to("?verify=expired");
  if (s.academyId) return to("");
  const r = await finalizeAccount(s.id);
  if (!r.ok) return to(`?verify=failed&reason=${encodeURIComponent(r.message ?? "")}`);
  return to("?verified=1");
}
