"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOwner, audit } from "@/lib/auth";
import { seatUsage } from "@/lib/seats";
import { changeSeatQuantity, MIN_SEATS, MAX_SEATS, won } from "@/lib/billing";
import type { ActionResult } from "../students/actions";

/** Seat 수 변경. 늘리기는 즉시, 줄이기는 활성 선생님 + 초대 대기 이하로만 */
export async function changeSeatsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireOwner();
  const academyId = ctx.member.academyId;
  const seats = Math.round(Number(form.get("seats")));
  if (!Number.isFinite(seats) || seats < MIN_SEATS || seats > MAX_SEATS) return { ok: false, message: `선생님 수는 ${MIN_SEATS}~${MAX_SEATS}명 사이여야 합니다.` };
  const usage = await seatUsage(academyId);
  if (seats === usage.quantity) return { ok: false, message: "변경 사항이 없습니다." };
  if (seats < usage.used + usage.pending) {
    return { ok: false, message: `현재 활성 선생님이 ${usage.used}명${usage.pending ? ` (초대 대기 ${usage.pending}명 포함 ${usage.used + usage.pending}명)` : ""}입니다. 선생님을 접근 중지한 후 자리를 줄여주세요.` };
  }
  const sub = await changeSeatQuantity(academyId, seats);
  await audit({ academyId, userId: ctx.user.id, action: "billing.seats", detail: `${usage.quantity} → ${seats}` });
  revalidatePath("/app/billing");
  revalidatePath("/app/teachers");
  return { ok: true, message: `선생님 ${seats}명 플랜 · 월 ${won(sub.seatQuantity * sub.unitPrice)}으로 바꿨습니다.${seats > usage.quantity ? " 늘어난 자리는 바로 사용할 수 있습니다." : ""}` };
}

/** 원장 본인의 선생님 기능 켜기/끄기. 켤 때 빈 자리가 없으면 addSeat=true 로 1자리 추가 */
export async function setOwnerTeacherAction(on: boolean, addSeat: boolean): Promise<ActionResult> {
  const ctx = await requireOwner();
  const academyId = ctx.member.academyId;
  if (ctx.member.isTeacher === on) return { ok: true };
  if (on) {
    const usage = await seatUsage(academyId);
    if (usage.available <= 0) {
      if (!addSeat) return { ok: false, message: `빈 선생님 자리가 없습니다. 현재 ${usage.quantity}명 / 월 ${won(usage.monthly)} → ${usage.quantity + 1}명 / 월 ${won((usage.quantity + 1) * usage.unitPrice)}로 늘리면 사용할 수 있습니다.` };
      await changeSeatQuantity(academyId, usage.quantity + 1);
      await audit({ academyId, userId: ctx.user.id, action: "billing.seats", detail: `${usage.quantity} → ${usage.quantity + 1} (owner teacher)` });
    }
  }
  await prisma.academyMember.update({ where: { id: ctx.member.id }, data: { isTeacher: on } });
  await audit({ academyId, userId: ctx.user.id, action: "member.teacher", target: ctx.member.id, detail: on ? "on" : "off" });
  revalidatePath("/app/billing");
  revalidatePath("/app/teachers");
  revalidatePath("/app");
  return { ok: true, message: on ? "선생님 기능을 켰습니다. 학생 담당·출제가 가능합니다." : "선생님 기능을 껐습니다. 자리 하나가 비었습니다 (구매 자리 수는 그대로)." };
}
