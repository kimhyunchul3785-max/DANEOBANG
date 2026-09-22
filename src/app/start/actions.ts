"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, setAcademyCookie, audit } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/util";
import { appUrl } from "@/lib/oauth";
import { sendMail, verifyMail, mailConfigured } from "@/lib/mail";
import { activateSubscription, UNIT_PRICE, MIN_SEATS, MAX_SEATS } from "@/lib/billing";
import { SIGNUP_COOKIE, getSignupSession, finalizeAccount } from "@/lib/signup";
import { inviteTeachers } from "@/lib/invites";

export type { StartResult } from "@/lib/signup";
import type { StartResult } from "@/lib/signup";

const info = z.object({
  academyName: z.string().trim().min(2).max(40),
  representativeName: z.string().trim().min(1).max(30),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  region: z.string().trim().max(30).optional().or(z.literal("")),
  teacherCount: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
  ownerIsTeacher: z.enum(["yes", "no"]),
});

async function newSession() {
  const token = randomToken(24);
  const s = await prisma.signupSession.create({ data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3 * 86400e3) } });
  const c = await cookies();
  c.set(SIGNUP_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3 * 86400, secure: process.env.NODE_ENV === "production" });
  return s;
}

/** 위저드 ①~③ + ④ 계정. 로그인한 사용자는 그 계정으로 바로 학원을 만든다(인증 생략) */
export async function createAccountAction(form: FormData): Promise<StartResult> {
  const p = info.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, message: "학원명(2자 이상)·대표자명·선생님 수를 확인해주세요." };
  const d = p.data;
  const current = await getCurrentUser();
  const base = { academyName: d.academyName, representativeName: d.representativeName, phone: d.phone || null, region: d.region || null, teacherCount: d.teacherCount, ownerIsTeacher: d.ownerIsTeacher === "yes" };

  if (current) {
    const s = (await getSignupSession()) ?? (await newSession());
    await prisma.signupSession.update({ where: { id: s.id }, data: { ...base, ownerName: current.name, email: current.email, userId: current.id, verifiedAt: new Date(), step: 4 } });
    return finalizeAccount(s.id);
  }

  const acc = z.object({ ownerName: z.string().trim().min(1).max(40), email: z.string().trim().email(), password: z.string().min(6).max(100), password2: z.string() }).safeParse(Object.fromEntries(form));
  if (!acc.success) return { ok: false, message: "이름·이메일·비밀번호(6자 이상)를 확인해주세요." };
  if (acc.data.password !== acc.data.password2) return { ok: false, message: "비밀번호 확인이 일치하지 않습니다." };
  const email = acc.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, message: "이미 가입된 이메일입니다. 로그인한 뒤 학원을 시작해주세요." };
  const s = (await getSignupSession()) ?? (await newSession());
  const verifyToken = randomToken(24);
  await prisma.signupSession.update({
    where: { id: s.id },
    data: { ...base, ownerName: acc.data.ownerName, email, passwordHash: await bcrypt.hash(acc.data.password, 10), verifyTokenHash: hashToken(verifyToken), verifyTokenDev: mailConfigured() ? null : verifyToken, verifySentAt: new Date(), step: 4 },
  });
  const link = `${appUrl()}/start/verify/${verifyToken}`;
  const r = await sendMail({ to: email, ...verifyMail(link, d.academyName) });
  return { ok: true, step: 4, devLink: r.devLink, message: r.sent ? `${email} 로 인증 메일을 보냈습니다.` : r.error ? `메일 발송 실패: ${r.error}` : undefined };
}

export async function resendVerifyAction(): Promise<StartResult> {
  const s = await getSignupSession();
  if (!s || !s.email || s.verifiedAt) return { ok: false, message: "인증할 계정이 없습니다." };
  const verifyToken = randomToken(24);
  await prisma.signupSession.update({ where: { id: s.id }, data: { verifyTokenHash: hashToken(verifyToken), verifyTokenDev: mailConfigured() ? null : verifyToken, verifySentAt: new Date() } });
  const link = `${appUrl()}/start/verify/${verifyToken}`;
  const r = await sendMail({ to: s.email, ...verifyMail(link, s.academyName ?? "단어방") });
  return { ok: true, devLink: r.devLink, message: r.sent ? "인증 메일을 다시 보냈습니다." : r.error ? `메일 발송 실패: ${r.error}` : undefined };
}

/** ⑤ 결제 (첫 결제 또는 재시도). 성공 → Academy 활성화 */
export async function payAction(form: FormData): Promise<StartResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const academyId = String(form.get("academyId") ?? "");
  const member = await prisma.academyMember.findFirst({ where: { academyId, userId: user.id, role: "OWNER", status: "active" }, include: { academy: { include: { subscription: true } } } });
  if (!member) return { ok: false, message: "학원장만 결제할 수 있습니다." };
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, Number(form.get("seats") || member.academy.subscription?.seatQuantity || 1)));
  const card = { number: String(form.get("card") ?? ""), expiry: String(form.get("expiry") ?? ""), cvc: String(form.get("cvc") ?? ""), holder: String(form.get("holder") ?? "") };
  const r = await activateSubscription(academyId, seats, card);
  await audit({ academyId, userId: user.id, action: r.ok ? "billing.paid" : "billing.failed", detail: `${seats} seats · ${r.amount}원${r.ok ? "" : " · " + r.error}` });
  if (!r.ok) return { ok: false, message: `결제에 실패했습니다. ${r.error}` };
  const s = await getSignupSession();
  if (s && s.academyId === academyId) await prisma.signupSession.update({ where: { id: s.id }, data: { step: 6 } });
  return { ok: true, step: 6, message: `월 ${r.amount.toLocaleString("ko-KR")}원 결제가 완료되었습니다.` };
}

export async function wizardInviteAction(form: FormData): Promise<StartResult & { sent?: { email: string; devLink?: string }[] }> {
  const user = await getCurrentUser();
  const s = await getSignupSession();
  if (!user || !s?.academyId) return { ok: false, message: "가입 정보가 없습니다." };
  const emails = form.getAll("email").map(String);
  const r = await inviteTeachers(s.academyId, emails, user.id);
  return { ok: r.ok, message: r.message, sent: r.sent };
}

/** 위저드 종료 → 대시보드 */
export async function finishWizardAction() {
  const s = await getSignupSession();
  if (s) {
    await prisma.signupSession.update({ where: { id: s.id }, data: { step: 7, completedAt: new Date() } });
    if (s.academyId) await setAcademyCookie(s.academyId);
  }
  const c = await cookies();
  c.delete(SIGNUP_COOKIE);
  redirect("/app");
}

export async function restartWizardAction() {
  const c = await cookies();
  c.delete(SIGNUP_COOKIE);
  redirect("/start");
}
