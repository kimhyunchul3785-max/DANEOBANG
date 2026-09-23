import { prisma } from "./db";
import { audit, setAcademyCookie, setLearnCookie } from "./auth";
import { hashToken, slugify, RESERVED_SLUGS } from "./util";
import { UNIT_PRICE, billingEnabled, TRIAL_SEATS } from "./billing";
import { normalizePhone } from "./phone";
import { seatUsage } from "./seats";
import type { User } from "@/generated/prisma/client";

/**
 * 온보딩 — 계정은 하나, 학원과 역할은 여러 개.
 *   선생님: 학원 만들기(이름 하나) 또는 초대 링크로 참여
 *   학생:   반 코드 + 이름 / 문자 인증번호(휴대폰 + 6자리) / 초대 링크 → 로그인한 계정에 학생 명단을 연결
 * 어느 쪽도 계정을 새로 만들지 않는다. 역할은 영구 속성이 아니라 "지금 하려는 일"이다.
 */
export type OnboardResult = { ok: boolean; message?: string; redirectTo?: string };

export const DEFAULT_CLASS_NAME = "기본 반";

/** 반 코드 6자리 (전체 유일). 0/O·1/I 혼동 없이 숫자만 */
export async function newJoinCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await prisma.classRoom.findUnique({ where: { joinCode: code } }))) return code;
  }
  throw new Error("join_code_exhausted");
}

