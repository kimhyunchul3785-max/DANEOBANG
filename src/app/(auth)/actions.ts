"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createWebSession, audit, landingAfterLogin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { normalizePhone, isPhone } from "@/lib/sms";

const devLoginAllowed = () => (process.env.ALLOW_DEV_LOGIN ?? "true") !== "false";

export type AuthState = { error?: string } | undefined;

/** 기존 이메일·휴대폰 계정 로그인 (이전용). 신규 가입은 Google/Kakao 만 */
export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!devLoginAllowed()) return { error: "이메일 로그인이 비활성화되어 있습니다. 구글/카카오 로그인을 사용하세요." };
  const parsed = z
    .object({ email: z.string().trim().min(3), password: z.string().min(1), next: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "이메일(또는 휴대폰 번호)과 비밀번호를 확인하세요." };
  const { email, password, next } = parsed.data;
  // 휴대폰 번호로 가입한 학생은 번호 + 비밀번호로 로그인 (같은 번호의 계정이 여럿이면 비밀번호가 맞는 계정)
  let user = null;
  if (isPhone(email)) {
    const users = await prisma.user.findMany({ where: { phone: normalizePhone(email) } });
    for (const u of users) if (u.passwordHash && (await bcrypt.compare(password, u.passwordHash))) user = u;
    if (!user) return { error: "휴대폰 번호 또는 비밀번호가 올바르지 않습니다." };
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "이메일 형식을 확인하세요." };
    user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
  }
  if (user.status !== "active") return { error: "정지된 계정입니다." };
  await createWebSession(user.id);
  await audit({ userId: user.id, action: "login", detail: "email" });
  redirect(await landingAfterLogin(user.id, next));
}
