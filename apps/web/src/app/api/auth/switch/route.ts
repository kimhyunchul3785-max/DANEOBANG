import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, listContexts, setAcademyCookie, setStudentCookie } from "@/lib/auth";

/** 자리 전환 (?to=member:<academyId> | student:<studentId>) — 쿠키를 굽고 /app 또는 /learn 으로. 페이지가 아니라 여기서 쿠키를 쓴다 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/switch")}`, req.url), { status: 303 });
  const { memberships, students } = await listContexts(user.id);
  if (to.startsWith("student:")) {
    const id = to.slice(8);
    if (students.some((s) => s.id === id)) {
      await setStudentCookie(id);
      return NextResponse.redirect(new URL("/learn", req.url), { status: 303 });
    }
  }
  if (to.startsWith("member:")) {
    const id = to.slice(7);
    if (memberships.some((m) => m.academyId === id)) {
      await setAcademyCookie(id);
      return NextResponse.redirect(new URL("/app", req.url), { status: 303 });
    }
  }
  return NextResponse.redirect(new URL("/switch", req.url), { status: 303 });
}
