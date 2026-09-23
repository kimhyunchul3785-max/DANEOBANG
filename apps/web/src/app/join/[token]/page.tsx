import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { linkByToken, acceptTeacherInvite } from "@/lib/onboarding";
import { Logo } from "@/components/Logo";

/**
 * 학생 초대 링크 (/join/<token>): 로그인(Google/Kakao) → 그 계정에 학생 명단을 바로 연결 → /learn.
 * 토큰이 곧 본인 확인이므로 선생님 승인이 없다. 선생님 초대 링크(구버전 /join)가 오면 초대 수락으로 처리한다.
 */
export default async function JoinTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = hashToken(token);
  const user = await getCurrentUser();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-6">
      <div className="mb-8 flex items-center justify-between">
        <Logo height={20} />
        <span className="digital">STUDENT</span>
      </div>
      {children}
    </main>
  );
  const student = await prisma.student.findUnique({ where: { inviteTokenHash: h }, include: { academy: { select: { name: true } }, classRoom: { select: { name: true } } } });
  if (!student) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: h } });
    if (inv) {
      if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      const r = await acceptTeacherInvite(user, token);
      if (r.ok) redirect("/app");
      return shell(
        <div className="card card-body">
          <h1 className="h1 mb-3">참여할 수 없습니다</h1>
          <p className="muted mb-6">{r.message}</p>
          <Link href="/switch" className="btn-primary">계정 전환</Link>
        </div>,
      );
    }
    return shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>
          Invalid
        </div>
        <h1 className="h1 mt-1">유효하지 않은 링크입니다</h1>
        <p className="muted mt-2">링크가 잘못되었거나 이미 사용되었습니다. 선생님에게 다시 요청하세요.</p>
      </div>,
    );
  }
  if (!user)
    return shell(
      <>
        <div className="card-accent card-body mb-3 anim-fade-up">
          <div className="lbl-on">{student.academy.name}</div>
          <h1 className="mt-1 text-[22px] font-semibold">{student.name}</h1>
          <p className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
            {[student.school, student.grade, student.classRoom?.name].filter(Boolean).join(" · ") || "학생"}
          </p>
        </div>
        <div className="card card-body anim-fade-up" style={{ animationDelay: "60ms" }}>
          <p className="text-[14px]">Google 또는 카카오로 로그인하면 바로 연결됩니다.</p>
          <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="btn-primary mt-4 w-full py-3" data-testid="join-login">
            로그인하고 연결하기
          </Link>
        </div>
      </>,
    );
  const r = await linkByToken(user, token);
  if (r.ok) redirect("/learn");
  return shell(
    <div className="card card-body">
      <div className="lbl" style={{ color: "var(--accent)" }}>
        {r.redirectTo ? "Linked" : "Invalid"}
      </div>
      <h1 className="h1 mt-1">{r.redirectTo ? "이미 연결되어 있습니다" : "연결할 수 없습니다"}</h1>
      <p className="muted mt-2">{r.message}</p>
      <Link href={r.redirectTo ?? "/switch"} className="btn-primary mt-5">
        {r.redirectTo ? "내 시험으로" : "계정 전환"}
      </Link>
    </div>,
  );
}
