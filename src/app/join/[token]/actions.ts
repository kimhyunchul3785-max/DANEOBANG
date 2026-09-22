"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, createWebSession, audit } from "@/lib/auth";
import { hashToken } from "@/lib/util";

/**
 * 학생 계정 활성화. 토큰이 곧 본인 확인이므로 선생님 승인 없이 연결한다.
 * - useCurrent=1: 로그인한 계정에 연결
 * - 아니면 이메일·비밀번호로 계정을 만들고(이미 있는 이메일이면 비밀번호 확인 후) 연결
 */
export async function activateStudentAction(form: FormData): Promise<{ ok: boolean; message?: string; redirectTo?: string }> {
  const token = String(form.get("token") ?? "");
  const student = await prisma.student.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!student) return { ok: false, message: "유효하지 않은 링크입니다." };
  if (student.inviteExpiresAt && student.inviteExpiresAt < new Date()) return { ok: false, message: "만료된 링크입니다." };
  if (student.userId) return { ok: false, message: "이미 계정이 연결된 학생입니다." };
  const current = await getCurrentUser();
  let userId: string;
  let created = false;
  if (String(form.get("useCurrent")) === "1" && current) {
    userId = current.id;
  } else {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) return { ok: false, message: "이메일과 비밀번호(6자 이상)를 확인해주세요." };
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.passwordHash || !(await bcrypt.compare(password, existing.passwordHash))) return { ok: false, message: "이미 있는 이메일입니다. 그 계정의 비밀번호를 입력하면 연결됩니다." };
      userId = existing.id;
    } else {
      const u = await prisma.user.create({ data: { email, name: student.name, provider: "email", passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() } });
      userId = u.id;
      created = true;
    }
  }
  const dup = await prisma.student.findFirst({ where: { academyId: student.academyId, userId } });
  if (dup) return { ok: false, message: "이 계정은 이미 이 학원의 다른 학생에 연결되어 있습니다." };
  await prisma.$transaction([
    prisma.student.update({ where: { id: student.id }, data: { userId, inviteTokenHash: null, inviteExpiresAt: null, email: student.email ?? (current ? current.email : String(form.get("email") ?? "").toLowerCase() || null) } }),
    prisma.studentLinkRequest.updateMany({ where: { studentId: student.id, status: "pending" }, data: { status: "rejected" } }),
  ]);
  if (!current || current.id !== userId) await createWebSession(userId);
  await audit({ academyId: student.academyId, userId, action: "student.activate", target: student.id, detail: created ? "new account" : "existing account" });
  redirect("/learn"); // 세션 쿠키를 설정했으므로 서버 리다이렉트
}
