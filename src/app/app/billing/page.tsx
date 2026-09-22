import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { seatUsage } from "@/lib/seats";
import { billingProvider, billingEnabled, won, subscriptionLabel } from "@/lib/billing";
import { fmtDate } from "@/lib/util";
import { CountUp } from "@/components/Motion";
import { ActionButton } from "@/components/ActionForm";
import { PayForm } from "@/app/start/PayForm";
import { SeatControl } from "./SeatControl";
import { setOwnerTeacherAction } from "./actions";

/**
 * 요금제 및 결제 — 학원장 전용.
 * 결제 대기면 결제 폼, 정상이면 플랜·이용 현황·선생님 수 변경·원장 선생님 기능·결제 내역.
 */
export default async function BillingPage() {
  const ctx = await requireOwner();
  const academyId = ctx.member.academyId;
  const [sub, usage, payments] = await Promise.all([
    prisma.subscription.findUnique({ where: { academyId } }),
    seatUsage(academyId),
    prisma.payment.findMany({ where: { subscription: { academyId } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const status = ctx.member.academy.status;
  if (!billingEnabled()) {
    return (
      <div className="mx-auto max-w-[560px]">
        <div className="kicker">Billing · 요금제 및 결제</div>
        <h1 className="h1 mt-1 mb-3">체험 기간 · 결제 준비 중</h1>
        <div className="card card-body text-[14px]">
          <p>지금은 결제 없이 모든 기능을 쓸 수 있습니다. 선생님 수 제한도 없습니다.</p>
          <p className="muted mt-2">
            서비스화할 때 <code>.env</code>에 <code>BILLING_ENABLED=&quot;true&quot;</code>를 넣으면 가입 단계의 선생님 수·결제, 요금제 화면, Seat 제한이 그대로 켜집니다 (선생님 1명당 월 {won(9900)}). 현재 선생님 {usage.used}명{usage.pending ? ` · 초대 대기 ${usage.pending}` : ""}.
          </p>
        </div>
      </div>
    );
  }
  const needsPayment = status === "pending_payment" || status === "past_due" || !sub || sub.status === "pending" || sub.status === "past_due";

  if (needsPayment) {
    return (
      <div className="mx-auto max-w-[560px]">
        <div className="kicker">Billing · 요금제 및 결제</div>
        <h1 className="h1 mt-1 mb-4">결제를 완료해주세요</h1>
        <p className="muted mb-4">결제 전에는 선생님 초대·학생 등록·단어시험을 사용할 수 없습니다. 데이터는 그대로 보관됩니다.</p>
        <PayForm academyId={academyId} academyName={ctx.member.academy.name} seats={sub?.seatQuantity ?? 1} unitPrice={sub?.unitPrice ?? 9900} lastError={sub?.lastPaymentError ?? null} mock={billingProvider() === "mock"} onPaid="/app" />
      </div>
    );
  }
  const [cls, label] = subscriptionLabel(sub.status);
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Billing · 요금제 및 결제</div>
          <h1 className="h1 mt-1">선생님 {sub.seatQuantity}명 플랜</h1>
          <p className="muted mt-1">결제 주체는 학원입니다. 선생님 개인에게는 결제를 요구하지 않습니다.</p>
        </div>
        <span className={cls}>{label}</span>
      </header>

      <div className="bento">
        <section className="card-dark span-2 card-body">
          <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
            월 이용료
          </div>
          <div className="num-xl mt-2 whitespace-nowrap" style={{ fontSize: "clamp(36px, 4.2vw, 56px)" }} data-testid="monthly">
            <CountUp value={usage.monthly} />
            <span className="lbl ml-1" style={{ color: "rgba(236,233,227,0.7)" }}>
              원 / 월
            </span>
          </div>
          <div className="mt-1 text-[12.5px]" style={{ color: "rgba(236,233,227,0.75)" }}>
            {won(sub.unitPrice)} × 선생님 {sub.seatQuantity}명
          </div>
          <div className="mt-4 text-[12.5px]" style={{ color: "rgba(236,233,227,0.75)" }}>
            다음 결제일 {sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd, false) : "—"}
            {sub.cardLast4 ? ` · 카드 ****${sub.cardLast4}` : ""}
          </div>
        </section>

        <section className="card span-2 card-body">
          <div className="lbl">이용 중인 선생님</div>
          <div className="num-xl mt-2" data-testid="seat-usage">
            {usage.used}
            <span style={{ color: "var(--ink-3)" }}>/{usage.quantity}</span>
          </div>
          <div className="muted mt-1">
            {usage.pending ? `초대 대기 ${usage.pending}명 · ` : ""}
            추가 가능 {usage.available}명
          </div>
          <Link href="/app/teachers" className="btn-secondary btn-sm mt-4">
            선생님 관리 →
          </Link>
        </section>

        <section className="card span-2 card-body">
          <div className="lbl">내 계정 · 선생님 기능</div>
          <div className="mt-2 text-[15px] font-semibold">{ctx.member.isTeacher ? "원장 + 선생님 (자리 1개 사용)" : "원장 · 관리만 (자리 사용 안 함)"}</div>
          <p className="muted mt-1">{ctx.member.isTeacher ? "끄면 자리가 하나 비지만 구매한 자리 수와 결제는 그대로입니다." : "직접 수업을 시작하면 켜세요. 빈 자리가 없으면 1자리를 추가합니다."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ctx.member.isTeacher ? (
              <ActionButton action={setOwnerTeacherAction.bind(null, false, false)} className="btn-secondary btn-sm" confirm="선생님 기능을 끌까요? 담당 학생과 출제는 유지되지만 선생님 화면에서 빠집니다.">
                선생님 기능 끄기
              </ActionButton>
            ) : usage.available > 0 ? (
              <ActionButton action={setOwnerTeacherAction.bind(null, true, false)} className="btn-primary btn-sm">
                선생님 기능 사용
              </ActionButton>
            ) : (
              <ActionButton action={setOwnerTeacherAction.bind(null, true, true)} className="btn-primary btn-sm" confirm={`빈 자리가 없습니다. ${usage.quantity + 1}명 / 월 ${won((usage.quantity + 1) * usage.unitPrice)}로 1명 추가하고 사용할까요?`}>
                1명 추가하고 사용하기
              </ActionButton>
            )}
          </div>
        </section>

        <section className="card span-3 card-body">
          <div className="lbl">선생님 수 변경</div>
          <SeatControl quantity={usage.quantity} minimum={usage.used + usage.pending} unitPrice={usage.unitPrice} />
        </section>

        <section className="card span-3 card-body">
          <div className="lbl mb-2">결제 내역</div>
          {payments.length === 0 ? (
            <p className="muted">결제 내역이 없습니다.</p>
          ) : (
            <ul>
              {payments.map((p) => (
                <li key={p.id} className="row">
                  <span className="text-[13px]">
                    {fmtDate(p.createdAt)} · 선생님 {p.seatQuantity}명
                    {p.error && <span className="muted"> · {p.error}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num-md" style={{ fontSize: 18 }}>
                      {won(p.amount)}
                    </span>
                    <span className={p.status === "succeeded" ? "badge-green" : "badge-red"}>{p.status === "succeeded" ? "완료" : "실패"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {billingProvider() === "mock" && <p className="muted mt-3">PG 연동 전 테스트 결제 모드입니다. 실제 카드 청구는 일어나지 않습니다.</p>}
        </section>
      </div>
    </div>
  );
}
