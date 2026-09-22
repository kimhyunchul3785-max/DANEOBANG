"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { canAccessStudent } from "@/lib/scope";
import { hashToken, randomToken } from "@/lib/util";
import { appUrl } from "@/lib/oauth";

export type ActionResult = { ok: boolean; message?: string; data?: unknown };

export async function createStudentAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const parsed = z
    .object({
      name: z.string().min(1).max(30),
      school: z.string().max(40).optional(),
      grade: z.string().max(20).optional(),
      classId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "이름을 확인하세요." };
  const { name, school, grade, classId } = parsed.data;
  if (classId) {
    const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
    if (!c) return { ok: false, message: "반을 찾을 수 없습니다." };
  }
  const s = await prisma.student.create({
    data: {
      academyId: ctx.member.academyId,
      name,
      school: school || null,
      grade: grade || null,
      classId: classId || null,
      teachers: { create: { memberId: ctx.member.id } },
    },
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.create", target: s.id });
  revalidatePath("/app/students");
  return { ok: true };
}

/** 여러 줄 텍스트로 학생 일괄 등록: "이름[,학교][,학년]" */
export async function bulkCreateStudentsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const text = String(form.get("text") ?? "");
  const classId = String(form.get("classId") ?? "") || null;
  if (classId) {
    const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
    if (!c) return { ok: false, message: "반을 찾을 수 없습니다." };
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500);
  if (!lines.length) return { ok: false, message: "등록할 학생이 없습니다." };
  let n = 0;
  for (const line of lines) {
    const [name, school, grade] = line.split(/[,\t]/).map((s) => s.trim());
    if (!name) continue;
    await prisma.student.create({
      data: { academyId: ctx.member.academyId, name, school: school || null, grade: grade || null, classId, teachers: { create: { memberId: ctx.member.id } } },
    });
    n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.bulk_create", detail: `${n}명` });
  revalidatePath("/app/students");
  return { ok: true, message: `${n}명 등록했습니다.` };
}

export async function updateStudentAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const id = String(form.get("id") ?? "");
  if (!(await canAccessStudent(ctx, id))) return { ok: false, message: "권한이 없습니다." };
  const parsed = z
    .object({
      name: z.string().min(1).max(30),
      school: z.string().max(40).optional(),
      grade: z.string().max(20).optional(),
      classId: z.string().optional(),
      memo: z.string().max(500).optional(),
      status: z.enum(["active", "inactive"]).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "입력을 확인하세요." };
  const d = parsed.data;
  await prisma.student.update({
    where: { id },
    data: { name: d.name, school: d.school || null, grade: d.grade || null, classId: d.classId || null, memo: d.memo || null, status: d.status ?? "active" },
  });
  revalidatePath(`/app/students/${id}`);
  revalidatePath("/app/students");
  return { ok: true, message: "저장했습니다." };
}

/** 학생 초대 링크 발급 (7일, 일회용) */
export async function issueStudentInviteAction(studentId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!(await canAccessStudent(ctx, studentId))) return { ok: false, message: "권한이 없습니다." };
  const s = await prisma.student.findUnique({ where: { id: studentId } });
  if (!s) return { ok: false };
  if (s.userId) return { ok: false, message: "이미 계정이 연결된 학생입니다." };
  const token = randomToken(24);
  await prisma.student.update({
    where: { id: studentId },
    data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + 7 * 86400e3) },
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.invite", target: studentId });
  revalidatePath(`/app/students/${studentId}`);
  return { ok: true, data: { url: `${appUrl()}/join/${token}` } };
}

export async function revokeStudentInviteAction(studentId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!(await canAccessStudent(ctx, studentId))) return { ok: false, message: "권한이 없습니다." };
  await prisma.student.update({ where: { id: studentId }, data: { inviteTokenHash: null, inviteExpiresAt: null } });
  revalidatePath(`/app/students/${studentId}`);
  return { ok: true };
}

export async function decideLinkRequestAction(requestId: string, approve: boolean): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const r = await prisma.studentLinkRequest.findUnique({ where: { id: requestId }, include: { student: true } });
  if (!r || r.status !== "pending") return { ok: false, message: "요청을 찾을 수 없습니다." };
  if (!(await canAccessStudent(ctx, r.studentId))) return { ok: false, message: "권한이 없습니다." };
  if (!approve) {
    await prisma.studentLinkRequest.update({ where: { id: requestId }, data: { status: "rejected", decidedAt: new Date(), decidedBy: ctx.user.id } });
    revalidatePath(`/app/students/${r.studentId}`);
    return { ok: true };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.student.findUnique({ where: { id: r.studentId } });
      if (!fresh || fresh.userId) throw new Error("already_linked");
      const dup = await tx.student.findFirst({ where: { academyId: fresh.academyId, userId: r.userId } });
      if (dup) throw new Error("dup_user");
      await tx.student.update({ where: { id: r.studentId }, data: { userId: r.userId, inviteTokenHash: null, inviteExpiresAt: null } });
      await tx.studentLinkRequest.update({ where: { id: requestId }, data: { status: "approved", decidedAt: new Date(), decidedBy: ctx.user.id } });
      await tx.studentLinkRequest.updateMany({ where: { studentId: r.studentId, status: "pending", id: { not: requestId } }, data: { status: "rejected" } });
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message === "dup_user" ? "이 계정은 이미 다른 학생에 연결되어 있습니다." : "이미 연결된 학생입니다." };
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.link", target: r.studentId });
  revalidatePath(`/app/students/${r.studentId}`);
  return { ok: true, message: "계정을 연결했습니다." };
}

