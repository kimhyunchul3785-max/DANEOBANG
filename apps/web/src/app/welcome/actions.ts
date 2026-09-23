"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAcademy, joinByClassCode, linkByPhoneCode, type OnboardResult } from "@/lib/onboarding";

export async function createAcademyAction(form: FormData): Promise<OnboardResult | void> {
  const user = await requireUser("/welcome/new");
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { ok: false, message: "학원 이름은 2~40자입니다." };
  await createAcademy(user, name);
  redirect("/app");
}

export async function joinByClassCodeAction(code: string, name: string): Promise<OnboardResult> {
  const user = await requireUser("/welcome/student");
  return joinByClassCode(user, code, name);
}

export async function linkByPhoneCodeAction(phone: string, code: string): Promise<OnboardResult> {
  const user = await requireUser("/welcome/student");
  return linkByPhoneCode(user, phone, code);
}
