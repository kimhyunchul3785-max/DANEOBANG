"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/util";
import { appUrl } from "@/lib/oauth";
import { saveFile } from "@/lib/storage";
import type { ActionResult } from "../students/actions";

export async function updateAcademyAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 수정할 수 있습니다." };
  const parsed = z
    .object({ name: z.string().min(2).max(40), intro: z.string().max(500).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "입력을 확인하세요." };
  await prisma.academy.update({
    where: { id: ctx.member.academyId },
    data: { name: parsed.data.name, intro: parsed.data.intro || null, color: parsed.data.color || "#2563eb" },
  });
  revalidatePath("/app/settings");
  return { ok: true, message: "저장했습니다." };
}

export async function createInvitationAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 선생님을 초대할 수 있습니다." };
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  const token = randomToken(24);
  const inv = await prisma.invitation.create({
    data: {
      academyId: ctx.member.academyId,
      role: "TEACHER",
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 86400e3),
      createdBy: ctx.user.id,
    },
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "invitation.create", target: inv.id, detail: email ?? "open" });
  revalidatePath("/app/settings");
  return { ok: true, message: "초대 링크를 발급했습니다. 아래 링크를 복사해 전달하세요.", data: { url: `${appUrl()}/join/${token}` } };
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "권한이 없습니다." };
  await prisma.invitation.updateMany({ where: { id, academyId: ctx.member.academyId, usedAt: null }, data: { expiresAt: new Date(0) } });
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function setMemberStatusAction(memberId: string, status: "active" | "inactive"): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "권한이 없습니다." };
  const m = await prisma.academyMember.findFirst({ where: { id: memberId, academyId: ctx.member.academyId } });
  if (!m) return { ok: false };
  if (m.role === "OWNER") return { ok: false, message: "학원장은 비활성화할 수 없습니다." };
  await prisma.academyMember.update({ where: { id: memberId }, data: { status } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "member.status", target: memberId, detail: status });
  revalidatePath("/app/settings");
  return { ok: true };
}

const IMG: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "jpg"],
  [[0x89, 0x50, 0x4e, 0x47], "png"],
];

/** 학원 로고 업로드 (PNG/JPG, 2MB). 시험지·오답노트 헤더와 화면에 표시된다. */
export async function uploadLogoAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 로고를 바꿀 수 있습니다." };
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "이미지 파일을 선택하세요." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "로고는 2MB 이하 PNG/JPG 만 가능합니다." };
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = IMG.find(([m]) => m.every((b, i) => buf[i] === b))?.[1];
  if (!kind) return { ok: false, message: "PNG 또는 JPG 파일만 업로드할 수 있습니다." };
  // 정규화: 최대 600px, PNG 로 저장 (PDF 삽입 안정성)
  const sharp = (await import("sharp")).default;
  const png = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const rel = await saveFile("logos", ctx.member.academyId, "png", png);
  await prisma.academy.update({ where: { id: ctx.member.academyId }, data: { logoPath: rel } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "academy.logo", detail: file.name });
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true, message: "로고를 등록했습니다. 앞으로 발급하는 시험지·오답노트에 인쇄됩니다." };
}

export async function removeLogoAction(): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "권한이 없습니다." };
  await prisma.academy.update({ where: { id: ctx.member.academyId }, data: { logoPath: null } });
  revalidatePath("/app/settings");
  return { ok: true, message: "로고를 제거했습니다." };
}