export async function unlinkStudentAction(studentId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!(await canAccessStudent(ctx, studentId))) return { ok: false, message: "권한이 없습니다." };
  await prisma.student.update({ where: { id: studentId }, data: { userId: null } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.unlink", target: studentId });
  revalidatePath(`/app/students/${studentId}`);
  return { ok: true };
}

/** 학원장: 담당 선생님 지정/해제 */
export async function setStudentTeachersAction(studentId: string, memberIds: string[]): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 담당 선생님을 지정할 수 있습니다." };
  if (!(await canAccessStudent(ctx, studentId))) return { ok: false, message: "권한이 없습니다." };
  const members = await prisma.academyMember.findMany({ where: { id: { in: memberIds }, academyId: ctx.member.academyId } });
  await prisma.$transaction([
    prisma.teacherStudent.deleteMany({ where: { studentId } }),
    prisma.teacherStudent.createMany({ data: members.map((m) => ({ memberId: m.id, studentId })) }),
  ]);
  revalidatePath(`/app/students/${studentId}`);
  return { ok: true, message: "담당 선생님을 저장했습니다." };
}

// ───── 반 ─────
export async function createClassAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 30) return { ok: false, message: "반 이름을 확인하세요." };
  await prisma.classRoom.create({ data: { academyId: ctx.member.academyId, name } });
  revalidatePath("/app/classes");
  return { ok: true };
}

export async function toggleClassArchiveAction(classId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
  if (!c) return { ok: false };
  await prisma.classRoom.update({ where: { id: classId }, data: { archived: !c.archived } });
  revalidatePath("/app/classes");
  return { ok: true };
}

// ───── 반복 오답으로 재시험 만들기 ─────
/** 학생 상세의 "이 n개로 재시험 만들기": 오답 단어만으로 시험을 만들어 즉시 발행·배정한다. */
export async function createWeakWordsExamAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const studentId = String(form.get("studentId") ?? "");
  const wordIds = [...new Set(form.getAll("wordIds").map(String).filter(Boolean))];
  if (!(await canAccessStudent(ctx, studentId))) return { ok: false, message: "권한이 없습니다." };
  if (!wordIds.length) return { ok: false, message: "단어를 선택하세요." };
  const words = await prisma.word.findMany({ where: { id: { in: wordIds }, book: { academyId: ctx.member.academyId } }, include: { day: true } });
  if (!words.length) return { ok: false, message: "단어를 찾을 수 없습니다." };
  // 단어장이 여러 개면 가장 많은 단어장 하나로
  const byBook = new Map<string, typeof words>();
  for (const w of words) byBook.set(w.bookId, [...(byBook.get(w.bookId) ?? []), w]);
  const [bookId, picked] = [...byBook.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const dayIds = [...new Set(picked.map((w) => w.dayId))];
  const now = new Date(Date.now() + 9 * 3600e3);
  const exam = await prisma.exam.create({
    data: {
      academyId: ctx.member.academyId,
      bookId,
      createdById: ctx.user.id,
      title: `${student.name} 반복 오답 재시험 (${now.getUTCMonth() + 1}/${now.getUTCDate()})`,
      questionCount: picked.length,
      passScore: 90,
      isRetake: true,
      scopes: { create: dayIds.map((dayId) => ({ dayId })) },
    },
  });
  const { createFormForExam } = await import("@/lib/exam-gen");
  let formId: string;
  try {
    const { form: f } = await createFormForExam(exam.id, { onlyWordIds: picked.map((w) => w.id) });
    formId = f.id;
  } catch (e) {
    await prisma.exam.delete({ where: { id: exam.id } });
    return { ok: false, message: `문항 생성 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { publishFormAction } = await import("../tests/actions");
  const pub = await publishFormAction(formId);
  if (!pub.ok) return { ok: false, message: pub.message };
  const dueAt = parseSeoulLocalOpt(form.get("dueAt"));
  await prisma.assignment.create({ data: { examId: exam.id, formId, studentId, dueAt } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.weak_words", target: studentId, detail: `${picked.length} words` });
  revalidatePath(`/app/students/${studentId}`);
  return { ok: true, message: `${picked.length}문항 재시험을 발행하고 배정했습니다. 학생 앱에 바로 보입니다.`, data: { examId: exam.id } };
}

function parseSeoulLocalOpt(v: FormDataEntryValue | null) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5])) : null;
}
