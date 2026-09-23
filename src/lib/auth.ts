import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { ACADEMY_COOKIE, LAST_COOKIE, SESSION_COOKIE, STUDENT_COOKIE } from "./constants";
import { redirect } from "next/navigation";
import type { AcademyMember, Student, User } from "@/generated/prisma/client";
import { writeLog } from "./logger";

const DEV_SECRET = "dev-insecure-secret-change-me-please-32chars";
/** production 에서 SESSION_SECRET 이 없으면(또는 개발용 값이면) 세션을 발급·검증하지 않는다 — 공개된 문자열로 JWT 를 서명하는 사고 방지 */
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!s || s === DEV_SECRET || s.length < 16)) {
    throw new Error("SESSION_SECRET 이 설정되지 않았습니다. .env 에 16자 이상의 비밀 값을 넣고 서버를 다시 시작하세요.");
  }
  return new TextEncoder().encode(s || DEV_SECRET);
};

export type SessionPayload = { uid: string; typ: "web" | "mobile" };

export async function signToken(uid: string, typ: "web" | "mobile" = "web", expires = "14d") {
  return new SignJWT({ uid, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, typ: (payload.typ as "web" | "mobile") ?? "web" };
  } catch {
    return null;
  }
}

export async function createWebSession(userId: string) {
  const token = await signToken(userId, "web");
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroyWebSession() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(ACADEMY_COOKIE);
  c.delete(LAST_COOKIE);
  c.delete(STUDENT_COOKIE);
}

/** 쿠키(웹) 또는 Authorization: Bearer(모바일) 에서 현재 사용자 조회 */
export async function getCurrentUser(): Promise<User | null> {
  let token: string | undefined;
  const h = await headers();
  const authz = h.get("authorization");
  if (authz?.startsWith("Bearer ")) token = authz.slice(7);
  if (!token) {
    const c = await cookies();
    token = c.get(SESSION_COOKIE)?.value;
  }
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || user.status !== "active") return null;
  return user;
}

export async function requireUser(next?: string): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

export async function requirePlatformAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.isPlatformAdmin) redirect("/switch");
  return u;
}

/** 들어갈 수는 있는 학원 상태 (active 만 기능 사용 가능, 나머지는 결제 안내 화면) */
export const ACADEMY_ENTERABLE = ["active", "pending_payment", "past_due", "read_only"];

export type AcademyContext = {
  user: User;
  member: AcademyMember & { academy: { id: string; name: string; slug: string; color: string; status: string; logoPath: string | null } };
  isOwner: boolean;
};

/** 현재 선택된 학원의 교사/소유자 컨텍스트. 선택 안 됐으면 null (→ /switch) */
export async function getAcademyContext(): Promise<AcademyContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const h = await headers();
  let academyId = h.get("x-academy-id") ?? undefined;
  if (!academyId) {
    const c = await cookies();
    academyId = c.get(ACADEMY_COOKIE)?.value;
  }
  if (!academyId) return null;
  const member = await prisma.academyMember.findFirst({
    where: { userId: user.id, academyId, status: "active", academy: { status: { in: ACADEMY_ENTERABLE } } },
    include: { academy: { select: { id: true, name: true, slug: true, color: true, status: true, logoPath: true } } },
  });
  if (!member) return null;
  return { user, member, isOwner: member.role === "OWNER" };
}

export async function requireAcademy(): Promise<AcademyContext> {
  const ctx = await getAcademyContext();
  if (!ctx) {
    // 학원이 하나뿐이면 묻지 않고 그 학원으로
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/app");
    const ms = await prisma.academyMember.findMany({ where: { userId: user.id, status: "active", academy: { status: { in: ACADEMY_ENTERABLE } } }, select: { academyId: true } });
    if (ms.length === 1) redirect(`/switch?to=member:${ms[0].academyId}`);
    redirect(ms.length === 0 ? "/welcome" : "/switch");
  }
  return ctx;
}

export async function requireOwner(): Promise<AcademyContext> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) redirect("/app");
  return ctx;
}

