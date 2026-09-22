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
  revalidatePath("/app/students");
  return { ok: true };
}

export async function toggleClassArchiveAction(classId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
  if (!c) return { ok: false };
  await prisma.classRoom.update({ where: { id: classId }, data: { archived: !c.archived } });
  revalidatePath("/app/classes");
  revalidatePath("/app/students");
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

// ───── 명단 관리: 엑셀 양식 업로드 · 일괄 반 이동 · 담당 지정 · 비활성 · 삭제 ─────

/**
 * 엑셀 양식 업로드: 시트 이름 = 반 이름, 열 = 이름 / 학교 / 학년.
 * 없는 반은 만들고, 같은 이름+학교+학년 학생이 이미 있으면 건너뛴다. 올린 선생님이 담당으로 붙는다.
 */
export async function uploadRosterAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "엑셀 파일(.xlsx)을 선택하세요." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "5MB 이하 파일만 올릴 수 있습니다." };
  const buf = Buffer.from(await file.arrayBuffer());
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) return { ok: false, message: ".xlsx 형식이 아닙니다. 양식을 내려받아 작성해 주세요." };
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, message: "엑셀 파일을 읽지 못했습니다. 양식을 내려받아 작성해 주세요." };
  }
  const existing = await prisma.student.findMany({ where: { academyId: ctx.member.academyId }, select: { name: true, school: true, grade: true } });
  const seen = new Set(existing.map((s) => `${s.name}|${s.school ?? ""}|${s.grade ?? ""}`));
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" && "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("") : typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result ?? "") : String(v)).trim();
  let created = 0;
  let skipped = 0;
  let newClasses = 0;
  const perClass: string[] = [];
  for (const ws of wb.worksheets) {
    const className = ws.name.trim();
    const rows: { name: string; school: string; grade: string }[] = [];
    ws.eachRow((row, idx) => {
      const name = cell(row.getCell(1).value);
      const school = cell(row.getCell(2).value);
      const grade = cell(row.getCell(3).value);
      if (!name) return;
      if (idx === 1 && /^(이름|name)$/i.test(name)) return; // 머리글
      if (/^예시\)/.test(name)) return; // 양식의 예시 행
      rows.push({ name: name.slice(0, 30), school: school.slice(0, 40), grade: grade.slice(0, 20) });
    });
    if (!rows.length) continue;
    const noClass = /^(sheet\d*|시트\d*|반 없음|없음)$/i.test(className);
    let classId: string | null = null;
    if (!noClass) {
      let c = await prisma.classRoom.findFirst({ where: { academyId: ctx.member.academyId, name: className } });
      if (!c) {
        c = await prisma.classRoom.create({ data: { academyId: ctx.member.academyId, name: className.slice(0, 30) } });
        newClasses++;
      } else if (c.archived) await prisma.classRoom.update({ where: { id: c.id }, data: { archived: false } });
      classId = c.id;
    }
    let n = 0;
    for (const r of rows) {
      const key = `${r.name}|${r.school}|${r.grade}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      await prisma.student.create({ data: { academyId: ctx.member.academyId, name: r.name, school: r.school || null, grade: r.grade || null, classId, teachers: { create: { memberId: ctx.member.id } } } });
      created++;
      n++;
    }
    perClass.push(`${noClass ? "반 없음" : className} ${n}명`);
  }
  if (!created && !skipped) return { ok: false, message: "학생 행이 없습니다. 1열 이름, 2열 학교, 3열 학년으로 작성해 주세요." };
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.roster_upload", detail: `${created}명 (${perClass.join(", ")})` });
  revalidatePath("/app/students");
  return { ok: true, message: `${created}명 등록${newClasses ? ` · 새 반 ${newClasses}개` : ""}${skipped ? ` · 이미 있는 ${skipped}명 제외` : ""} — ${perClass.join(", ")}` };
}

async function ownStudents(ctx: Awaited<ReturnType<typeof requireAcademy>>, ids: string[]) {
  return prisma.student.findMany({ where: { id: { in: ids }, ...canAccessWhere(ctx) }, select: { id: true, name: true } });
}
function canAccessWhere(ctx: Awaited<ReturnType<typeof requireAcademy>>) {
  return ctx.isOwner ? { academyId: ctx.member.academyId } : { academyId: ctx.member.academyId, teachers: { some: { memberId: ctx.member.id } } };
}

/** 선택 학생 반 이동 (classId 비우면 반 없음) */
export async function moveStudentsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = form.getAll("studentIds").map(String).filter(Boolean);
  const classId = String(form.get("classId") ?? "") || null;
  if (!ids.length) return { ok: false, message: "학생을 선택하세요." };
  if (classId) {
    const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
    if (!c) return { ok: false, message: "반을 찾을 수 없습니다." };
  }
  const own = await ownStudents(ctx, ids);
  await prisma.student.updateMany({ where: { id: { in: own.map((s) => s.id) } }, data: { classId } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.move_class", detail: `${own.length}명 → ${classId ?? "반 없음"}` });
  revalidatePath("/app/students");
  return { ok: true, message: `${own.length}명을 ${classId ? "이동" : "반 없음으로 변경"}했습니다.` };
}

/** 선택 학생 상태 변경 (비활성: 기록 유지, 목록·배정에서 제외) */
export async function setStudentsStatusAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = form.getAll("studentIds").map(String).filter(Boolean);
  const status = String(form.get("status") ?? "") === "inactive" ? "inactive" : "active";
  if (!ids.length) return { ok: false, message: "학생을 선택하세요." };
  const own = await ownStudents(ctx, ids);
  await prisma.student.updateMany({ where: { id: { in: own.map((s) => s.id) } }, data: { status } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.status", detail: `${own.length}명 → ${status}` });
  revalidatePath("/app/students");
  return { ok: true, message: `${own.length}명을 ${status === "inactive" ? "비활성" : "활성"}으로 바꿨습니다.` };
}

/** 선택 학생 삭제 — 학원장만. 배정·응시·성적·재시험 기록이 함께 삭제된다 */
export async function deleteStudentsAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 학생을 삭제할 수 있습니다. 선생님은 비활성 처리를 사용하세요." };
  const ids = form.getAll("studentIds").map(String).filter(Boolean);
  if (!ids.length) return { ok: false, message: "학생을 선택하세요." };
  const own = await ownStudents(ctx, ids);
  await prisma.student.deleteMany({ where: { id: { in: own.map((s) => s.id) } } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.delete", detail: own.map((s) => s.name).join(", ") });
  revalidatePath("/app/students");
  return { ok: true, message: `${own.length}명을 삭제했습니다.` };
}

/** 선택 학생에게 담당 선생님 추가/교체 — 학원장만 */
export async function assignTeacherBulkAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  if (!ctx.isOwner) return { ok: false, message: "학원장만 담당을 지정할 수 있습니다." };
  const ids = form.getAll("studentIds").map(String).filter(Boolean);
  const memberId = String(form.get("memberId") ?? "");
  const mode = String(form.get("mode") ?? "add"); // add | replace
  if (!ids.length) return { ok: false, message: "학생을 선택하세요." };
  const m = await prisma.academyMember.findFirst({ where: { id: memberId, academyId: ctx.member.academyId, status: "active" }, include: { user: { select: { name: true } } } });
  if (!m) return { ok: false, message: "선생님을 찾을 수 없습니다." };
  const own = await ownStudents(ctx, ids);
  await prisma.$transaction(async (tx) => {
    if (mode === "replace") await tx.teacherStudent.deleteMany({ where: { studentId: { in: own.map((s) => s.id) }, member: { role: "TEACHER" } } });
    for (const s of own) await tx.teacherStudent.upsert({ where: { memberId_studentId: { memberId, studentId: s.id } }, update: {}, create: { memberId, studentId: s.id } });
  });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "student.assign_teacher", detail: `${own.length}명 → ${m.user.name} (${mode})` });
  revalidatePath("/app/students");
  return { ok: true, message: `${own.length}명의 담당을 ${m.user.name} 선생님으로 ${mode === "replace" ? "교체" : "추가"}했습니다.` };
}

export async function renameClassAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const classId = String(form.get("classId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 30) return { ok: false, message: "반 이름을 확인하세요." };
  const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId } });
  if (!c) return { ok: false };
  await prisma.classRoom.update({ where: { id: classId }, data: { name } });
  revalidatePath("/app/students");
  return { ok: true, message: "반 이름을 바꿨습니다." };
}

export async function deleteClassAction(classId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const c = await prisma.classRoom.findFirst({ where: { id: classId, academyId: ctx.member.academyId }, include: { _count: { select: { students: true } } } });
  if (!c) return { ok: false };
  if (c._count.students > 0) return { ok: false, message: "학생이 있는 반은 지울 수 없습니다. 학생을 먼저 옮기세요." };
  await prisma.classRoom.delete({ where: { id: classId } });
  revalidatePath("/app/students");
  return { ok: true, message: "반을 삭제했습니다." };
}
