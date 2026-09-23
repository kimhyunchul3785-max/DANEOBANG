import { prisma } from "./db";
import { audit } from "./auth";
import { hashToken, randomToken } from "./util";
import { appUrl } from "./oauth";
import { sendMail, teacherInviteMail } from "./mail";
import { seatUsage } from "./seats";

/** ⑥ 선생님 초대 (이메일 여러 개). 남은 Seat 범위 안에서만 */
export async function inviteTeachers(academyId: string, emails: string[], invitedBy: string): Promise<{ ok: boolean; message: string; sent: { email: string; devLink?: string }[] }> {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  if (!list.length) return { ok: false, message: "초대할 이메일을 입력해주세요.", sent: [] };
  const usage = await seatUsage(academyId);
  if (list.length > usage.available) return { ok: false, message: `사용 가능한 선생님 자리가 ${usage.available}명입니다. 현재 플랜 ${usage.quantity}명 — 요금제에서 선생님 수를 늘려주세요.`, sent: [] };
  const academy = await prisma.academy.findUnique({ where: { id: academyId }, select: { name: true } });
  const sent: { email: string; devLink?: string }[] = [];
  for (const email of list) {
    const already = await prisma.academyMember.findFirst({ where: { academyId, status: "active", user: { email } } });
    if (already) continue;
    const dup = await prisma.invitation.findFirst({ where: { academyId, email, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (dup) await prisma.invitation.update({ where: { id: dup.id }, data: { revokedAt: new Date() } });
    const token = randomToken(24);
    const inv = await prisma.invitation.create({ data: { academyId, role: "TEACHER", isTeacher: true, email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 86400e3), createdBy: invitedBy } });
    const link = `${appUrl()}/invite/${token}`;
    const r = await sendMail({ to: email, ...teacherInviteMail(link, academy?.name ?? "단어방") });
    sent.push({ email, devLink: r.devLink });
    await audit({ academyId, userId: invitedBy, action: "invitation.create", target: inv.id, detail: email });
  }
  return { ok: true, message: `${sent.length}명을 초대했습니다.`, sent };
}

