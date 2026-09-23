import { prisma } from "./db";
import { writeLog } from "./logger";

/**
 * 과금 — 계약·결제 주체는 Academy. 월 요금 = Teacher Seat 수 × 9,900원.
 * 결제 대행사(PG) 연동 전에는 provider="mock" 테스트 결제로 흐름만 검증한다.
 *   - 카드번호 끝이 0000 이면 실패, 그 외는 성공 (마지막 4자리를 저장).
 * 실제 PG(토스페이먼츠 등)를 붙일 때는 chargeCard() 만 provider 별로 바꾸면 된다.
 */
export const UNIT_PRICE = 9900;
export const MIN_SEATS = 1;
export const MAX_SEATS = 200;

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
export const monthly = (seats: number, unit = UNIT_PRICE) => seats * unit;

export function billingProvider() {
  return process.env.BILLING_PROVIDER || "mock";
}

/**
 * 결제 기능 켜짐 여부. 기본 꺼짐(BILLING_ENABLED 미설정) — 체험 기간에는 가입 단계에서 결제를 빼고
 * Seat 제한 없이 쓴다. 로직·화면은 그대로 두었으므로 .env 에 BILLING_ENABLED="true" 를 넣으면 전부 돌아온다.
 */
export function billingEnabled() {
  return process.env.BILLING_ENABLED === "true";
}
export const TRIAL_SEATS = 999;

export type CardInput = { number: string; expiry?: string; cvc?: string; holder?: string };
export type ChargeResult = { ok: true; ref: string; last4: string } | { ok: false; error: string };

/** 카드 결제 시도 (provider 별 구현) */
export async function chargeCard(input: CardInput, amount: number, memo: string): Promise<ChargeResult> {
  const digits = input.number.replace(/\D/g, "");
  if (digits.length < 12) return { ok: false, error: "카드 번호를 확인해주세요." };
  const last4 = digits.slice(-4);
  const provider = billingProvider();
  writeLog({ kind: "billing", event: "charge", detail: { provider, amount, memo, last4 } });
  if (provider === "mock") {
    await new Promise((r) => setTimeout(r, 300));
    if (last4 === "0000") return { ok: false, error: "카드사 승인 거절 (테스트: 끝자리 0000 은 항상 실패)" };
    return { ok: true, ref: `mock_${Date.now().toString(36)}`, last4 };
  }
  return { ok: false, error: `결제 대행사(${provider}) 연동이 아직 설정되지 않았습니다.` };
}

function nextMonth(from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/** 첫 결제: 구독 생성(또는 pending 구독 갱신) + Academy 활성화 */
export async function activateSubscription(academyId: string, seats: number, card: CardInput) {
  const amount = monthly(seats);
  const res = await chargeCard(card, amount, `first:${academyId}`);
  const now = new Date();
  const sub = await prisma.subscription.upsert({
    where: { academyId },
    update: res.ok
      ? { seatQuantity: seats, unitPrice: UNIT_PRICE, status: "active", provider: billingProvider(), providerSubscriptionId: res.ref, cardLast4: res.last4, currentPeriodStart: now, currentPeriodEnd: nextMonth(now), lastPaymentAt: now, lastPaymentError: null }
      : { seatQuantity: seats, unitPrice: UNIT_PRICE, status: "pending", lastPaymentError: res.error },
    create: res.ok
      ? { academyId, seatQuantity: seats, unitPrice: UNIT_PRICE, status: "active", provider: billingProvider(), providerSubscriptionId: res.ref, cardLast4: res.last4, currentPeriodStart: now, currentPeriodEnd: nextMonth(now), lastPaymentAt: now }
      : { academyId, seatQuantity: seats, unitPrice: UNIT_PRICE, status: "pending", provider: billingProvider(), lastPaymentError: res.error },
  });
  await prisma.payment.create({ data: { subscriptionId: sub.id, amount, seatQuantity: seats, status: res.ok ? "succeeded" : "failed", providerRef: res.ok ? res.ref : null, error: res.ok ? null : res.error } });
  if (res.ok) await prisma.academy.update({ where: { id: academyId }, data: { status: "active" } });
  return { ...res, subscription: sub, amount };
}

/** Seat 수 변경 (MVP: 즉시 반영, 늘릴 때 차액은 다음 결제에 합산 — PG 가 일할 계산을 지원하면 그때 적용) */
export async function changeSeatQuantity(academyId: string, seats: number) {
  const sub = await prisma.subscription.findUnique({ where: { academyId } });
  if (!sub) throw new Error("no_subscription");
  const updated = await prisma.subscription.update({ where: { academyId }, data: { seatQuantity: seats } });
  writeLog({ kind: "billing", event: "seats", detail: { academyId, from: sub.seatQuantity, to: seats } });
  return updated;
}

export function subscriptionLabel(status: string) {
  return (
    {
      active: ["badge-green", "정상"],
      pending: ["badge-amber", "결제 필요"],
      past_due: ["badge-red", "결제 실패"],
      canceled: ["badge-gray", "해지"],
    } as Record<string, [string, string]>
  )[status] ?? ["badge-gray", status];
}
