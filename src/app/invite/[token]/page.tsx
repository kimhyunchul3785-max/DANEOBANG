import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { userMatchesEmail } from "@/lib/onboarding";
import { Logo } from "@/components/Logo";
import { AcceptInvite } from "./AcceptInvite";

/**
 * 선생님 초대 링크. 로그인(Google/Kakao) → 초대 이메일과 같은 계정인지 확인 → "OO학원에 참여하시겠어요?" → 참여 → /app
 * 계정을 새로 만드는 화면은 없다. 초대는 7일·1회·취소 가능.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { academy: { select: { name: true, status: true } } } });
  const user = await getCurrentUser();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-6">
      <div className="mb-8 flex items-center justify-between">
        <Logo height={20} />
        <span className="digital">INVITE</span>
      </div>
      {children}
    </main>
  );
  const fail = (title: string, body: string) =>
    shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>
          Invalid
        </div>
        <h1 className="h1 mt-1">{title}</h1>
        <p className="muted mt-2">{body}</p>
        <Link href={user ? "/switch" : "/login"} className="btn-secondary mt-5">
          {user ? "계정 전환" : "로그인"}
        </Link>
      </div>,
    );
  if (!inv) return fail("유효하지 않은 초대입니다", "링크가 잘못되었습니다. 학원장에게 다시 요청하세요.");
  if (inv.usedAt) return fail("이미 수락한 초대입니다", "로그인하면 학원에 들어갈 수 있습니다.");
  if (inv.revokedAt || inv.expiresAt < new Date()) return fail("만료된 초대입니다", "초대는 7일간 유효합니다. 학원장에게 재발급을 요청하세요.");
  const wrongUser = user && inv.email ? !(await userMatchesEmail(user, inv.email)) : false;
  return shell(
    <>
      <div className="card-dark card-body mb-3 anim-fade-up">
        <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
          {inv.academy.name}
        </div>
        <h1 className="mt-1 text-[20px] font-semibold">선생님으로 초대되었습니다</h1>
        <p className="mt-1 text-[13px]" style={{ color: "rgba(236,233,227,0.75)" }}>
          {inv.email ? `${inv.email} 계정으로 로그인해 참여하세요` : "로그인하면 바로 참여할 수 있습니다"}
        </p>
      </div>
      {!user ? (
        <div className="card card-body anim-fade-up" style={{ animationDelay: "60ms" }}>
          <p className="text-[14px]">Google 또는 카카오로 로그인하면 {inv.academy.name}에 참여됩니다.</p>
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="btn-primary mt-4 w-full py-3" data-testid="invite-login">
            로그인하고 참여하기
          </Link>
        </div>
      ) : wrongUser ? (
        <div className="card card-body anim-fade-up" style={{ animationDelay: "60ms" }}>
          <p className="text-[14px]">
            이 초대는 <b>{inv.email}</b> 전용입니다. 지금은 <b>{user.email}</b> 로 로그인되어 있습니다.
          </p>
          <form action="/api/auth/logout" method="post" className="mt-4">
            <input type="hidden" name="next" value={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} />
            <button className="btn-primary w-full py-3">로그아웃하고 다시 열기</button>
          </form>
        </div>
      ) : (
        <AcceptInvite token={token} academyName={inv.academy.name} userName={user.name} />
      )}
    </>,
  );
}