async function uniqueSlug(name: string) {
  let slug = slugify(name) || `academy-${Date.now().toString(36)}`;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-${Date.now().toString(36)}`;
  if (await prisma.academy.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

/**
 * 학원 만들기: 이름 하나로 Academy + OWNER(선생님 자리 1) + 기본 반(반 코드) + 구독을 만든다.
 * 결제가 켜져 있으면 결제 대기(→ /app 에서 요금제 화면으로), 꺼져 있으면(체험) 바로 활성.
 */
export async function createAcademy(user: User, name: string): Promise<{ academyId: string }> {
  const slug = await uniqueSlug(name);
  const joinCode = await newJoinCode();
  const billing = billingEnabled();
  const academy = await prisma.$transaction(async (tx) => {
    const a = await tx.academy.create({ data: { name, slug, representativeName: user.name, status: billing ? "pending_payment" : "active", plan: billing ? "seat" : "trial" } });
    await tx.academyMember.create({ data: { academyId: a.id, userId: user.id, role: "OWNER", isTeacher: true, status: "active" } });
    await tx.classRoom.create({ data: { academyId: a.id, name: DEFAULT_CLASS_NAME, joinCode } });
    await tx.subscription.create({ data: billing ? { academyId: a.id, seatQuantity: 1, unitPrice: UNIT_PRICE, status: "pending" } : { academyId: a.id, seatQuantity: TRIAL_SEATS, unitPrice: 0, status: "active", provider: "trial" } });
    return a;
  }, { timeout: 15000 });
  await audit({ academyId: academy.id, userId: user.id, action: "academy.create", target: academy.id, detail: name });
  await setAcademyCookie(academy.id);
  return { academyId: academy.id };
}

/** 선생님 초대 수락 (초대 이메일이 지정돼 있으면 같은 계정만) */
export async function acceptTeacherInvite(user: User, token: string): Promise<OnboardResult> {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { academy: { select: { name: true } } } });
  if (!inv) return { ok: false, message: "유효하지 않은 초대 링크입니다." };
  if (inv.usedAt) return { ok: false, message: "이미 사용된 초대 링크입니다. 로그인하면 학원에 들어갈 수 있습니다.", redirectTo: "/switch" };
  if (inv.revokedAt || inv.expiresAt < new Date()) return { ok: false, message: "만료된 초대입니다 (7일). 학원장에게 다시 요청하세요." };
  if (inv.email && !userHasEmail(user, inv.email)) return { ok: false, message: `이 초대는 ${inv.email} 계정 전용입니다. 그 이메일로 로그인한 계정에서 열어주세요.` };
  if (inv.isTeacher) {
    const usage = await seatUsage(inv.academyId);
    if (usage.used + usage.pending > usage.quantity) return { ok: false, message: "학원의 선생님 자리가 부족합니다. 학원장에게 요금제에서 자리를 늘려 달라고 요청하세요." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { id: inv.id } });
      if (!fresh || fresh.usedAt) throw new Error("used");
      await tx.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
      await tx.academyMember.upsert({
        where: { academyId_userId: { academyId: inv.academyId, userId: user.id } },
        update: { status: "active", isTeacher: inv.isTeacher, role: inv.role },
        create: { academyId: inv.academyId, userId: user.id, role: inv.role, isTeacher: inv.isTeacher, status: "active" },
      });
    });
  } catch {
    return { ok: false, message: "초대를 처리하지 못했습니다. 다시 시도해주세요." };
  }
  await audit({ academyId: inv.academyId, userId: user.id, action: "invitation.accept", target: inv.id, detail: inv.email ?? undefined });
  await setAcademyCookie(inv.academyId);
  return { ok: true, message: `${inv.academy.name}에 선생님으로 참여했습니다.`, redirectTo: "/app" };
}

/** 초대 이메일과 계정 이메일(또는 붙어 있는 소셜 로그인 이메일) 비교 */
async function identityEmails(userId: string) {
  return (await prisma.userIdentity.findMany({ where: { userId }, select: { email: true } })).map((i) => i.email?.toLowerCase()).filter((x): x is string => !!x);
}
function userHasEmail(user: User, email: string) {
  return user.email.toLowerCase() === email.toLowerCase();
}
export async function userMatchesEmail(user: User, email: string) {
  if (userHasEmail(user, email)) return true;
  return (await identityEmails(user.id)).includes(email.toLowerCase());
}

/**
 * 반 코드 + 이름으로 참여.
 *   같은 이름의 (계정 없는) 학생이 그 학원에 없으면 → 새 학생을 만들어 바로 연결
 *   있으면 → 참여 요청 (선생님이 "기존 학생과 연결" 또는 "새 학생으로 추가"를 고른다)
 * 반 코드는 "이 반에 들어올 수 있다"만 증명한다. 기존 학생 기록의 소유권은 선생님 확인으로 넘어간다.
 */
export async function joinByClassCode(user: User, codeRaw: string, nameRaw: string): Promise<OnboardResult & { kind?: "linked" | "requested" }> {
  const code = codeRaw.replace(/\D/g, "");
  const name = nameRaw.trim().slice(0, 30);
  if (code.length !== 6) return { ok: false, message: "반 코드는 숫자 6자리입니다." };
  if (!name) return { ok: false, message: "이름을 입력해주세요." };
  const cls = await prisma.classRoom.findUnique({ where: { joinCode: code }, include: { academy: { select: { id: true, name: true, status: true } } } });
  if (!cls || cls.archived) return { ok: false, message: "반 코드가 맞지 않습니다. 선생님에게 다시 확인해주세요." };
  const academyId = cls.academyId;
  const already = await prisma.student.findFirst({ where: { academyId, userId: user.id } });
  if (already) {
    await setLearnCookie();
    return { ok: true, kind: "linked", message: `이미 ${cls.academy.name}에 연결되어 있습니다.`, redirectTo: "/learn" };
  }
  const sameName = await prisma.student.findMany({ where: { academyId, name, status: "active" }, orderBy: { createdAt: "asc" } });
  if (sameName.length === 0) {
    const s = await prisma.student.create({ data: { academyId, classId: cls.id, name, userId: user.id, email: user.email.includes("@noemail.") || user.email.includes("@phone.") ? null : user.email, phone: user.phone } });
    await audit({ academyId, userId: user.id, action: "student.join_code", target: s.id, detail: `${cls.name} · new` });
    await setLearnCookie();
    return { ok: true, kind: "linked", message: `${cls.academy.name} ${cls.name}에 참여했습니다.`, redirectTo: "/learn" };
  }
  // 동명 학생이 있으면 선생님 확인
  const target = sameName.find((s) => !s.userId) ?? sameName[0];
  const pending = await prisma.studentLinkRequest.findFirst({ where: { studentId: target.id, userId: user.id, status: "pending" } });
  if (!pending) await prisma.studentLinkRequest.create({ data: { studentId: target.id, userId: user.id, classId: cls.id, name } });
  await audit({ academyId, userId: user.id, action: "student.join_request", target: target.id, detail: `${cls.name} · ${name}` });
  await setLearnCookie();
  return { ok: true, kind: "requested", message: "같은 이름의 학생이 이미 명단에 있어요. 선생님이 확인하면 기존 기록과 연결됩니다.", redirectTo: "/learn" };
}

/** 문자 인증번호(휴대폰 + 6자리)로 연결. 인증번호가 곧 본인 확인이므로 바로 연결한다 */
export async function linkByPhoneCode(user: User, phoneRaw: string, codeRaw: string): Promise<OnboardResult> {
  const phone = normalizePhone(phoneRaw);
  const code = codeRaw.replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, message: "휴대폰 번호를 확인해주세요." };
  if (code.length !== 6) return { ok: false, message: "인증번호는 숫자 6자리입니다." };
  const candidates = await prisma.student.findMany({ where: { phone, userId: null, phoneCodeHash: { not: null } }, include: { academy: { select: { name: true } } } });
  const student = candidates.find((s) => s.phoneCodeHash === hashToken(code));
  if (!student) {
    await audit({ userId: user.id, action: "student.link_fail", detail: `phone ${phone.slice(-4)}` });
    return { ok: false, message: "휴대폰 번호 또는 인증번호가 맞지 않습니다." };
  }
  if (student.phoneCodeExpiresAt && student.phoneCodeExpiresAt < new Date()) return { ok: false, message: "인증번호가 만료되었습니다 (7일). 선생님에게 다시 요청하세요." };
  return linkStudent(user, student.id, "phone code");
}

/** 학생 초대 링크(/join/<token>)로 연결. 토큰이 곧 본인 확인 */
export async function linkByToken(user: User, token: string): Promise<OnboardResult> {
  const student = await prisma.student.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!student) return { ok: false, message: "유효하지 않은 링크입니다. 선생님에게 다시 요청하세요." };
  if (student.inviteExpiresAt && student.inviteExpiresAt < new Date()) return { ok: false, message: "만료된 링크입니다 (7일). 선생님에게 다시 요청하세요." };
  if (student.userId) return { ok: false, message: student.userId === user.id ? "이미 연결되어 있습니다." : "이미 다른 계정에 연결된 학생입니다.", redirectTo: student.userId === user.id ? "/learn" : undefined };
  return linkStudent(user, student.id, "invite link");
}

async function linkStudent(user: User, studentId: string, how: string): Promise<OnboardResult> {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { academy: { select: { name: true } } } });
  const dup = await prisma.student.findFirst({ where: { academyId: student.academyId, userId: user.id, id: { not: studentId } } });
  if (dup) return { ok: false, message: `이 계정은 이미 ${student.academy.name}의 다른 학생(${dup.name})에 연결되어 있습니다.` };
  await prisma.$transaction([
    prisma.student.update({ where: { id: studentId }, data: { userId: user.id, phoneCodeHash: null, phoneCodeExpiresAt: null, inviteTokenHash: null, inviteExpiresAt: null, phone: student.phone ?? user.phone } }),
    prisma.studentLinkRequest.updateMany({ where: { studentId, status: "pending" }, data: { status: "rejected" } }),
  ]);
  await audit({ academyId: student.academyId, userId: user.id, action: "student.activate", target: studentId, detail: how });
  await setLearnCookie();
  return { ok: true, message: `${student.academy.name}에 연결했습니다.`, redirectTo: "/learn" };
}
