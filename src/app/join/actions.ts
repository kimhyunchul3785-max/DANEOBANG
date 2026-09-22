"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createWebSession, audit } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { normalizePhone } from "@/lib/sms";

/**
 * 휴대폰 번호 + 인증번호 + 비밀번호 → 계정 생성(또는 같은 번호의 기존 계정에 비밀번호 확인) → 학생 명단 연결 → /learn
 * 인증번호가 곧 본인 확인이므로 선생님 승인이 없다. 같은 번호로 여러 학원에 등록된 학생은 인증번호가 맞는 명단에 연결된다.
 */
export async function joinByCodeAction(form: FormData): Promise<{ ok: boolean; message?: string } | void> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const code = String(form.get("code") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, message: "휴대폰 번호를 확인해주세요." };
  if (!/^\d{6}$/.test(code) || password.length < 6) return { ok: false, message: "인증번호(6자리)와 비밀번호(6자 이상)를 확인해주세요." };
  const candidates = await prisma.student.findMany({ where: { phone, userId: null, phoneCodeHash: { not: null } } });
  const student = candidates.find((s) => s.phoneCodeHash === hashToken(code));
  if (!student) {
    await audit({ action: "student.join_fail", detail: `phone ${phone.slice(-4)}` });
    return { ok: false, message: "휴대폰 번호 또는 인증번호가 맞지 않습니다. 선생님이 보낸 번호를 다시 확인해주세요." };
  }
  if (student.phoneCodeExpiresAt && student.phoneCodeExpiresAt < new Date()) return { ok: false, message: "인증번호가 만료되었습니다(3일). 선생님에게 다시 요청하세요." };

  // 같은 번호의 기존 계정(다른 학원에서 이미 가입)이 있으면 그 계정의 비밀번호로 확인
  const existing = await prisma.user.findFirst({ where: { phone }, orderBy: { createdAt: "asc" } });
  let userId: string;
  let created = false;
  if (existing) {
    if (!existing.passwordHash || !(await bcrypt.compare(password, existing.passwordHash))) return { ok: false, message: "이 번호로 이미 가입된 계정이 있습니다. 그 계정의 비밀번호를 입력하면 연결됩니다." };
    userId = existing.id;
  } else {
    const email = `${phone}@phone.daneobang.local`; // 이메일 없는 학생 계정의 내부 식별자 (화면에는 휴대폰 번호만 보인다)
    const u = await prisma.user.create({ data: { email, phone, name: student.name, provider: "phone", passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() } });
    userId = u.id;
    created = true;
  }
  const dup = await prisma.student.findFirst({ where: { academyId: student.academyId, userId } });
  if (dup) return { ok: false, message: "이 계정은 이미 이 학원의 다른 학생에 연결되어 있습니다." };
  await prisma.$transaction([
    prisma.student.update({ where: { id: student.id }, data: { userId, phoneCodeHash: null, phoneCodeExpiresAt: null, inviteTokenHash: null, inviteExpiresAt: null } }),
    prisma.studentLinkRequest.updateMany({ where: { studentId: student.id, status: "pending" }, data: { status: "rejected" } }),
  ]);
  await createWebSession(userId);
  await audit({ academyId: student.academyId, userId, action: "student.activate", target: student.id, detail: created ? "phone code · new account" : "phone code · existing account" });
  redirect("/learn");
}