/** 학생 컨텍스트: 로그인 사용자에 연결된 학생 명단들 */
export async function getStudentContexts(userId: string): Promise<(Student & { academy: { id: string; name: string; slug: string }; classRoom: { name: string } | null })[]> {
  return prisma.student.findMany({
    where: { userId, status: "active" },
    include: { academy: { select: { id: true, name: true, slug: true } }, classRoom: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** 사용자가 고를 수 있는 모든 자리: 학원(학원장·선생님) + 학생 연결 + 승인 대기 */
export async function listContexts(userId: string) {
  const [memberships, students, pending] = await Promise.all([
    prisma.academyMember.findMany({ where: { userId, status: "active", academy: { status: { in: ACADEMY_ENTERABLE } } }, include: { academy: { select: { id: true, name: true, slug: true, status: true } } }, orderBy: { createdAt: "asc" } }),
    getStudentContexts(userId),
    prisma.studentLinkRequest.findMany({ where: { userId, status: "pending" }, include: { student: { select: { name: true, academy: { select: { id: true, name: true } } } } } }),
  ]);
  return { memberships, students, pending };
}

export async function setAcademyCookie(academyId: string) {
  const c = await cookies();
  c.set(ACADEMY_COOKIE, academyId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  c.set(LAST_COOKIE, "app", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

/** 학생 자리 선택: 어느 학원의 어느 학생 명단으로 들어가는지 */
export async function setStudentCookie(studentId: string) {
  const c = await cookies();
  c.set(STUDENT_COOKIE, studentId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  c.set(LAST_COOKIE, "learn", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

/** @deprecated setStudentCookie 를 쓴다. 학생 id 없이 "학생 쪽"만 기억 */
export async function setLearnCookie() {
  const c = await cookies();
  c.set(LAST_COOKIE, "learn", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export type StudentContext = { user: User; student: Student & { academy: { id: string; name: string; slug: string }; classRoom: { name: string } | null } };

/** 학생 화면: 선택한 학생 자리가 없으면 자리가 여럿일 때 /switch, 하나도 없을 때 /learn (연결 안내) */
export async function requireStudent(): Promise<StudentContext> {
  const user = await requireUser("/learn");
  const ctx = await getStudentContext(user);
  if (!ctx) {
    const n = await prisma.student.count({ where: { userId: user.id, status: "active" } });
    redirect(n > 1 ? "/switch" : "/learn");
  }
  return ctx;
}

/**
 * 현재 선택된 학생 자리. 쿠키의 studentId 가 이 사용자의 것일 때만 유효하고, 쿠키가 없으면 학생 자리가 하나뿐일 때 그것을 쓴다.
 * 학생 자리가 여럿인데 고르지 않았으면 null (→ /switch).
 */
export async function getStudentContext(user?: User | null): Promise<StudentContext | null> {
  const u = user ?? (await getCurrentUser());
  if (!u) return null;
  const c = await cookies();
  const h = await headers();
  const wanted = h.get("x-student-id") ?? c.get(STUDENT_COOKIE)?.value;
  const students = await getStudentContexts(u.id);
  const student = (wanted && students.find((s) => s.id === wanted)) || (students.length === 1 ? students[0] : null);
  if (!student) return null;
  return { user: u, student };
}

export async function audit(params: { academyId?: string | null; userId?: string | null; action: string; target?: string; detail?: string }) {
  writeLog({ kind: "action", user: params.userId ?? null, academy: params.academyId ?? null, event: params.action, detail: { target: params.target, detail: params.detail } });
  try {
    await prisma.auditLog.create({
      data: {
        academyId: params.academyId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        target: params.target,
        detail: params.detail,
      },
    });
  } catch {
    /* 감사 로그 실패는 업무를 막지 않는다 */
  }
}

/**
 * 로그인 직후 이동 경로.
 *   초대 링크로 들어옴(next) → 그 링크 계속
 *   연결 0개 → /welcome
 *   자리 1개 → 바로 그 앱 (/app 또는 /learn)
 *   자리 2개 이상 → 마지막에 쓰던 자리로, 기억이 없으면 /switch (계정 전환)
 */
export async function landingAfterLogin(userId: string, next?: string | null): Promise<string> {
  if (next && next.startsWith("/") && !next.startsWith("//") && !["/workspaces", "/switch", "/welcome", "/"].includes(next)) return next;
  const { memberships, students, pending } = await listContexts(userId);
  if (memberships.length === 0 && students.length === 0) return pending.length ? "/learn" : "/welcome";
  // 자리(학원 역할 + 학생 명단)가 하나면 바로
  if (memberships.length === 1 && students.length === 0) {
    await setAcademyCookie(memberships[0].academyId);
    return "/app";
  }
  if (memberships.length === 0 && students.length === 1) {
    await setStudentCookie(students[0].id);
    return "/learn";
  }
  // 여러 개면 마지막에 쓰던 자리, 기억이 없으면 계정 전환
  const c = await cookies();
  const last = c.get(LAST_COOKIE)?.value;
  const academyId = c.get(ACADEMY_COOKIE)?.value;
  const studentId = c.get(STUDENT_COOKIE)?.value;
  if (last === "app" && academyId && memberships.some((m) => m.academyId === academyId)) return "/app";
  if (last === "learn" && studentId && students.some((s) => s.id === studentId)) return "/learn";
  return "/switch";
}
