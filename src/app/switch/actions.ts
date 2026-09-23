"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, setAcademyCookie, setLearnCookie, ACADEMY_ENTERABLE } from "@/lib/auth";

/** 계정 전환: student → /learn, member:<academyId> → /app */
export async function selectContextAction(form: FormData) {
  const user = await requireUser("/switch");
  const to = String(form.get("to") ?? "");
  if (to === "student") {
    const n = await prisma.student.count({ where: { userId: user.id, status: "active" } });
    if (!n) redirect("/switch");
    await setLearnCookie();
    redirect("/learn");
  }
  const academyId = to.startsWith("member:") ? to.slice(7) : "";
  const m = academyId ? await prisma.academyMember.findFirst({ where: { userId: user.id, academyId, status: "active", academy: { status: { in: ACADEMY_ENTERABLE } } } }) : null;
  if (!m) redirect("/switch");
  await setAcademyCookie(academyId);
  redirect("/app");
}
