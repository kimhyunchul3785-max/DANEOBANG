"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, setAcademyCookie, audit } from "@/lib/auth";
import { slugify, RESERVED_SLUGS, hashToken } from "@/lib/util";
import { redirect } from "next/navigation";

export type FormState = { error?: string } | undefined;

export async function createAcademyAction(_p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({ name: z.string().min(2).max(40), slug: z.string().max(40).optional(), intro: z.string().max(500).optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "학원 이름(2~40자)을 확인하세요." };
  let slug = slugify(parsed.data.slug || parsed.data.name);
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-${Date.now().toString(36)}`;
  const dup = await prisma.academy.findUnique({ where: { slug } });
  if (dup) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const academy = await prisma.$transaction(async (tx) => {
    const a = await tx.academy.create({ data: { name: parsed.data.name, slug, intro: parsed.data.intro || null } });
    await tx.academyMember.create({ data: { academyId: a.id, userId: user.id, role: "OWNER" } });
    return a;
  });
  await audit({ academyId: academy.id, userId: user.id, action: "academy.create", target: academy.id });
  await setAcademyCookie(academy.id);
  redirect("/app");
}

export async function selectAcademyAction(form: FormData) {
  const user = await requireUser();
  const academyId = String(form.get("academyId") ?? "");
  const m = await prisma.academyMember.findFirst({ where: { userId: user.id, academyId, status: "active" } });
  if (!m) redirect("/workspaces");
  await setAcademyCookie(academyId);
  redirect("/app");
}

/** 초대 토큰 수락: 선생님 초대 또는 학생 명단 연결 요청 */
export async function acceptJoinAction(token: string): Promise<{ ok: boolean; message: string; redirectTo?: string }> {
  const user = await requireUser();
  const h = hashToken(token);
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: h } });
  if (inv) {
    if (inv.usedAt) return { ok: false, message: "이미 사용된 초대 링크입니다." };
    if (inv.expiresAt < new Date()) return { ok: false, message: "만료된 초대 링크입니다. 학원장에게 재발급을 요청하세요." };
    if (inv.email && inv.email.toLowerCase() !== user.email.toLowerCase())
      return { ok: false, message: `이 초대는 ${inv.email} 계정 전용입니다.` };
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { id: inv.id } });
      if (!fresh || fresh.usedAt) throw new Error("used");
      await tx.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
      await tx.academyMember.upsert({
        where: { academyId_userId: { academyId: inv.academyId, userId: user.id } },
        update: { status: "active" },
        create: { academyId: inv.academyId, userId: user.id, role: inv.role },
      });
    }).catch(() => null);
    await audit({ academyId: inv.academyId, userId: user.id, action: "invitation.accept", target: inv.id });
    await setAcademyCookie(inv.academyId);
    return { ok: true, message: "학원에 선생님으로 참여했습니다.", redirectTo: "/app" };
  }
  const student = await prisma.student.findUnique({ where: { inviteTokenHash: h } });
  if (!student) return { ok: false, message: "유효하지 않은 링크입니다." };
  if (student.inviteExpiresAt && student.inviteExpiresAt < new Date()) return { ok: false, message: "만료된 학생 초대 링크입니다." };
  if (student.userId) return { ok: false, message: "이미 계정이 연결된 학생입니다." };
  const dup = await prisma.student.findFirst({ where: { academyId: student.academyId, userId: user.id } });
  if (dup) return { ok: false, message: "이 학원에는 이미 다른 학생 명단에 연결되어 있습니다." };
  const pending = await prisma.studentLinkRequest.findFirst({ where: { studentId: student.id, userId: user.id, status: "pending" } });
  if (!pending) await prisma.studentLinkRequest.create({ data: { studentId: student.id, userId: user.id } });
  return { ok: true, message: "연결 요청을 보냈습니다. 선생님이 승인하면 시험을 볼 수 있습니다.", redirectTo: "/learn" };
}
