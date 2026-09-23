"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { acceptTeacherInvite, type OnboardResult } from "@/lib/onboarding";

export async function acceptInviteAction(token: string): Promise<OnboardResult | void> {
  const user = await requireUser(`/invite/${token}`);
  const r = await acceptTeacherInvite(user, token);
  if (!r.ok) return r;
  redirect(r.redirectTo ?? "/app"); // 학원 쿠키를 막 설정했으므로 서버 리다이렉트
}
