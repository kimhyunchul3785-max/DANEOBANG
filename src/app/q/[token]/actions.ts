"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { findPrintPage } from "@/lib/paper";
import { audit, createWebSession, getCurrentUser } from "@/lib/auth";

const secret = () => process.env.SESSION_SECRET || "dev-insecure-secret-change-me-please-32chars";
export async function qrCookieName(token: string) {
  return `q_${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}
export async function qrCookieValue(token: string) {
  return crypto.createHmac("sha256", secret()).update(`qr:${token}`).digest("hex");
}

/** QR 페이지 비밀번호 확인: 시험지 주인 학생의 계정 비밀번호 → 2시간짜리 열람 쿠키 */
export async function verifyQrPasswordAction(token: string, _prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const password = String(form.get("password") ?? "");
  const page = await findPrintPage(token);
  if (!page) return { error: "등록되지 않은 시험지입니다." };
  const user = page.print.attempt.assignment.student.user;
  if (!user?.passwordHash) return { error: "이 학생은 아직 계정이 연결되지 않았습니다. 선생님에게 초대 링크를 받아 가입해 주세요." };
  const okPw = await bcrypt.compare(password, user.passwordHash);
  if (!okPw) {
    await audit({ action: "qr.password_failed", target: token.slice(0, 6) });
    return { error: "비밀번호가 맞지 않습니다." };
  }
  const c = await cookies();
  c.set(await qrCookieName(token), await qrCookieValue(token), { httpOnly: true, sameSite: "lax", path: `/q/${token}`, maxAge: 2 * 3600 });
  // 로그인 전이면 (비밀번호가 맞았으므로) 학생 본인으로 로그인시킨다 — 사진 제출·알림에 필요. 다른 계정으로 로그인 중이면 열람 쿠키만.
  if (!(await getCurrentUser())) await createWebSession(page.print.attempt.assignment.student.userId!);
  await audit({ userId: page.print.attempt.assignment.student.userId, action: "qr.open", target: page.print.attempt.id });
  return { ok: true };
}
