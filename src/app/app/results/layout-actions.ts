"use server";

import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { normalizeLayout } from "./widgets";

/** 대시보드 위젯 배치 저장 (사용자별). null 이면 기본 배치로 */
export async function saveDashboardLayoutAction(json: string | null): Promise<{ ok: boolean }> {
  const ctx = await requireAcademy();
  let value: string | null = null;
  if (json) {
    try {
      const layout = normalizeLayout(JSON.parse(json));
      value = JSON.stringify(layout);
    } catch {
      return { ok: false };
    }
  }
  await prisma.academyMember.update({ where: { id: ctx.member.id }, data: { dashboardLayout: value } });
  return { ok: true };
}
