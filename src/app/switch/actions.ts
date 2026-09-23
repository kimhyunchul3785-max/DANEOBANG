"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, setAcademyCookie, setStudentCookie, ACADEMY_ENTERABLE } from "@/lib/auth";

/** 계정 전환: student:<studentId> → /learn, member:<academyId> → /app. 자리마다 독립 — 학생도 학원별로 따로 */
export async function selectContextAction(form: FormData) {
  const user = await requireUser("/switch");
  const to = String(form.get("to") ?? "");
  if (to.startsWith("student:")) {
    const s = await prisma.student.findFirst({ where: { id: to.slice(8), userId: user.id, status: "active" }, select: { id: true } });
    if (!s) redirect("/switch");
    await setStudentCookie(s.id);
    redirect("/learn");
  }
  const academyId = to.startsWith("member:") ? to.slice(7) : "";
  const m = academyId ? await prisma.academyMember.findFirst({ where: { userId: user.id, academyId, status: "active", academy: { status: { in: ACADEMY_ENTERABLE } } } }) : null;
  if (!m) redirect("/switch");
  await setAcademyCookie(academyId);
  redirect("/app");
}
