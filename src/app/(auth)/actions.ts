"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createWebSession, audit, landingAfterLogin } from "@/lib/auth";
import { redirect } from "next/navigation";

const devLoginAllowed = () => (process.env.ALLOW_DEV_LOGIN ?? "true") !== "false";

export type AuthState = { error?: string } | undefined;

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!devLoginAllowed()) return { error: "이메일 로그인이 비활성화되어 있습니다. 구글/카카오 로그인을 사용하세요." };
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "이메일과 비밀번호를 확인하세요." };
  const { email, password, next } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }
  if (user.status !== "active") return { error: "정지된 계정입니다." };
  await createWebSession(user.id);
  await audit({ userId: user.id, action: "login", detail: "email" });
  redirect(await landingAfterLogin(user.id, next));
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!devLoginAllowed()) return { error: "이메일 가입이 비활성화되어 있습니다. 구글/카카오 로그인을 사용하세요." };
  const parsed = z
    .object({
      name: z.string().min(1).max(40),
      email: z.string().email(),
      password: z.string().min(6).max(100),
      next: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "이름, 이메일, 비밀번호(6자 이상)를 확인하세요." };
  const { name, email, password, next } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return { error: "이미 가입된 이메일입니다." };
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), provider: "email", passwordHash: await bcrypt.hash(password, 10) },
  });
  await createWebSession(user.id);
  await audit({ userId: user.id, action: "signup", detail: "email" });
  redirect(next && next.startsWith("/") ? next : "/workspaces");
}
