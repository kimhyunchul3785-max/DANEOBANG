"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, createWebSession, setAcademyCookie, audit } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { seatUsage } from "@/lib/seats";

/**
 * 초대 수락: (계정 없음) 이름·비밀번호로 계정 생성 → 구성원 ACTIVE / (로그인 상태) 바로 구성원 ACTIVE.
 * 초대는 이미 Seat 를 예약하고 있으므로 수락 시 used+1, pending-1 로 총합은 그대로다.
 */
export async function acceptInviteAction(form: FormData): Promise<{ ok: boolean; message?: string; redirectTo?: string }> {
  const token = String(form.get("token") ?? "");
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv) return { ok: false, message: "유효하지 않은 초대입니다." };
  if (inv.usedAt) return { ok: false, message: "이미 수락한 초대입니다." };
  if (inv.revokedAt || inv.expiresAt < new Date()) return { ok: false, message: "만료된 초대입니다." };
  const current = await getCurrentUser();
  let userId = current?.id ?? null;
  if (current && inv.email && current.email.toLowerCase() !== inv.email) return { ok: false, message: `이 초대는 ${inv.email} 전용입니다.` };
  if (!userId) {
    if (!inv.email) return { ok: false, message: "로그인 후 수락할 수 있는 초대입니다." };
    const existing = await prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) return { ok: false, message: "이미 계정이 있는 이메일입니다. 로그인한 뒤 링크를 다시 열어주세요." };
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!name || password.length < 6) return { ok: false, message: "이름과 비밀번호(6자 이상)를 입력해주세요." };
    const u = await prisma.user.create({ data: { email: inv.email, name, provider: "email", passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() } });
    userId = u.id;
  }
  // Seat 확인: 이 초대가 예약한 자리를 포함해도 초과하면 거절 (그 사이 Seat 가 줄었을 수 있음)
  if (inv.isTeacher) {
    const usage = await seatUsage(inv.academyId);
    if (usage.used + usage.pending > usage.quantity) return { ok: false, message: "학원의 선생님 자리가 부족합니다. 학원장에게 요금제에서 자리를 늘려 달라고 요청하세요." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { id: inv.id } });
      if (!fresh || fresh.usedAt) throw new Error("used");
      await tx.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
      await tx.academyMember.upsert({
        where: { academyId_userId: { academyId: inv.academyId, userId: userId! } },
        update: { status: "active", isTeacher: inv.isTeacher, role: inv.role },
        create: { academyId: inv.academyId, userId: userId!, role: inv.role, isTeacher: inv.isTeacher, status: "active" },
      });
    });
  } catch {
    return { ok: false, message: "초대를 처리하지 못했습니다. 다시 시도해주세요." };
  }
  if (!current) await createWebSession(userId!);
  await setAcademyCookie(inv.academyId);
  await audit({ academyId: inv.academyId, userId, action: "invitation.accept", target: inv.id, detail: inv.email ?? undefined });
  // 쿠키(세션·학원)를 막 설정했으므로 클라이언트 router.push 대신 서버 리다이렉트 (재렌더와의 경쟁 방지)
  redirect("/app");
}
