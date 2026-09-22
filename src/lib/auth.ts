import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { ACADEMY_COOKIE, SESSION_COOKIE } from "./constants";
import { redirect } from "next/navigation";
import type { AcademyMember, Student, User } from "@/generated/prisma/client";
import { writeLog } from "./logger";

const secret = () => {
  const s = process.env.SESSION_SECRET || "dev-insecure-secret-change-me-please-32chars";
  return new TextEncoder().encode(s);
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

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePlatformAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.isPlatformAdmin) redirect("/workspaces");
  return u;
}

export type AcademyContext = {
  user: User;
  member: AcademyMember & { academy: { id: string; name: string; slug: string; color: string; status: string; logoPath: string | null } };
  isOwner: boolean;
};

/** 현재 선택된 학원의 교사/소유자 컨텍스트. 선택 안 됐으면 /workspaces 로 */
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
    where: { userId: user.id, academyId, status: "active", academy: { status: "active" } },
    include: { academy: { select: { id: true, name: true, slug: true, color: true, status: true, logoPath: true } } },
  });
  if (!member) return null;
  return { user, member, isOwner: member.role === "OWNER" };
}

export async function requireAcademy(): Promise<AcademyContext> {
  const ctx = await getAcademyContext();
  if (!ctx) redirect("/workspaces");
  return ctx;
}

export async function requireOwner(): Promise<AcademyContext> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) redirect("/app");
  return ctx;
}

/** 학생 컨텍스트: 로그인 사용자에 연결된 학생 명단들 */
export async function getStudentContexts(userId: string): Promise<(Student & { academy: { id: string; name: string; slug: string } })[]> {
  return prisma.student.findMany({
    where: { userId, status: "active" },
    include: { academy: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function setAcademyCookie(academyId: string) {
  const c = await cookies();
  c.set(ACADEMY_COOKIE, academyId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
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

/** 로그인 직후 이동 경로: 학원 1곳이면 바로 /app, 학생 연결만 있으면 /learn, 그 외 /workspaces */
export async function landingAfterLogin(userId: string, next?: string | null): Promise<string> {
  if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/workspaces") return next;
  const [memberships, students] = await Promise.all([
    prisma.academyMember.findMany({ where: { userId, status: "active", academy: { status: "active" } }, select: { academyId: true } }),
    prisma.student.count({ where: { userId, status: "active" } }),
  ]);
  if (memberships.length === 1 && students === 0) {
    await setAcademyCookie(memberships[0].academyId);
    return "/app";
  }
  if (memberships.length === 0 && students > 0) return "/learn";
  return "/workspaces";
}
