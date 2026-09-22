import { prisma } from "./db";
import { billingEnabled, TRIAL_SEATS } from "./billing";

/**
 * Teacher Seat 계산. Seat 는 별도 레코드가 아니라 숫자다.
 *   used     = 활성(status=active) 구성원 중 isTeacher
 *   pending  = 아직 수락하지 않은 선생님 초대 (Seat 를 예약한다)
 *   quantity = 구독에서 구매한 Seat 수
 * 초대·선생님 기능 켜기는 used + pending < quantity 일 때만, Seat 줄이기는 used + pending 이하로만.
 */
export type SeatUsage = { quantity: number; used: number; pending: number; available: number; unitPrice: number; monthly: number; status: string | null; unlimited: boolean };

export async function seatUsage(academyId: string): Promise<SeatUsage> {
  const [sub, used, pending] = await Promise.all([
    prisma.subscription.findUnique({ where: { academyId } }),
    prisma.academyMember.count({ where: { academyId, status: "active", isTeacher: true } }),
    prisma.invitation.count({ where: { academyId, isTeacher: true, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const unlimited = !billingEnabled();
  const quantity = unlimited ? TRIAL_SEATS : (sub?.seatQuantity ?? 0);
  const unitPrice = sub?.unitPrice ?? 9900;
  return { quantity, used, pending, available: Math.max(0, quantity - used - pending), unitPrice, monthly: unlimited ? 0 : quantity * unitPrice, status: sub?.status ?? null, unlimited };
}

/** 학원이 기능을 쓸 수 있는 상태인지 (결제 완료·정상) */
export function academyUsable(status: string) {
  return status === "active";
}
