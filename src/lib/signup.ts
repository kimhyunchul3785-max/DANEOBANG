import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashToken, slugify, RESERVED_SLUGS } from "./util";
import { createWebSession, setAcademyCookie, audit } from "./auth";
import { UNIT_PRICE, billingEnabled, TRIAL_SEATS } from "./billing";

export type StartResult = { ok: boolean; message?: string; devLink?: string; step?: number };

export const SIGNUP_COOKIE = "db_signup";

/** 가입 위저드 임시 세션 (쿠키 토큰 → 해시로 조회). 만료됐으면 null */
export async function getSignupSession() {
  const c = await cookies();
  const t = c.get(SIGNUP_COOKIE)?.value;
  if (!t) return null;
  const s = await prisma.signupSession.findUnique({ where: { tokenHash: hashToken(t) } });
  if (!s || s.expiresAt < new Date()) return null;
  return s;
}

async function uniqueSlug(name: string) {
  let slug = slugify(name) || `academy-${Date.now().toString(36)}`;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-${Date.now().toString(36)}`;
  if (await prisma.academy.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

/** 인증 완료 → 계정·학원(결제 대기)·OWNER 구성원·구독(pending) 생성, 로그인 */
export async function finalizeAccount(sessionId: string): Promise<StartResult> {
  const s = await prisma.signupSession.findUnique({ where: { id: sessionId } });
  if (!s || !s.email || !s.academyName) return { ok: false, message: "가입 정보가 없습니다. 처음부터 다시 진행해주세요." };
  if (s.academyId) return { ok: true, step: 5 };
  const slug = await uniqueSlug(s.academyName); // 트랜잭션 밖에서 (SQLite 잠금 회피)
  const result = await prisma.$transaction(async (tx) => {
    let userId = s.userId;
    if (!userId) {
      const exists = await tx.user.findUnique({ where: { email: s.email! } });
      if (exists) throw new Error("email_taken");
      const u = await tx.user.create({ data: { email: s.email!, name: s.ownerName ?? s.representativeName ?? "원장", provider: "email", passwordHash: s.passwordHash, emailVerifiedAt: new Date() } });
      userId = u.id;
    }
    // 결제 기능이 꺼져 있으면(체험) 바로 활성 + 체험 구독, 켜져 있으면 결제 대기
    const billing = billingEnabled();
    const a = await tx.academy.create({ data: { name: s.academyName!, slug, representativeName: s.representativeName, phone: s.phone, region: s.region, status: billing ? "pending_payment" : "active", plan: billing ? "seat" : "trial" } });
    await tx.academyMember.create({ data: { academyId: a.id, userId, role: "OWNER", isTeacher: s.ownerIsTeacher, status: "active" } });
    await tx.subscription.create({ data: billing ? { academyId: a.id, seatQuantity: s.teacherCount, unitPrice: UNIT_PRICE, status: "pending" } : { academyId: a.id, seatQuantity: TRIAL_SEATS, unitPrice: 0, status: "active", provider: "trial" } });
    await tx.signupSession.update({ where: { id: s.id }, data: { userId, academyId: a.id, verifiedAt: s.verifiedAt ?? new Date(), step: billing ? 5 : 6 } });
    return { userId, academyId: a.id };
  }, { timeout: 15000 }).catch((e: Error) => ({ error: e.message }));
  if ("error" in result) return { ok: false, message: result.error === "email_taken" ? "그 사이 같은 이메일로 가입된 계정이 있습니다. 로그인한 뒤 진행해주세요." : "학원을 만들지 못했습니다." };
  await createWebSession(result.userId);
  await setAcademyCookie(result.academyId);
  await audit({ academyId: result.academyId, userId: result.userId, action: "academy.signup", detail: `${s.academyName} · seats ${s.teacherCount} · ownerIsTeacher ${s.ownerIsTeacher}` });
  return { ok: true, step: 5 };
}

