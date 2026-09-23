"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin, audit } from "@/lib/auth";
import { runJob } from "@/lib/jobs";
import type { ActionResult } from "@/app/app/students/actions";

export async function setAcademyStatusAction(academyId: string, status: "active" | "suspended"): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  await prisma.academy.update({ where: { id: academyId }, data: { status } });
  await audit({ academyId, userId: admin.id, action: "admin.academy_status", detail: status });
  revalidatePath("/admin/academies");
  return { ok: true };
}

export async function setAcademyPlanAction(form: FormData): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  const academyId = String(form.get("academyId"));
  const plan = String(form.get("plan") ?? "free").slice(0, 20);
  await prisma.academy.update({ where: { id: academyId }, data: { plan } });
  await audit({ academyId, userId: admin.id, action: "admin.academy_plan", detail: plan });
  revalidatePath("/admin/academies");
  return { ok: true, message: "저장했습니다." };
}

export async function setUserStatusAction(userId: string, status: "active" | "suspended"): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, message: "본인 계정은 변경할 수 없습니다." };
  await prisma.user.update({ where: { id: userId }, data: { status } });
  await audit({ userId: admin.id, action: "admin.user_status", target: userId, detail: status });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleAdminAction(userId: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, message: "본인 권한은 변경할 수 없습니다." };
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return { ok: false };
  await prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: !u.isPlatformAdmin } });
  await audit({ userId: admin.id, action: "admin.toggle_admin", target: userId, detail: String(!u.isPlatformAdmin) });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function retryJobAction(jobId: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  await prisma.job.update({ where: { id: jobId }, data: { status: "queued", attempts: 0, error: null, leaseExpiresAt: null } });
  setImmediate(() => runJob(jobId).catch(() => null));
  revalidatePath("/admin/jobs");
  return { ok: true, message: "재실행했습니다." };
}
