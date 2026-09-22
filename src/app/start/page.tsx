import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSignupSession } from "@/lib/signup";
import { seatUsage } from "@/lib/seats";
import { mailConfigured } from "@/lib/mail";
import { billingProvider, billingEnabled } from "@/lib/billing";
import { appUrl } from "@/lib/oauth";
import { Logo } from "@/components/Logo";
import { Wizard } from "./Wizard";
import { VerifyStep } from "./VerifyStep";
import { PayForm } from "./PayForm";
import { InviteStep } from "./InviteStep";
import { StepBar } from "./StepBar";

/**
 * 학원 시작하기 — B2B 가입 6단계.
 * ① 학원 정보 → ② 선생님 수(월 요금 즉시 계산) → ③ 원장도 수업하는지 → ④ 관리자 계정(이메일 인증) → ⑤ 결제 → ⑥ 선생님 초대 → 대시보드
 * 진행 상태는 가입 세션(쿠키) 또는 로그인한 사용자의 학원 상태로 판단하므로, 인증 메일을 다른 브라우저에서 열어도 이어진다.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ verify?: string; reason?: string; verified?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const s = await getSignupSession();
  const billing = billingEnabled();
  const verifyNotice =
    sp.verify === "invalid" ? "인증 링크가 잘못되었거나 이미 사용되었습니다." : sp.verify === "expired" ? "인증 링크가 만료되었습니다(24시간). 아래에서 다시 보내주세요." : sp.verify === "failed" ? `가입을 마치지 못했습니다. ${sp.reason ?? ""}` : null;
  const shell = (step: number | null, children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <Logo height={20} />
        <Link href={user ? "/workspaces" : "/login"} className="lbl-ink">
          {user ? "내 학원" : "이미 사용 중이신가요? 로그인"}
        </Link>
      </div>
      {step !== null && <StepBar step={step} billing={billing} />}
      {verifyNotice && (
        <div className="card-accent card-body mb-3 text-[13px]" data-testid="verify-notice">
          {verifyNotice}
        </div>
      )}
      {children}
    </main>
  );

  // 결제 대기 학원이 있는 원장 → ⑤ 결제
  if (user) {
    const pending = billing ? await prisma.academyMember.findFirst({ where: { userId: user.id, role: "OWNER", status: "active", academy: { status: "pending_payment" } }, include: { academy: { include: { subscription: true } } }, orderBy: { createdAt: "desc" } }) : null;
    if (pending) {
      const sub = pending.academy.subscription;
      return shell(5, <PayForm academyId={pending.academyId} academyName={pending.academy.name} seats={sub?.seatQuantity ?? 1} unitPrice={sub?.unitPrice ?? 9900} lastError={sub?.lastPaymentError ?? null} mock={billingProvider() === "mock"} />);
    }
    // 결제는 끝났고 초대 단계가 남은 가입 세션 → ⑥
    const session = s?.userId === user.id ? s : await prisma.signupSession.findFirst({ where: { userId: user.id, completedAt: null, academyId: { not: null } }, orderBy: { createdAt: "desc" } });
    if (session?.academyId && !session.completedAt) {
      const academy = await prisma.academy.findUnique({ where: { id: session.academyId }, select: { name: true, status: true } });
      if (academy?.status === "active") {
        const usage = await seatUsage(session.academyId);
        return shell(billing ? 6 : 4, <InviteStep academyName={academy.name} usage={usage} mailOn={mailConfigured()} />);
      }
    }
  }

  // 계정 만들고 인증 대기 중 → ④ 인증
  if (s && s.step === 4 && s.email && !s.verifiedAt) {
    return shell(billing ? 4 : 3, <VerifyStep email={s.email} academyName={s.academyName ?? ""} mailOn={mailConfigured()} devLink={!mailConfigured() && s.verifyTokenDev ? `${appUrl()}/start/verify/${s.verifyTokenDev}` : undefined} />);
  }
  if (s?.academyId && !user) redirect(`/login?next=/start`);

  return shell(null, <Wizard loggedIn={user ? { name: user.name, email: user.email } : null} mailOn={mailConfigured()} billing={billing} />);
}
