"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payAction } from "./actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 결제 — 학원(Academy)이 결제 주체. 주문 내용 = Teacher Seat 수 × 9,900원.
 * 학원을 만든 직후(결제 대기)와 실패 후 재시도 둘 다 이 폼을 쓴다.
 */
export function PayForm({ academyId, academyName, seats, unitPrice, lastError, mock, onPaid }: { academyId: string; academyName: string; seats: number; unitPrice: number; lastError: string | null; mock: boolean; onPaid?: string }) {
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", holder: "" });
  const [err, setErr] = useState<string | null>(lastError);
  const [pending, start] = useTransition();
  const router = useRouter();
  const amount = seats * unitPrice;
  const submit = () => {
    setErr(null);
    const fd = new FormData();
    fd.set("academyId", academyId);
    fd.set("seats", String(seats));
    fd.set("card", card.number);
    fd.set("expiry", card.expiry);
    fd.set("cvc", card.cvc);
    fd.set("holder", card.holder);
    start(async () => {
      const r = await payAction(fd);
      if (!r.ok) return setErr(r.message ?? "결제에 실패했습니다.");
      if (onPaid) router.push(onPaid);
      else router.refresh();
    });
  };
  return (
    <section className="card card-body anim-fade-up" data-testid="pay-step">
      <div className="flex items-center justify-between">
        <div className="lbl">결제</div>
        <span className="digital">{academyName}</span>
      </div>
      <h1 className="h1 mt-1">결제하고 시작하기</h1>
      <div className="card-dark card-body mt-4">
        <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
          주문 내용 · 단어방 학원 플랜
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-[15px] font-semibold">선생님 {seats}명 플랜</div>
            <div className="text-[12.5px]" style={{ color: "rgba(236,233,227,0.7)" }}>
              {won(unitPrice)} × {seats}명 · 매월 자동 결제
            </div>
          </div>
          <div className="num-lg" data-testid="pay-amount">
            {won(amount)}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <div className="lbl">결제수단 · 카드</div>
        <label className="block">
          <span className="label">카드 번호</span>
          <input className="input" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} data-testid="card-number" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="label">유효기간</span>
            <input className="input" placeholder="MM/YY" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">CVC</span>
            <input className="input" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">소유자</span>
            <input className="input" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
          </label>
        </div>
        {mock && (
          <p className="muted" data-testid="mock-note">
            결제 대행사(PG) 연동 전 <b>테스트 결제</b>입니다. 아무 카드 번호나 승인되고, 끝자리 <code>0000</code>은 항상 실패합니다. 실제 결제는 <code>.env</code>의 <code>BILLING_PROVIDER</code>로 PG를 연결한 뒤 동작합니다.
          </p>
        )}
      </div>
      {err && (
        <div className="card-accent card-body mt-3 text-[13px]" data-testid="pay-error">
          {err}
        </div>
      )}
      <button type="button" className="btn-primary mt-4 w-full py-3" onClick={submit} disabled={pending || card.number.replace(/\D/g, "").length < 12} data-testid="pay">
        {pending ? "결제 중…" : `월 ${won(amount)} 결제하고 시작하기`}
      </button>
      <p className="muted mt-2 text-center">결제 정보는 학원에 연결됩니다. 학원장이 바뀌어도 학원 구독은 유지됩니다.</p>
    </section>
  );
}
