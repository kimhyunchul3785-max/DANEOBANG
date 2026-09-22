"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { createFormForExam } from "@/lib/exam-gen";
import { parseJSON, parseSeoulLocal } from "@/lib/util";
import type { ActionResult } from "../students/actions";

async function ownTask(ctx: Awaited<ReturnType<typeof requireAcademy>>, taskId: string) {
  return prisma.retakeTask.findFirst({
    where: { id: taskId, student: studentScope(ctx) },
    include: { student: true, sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { include: { scopes: true } }, form: { include: { items: true } } } } } } },
  });
}

/** 기한 지정 (일괄 가능) */
export async function setRetakeDueAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = form.getAll("taskIds").map(String);
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  if (!ids.length) return { ok: false, message: "대상을 선택하세요." };
  let n = 0;
  for (const id of ids) {
    const t = await ownTask(ctx, id);
    if (!t || t.status === "completed" || t.status === "cancelled") continue;
    await prisma.retakeTask.update({ where: { id }, data: { dueAt } });
    if (t.retakeExamId) await prisma.assignment.updateMany({ where: { examId: t.retakeExamId, studentId: t.studentId }, data: { dueAt } });
    n++;
  }
  revalidatePath("/app/retakes");
  return { ok: true, message: `${n}건의 기한을 ${dueAt ? "지정" : "해제"}했습니다.` };
}

/**
 * 재시험 생성: 같은 DAY 범위 새 시험 또는 틀린 항목만.
 * 오답 1개여도 보기 후보는 원시험 전체 범위에서 가져온다. 생성된 초안은 교사 검토 후 발행 → 자동 배정.
 */
export async function createRetakeExamAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const taskId = String(form.get("taskId") ?? "");
  const mode = String(form.get("mode") ?? "wrong");
  const t = await ownTask(ctx, taskId);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  if (t.status === "completed" || t.status === "cancelled") return { ok: false, message: "이미 완료/취소된 재시험입니다." };
  if (t.retakeExamId) return { ok: false, message: "이미 재시험이 만들어졌습니다." };
  const src = t.sourceAttempt.assignment.exam;
  const grade = t.sourceAttempt.grades[0];
  if (!grade) return { ok: false, message: "원 시험 채점 결과가 없습니다." };
  const results = parseJSON<{ itemId: string; correct: boolean }[]>(grade.itemResults, []);
  const wrongItemIds = results.filter((r) => !r.correct).map((r) => r.itemId);
  const wrongWordIds = t.sourceAttempt.assignment.form.items.filter((i) => wrongItemIds.includes(i.id)).map((i) => i.wordId);
  const questionCount = mode === "wrong" ? Math.max(1, wrongWordIds.length) : src.questionCount;
  const exam = await prisma.exam.create({
    data: {
      academyId: ctx.member.academyId,
      bookId: src.bookId,
      createdById: ctx.user.id,
      title: `${src.title} 재시험 (${t.student.name})`,
      questionCount,
      passScore: src.passScore,
      timeLimitMin: src.timeLimitMin,
      secondsPerItem: src.secondsPerItem,
      scoreVisibility: src.scoreVisibility,
      answerVisibility: src.answerVisibility,
      isRetake: true,
      scopes: { create: src.scopes.map((s) => ({ dayId: s.dayId })) },
    },
  });
  let formId: string;
  try {
    const { form } = await createFormForExam(exam.id, mode === "wrong" ? { onlyWordIds: wrongWordIds } : undefined);
    formId = form.id;
  } catch (e) {
    await prisma.exam.delete({ where: { id: exam.id } });
    return { ok: false, message: `재시험 문항 생성 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
  await prisma.retakeTask.update({ where: { id: taskId }, data: { retakeExamId: exam.id, status: "scheduled" } });
  // 조작 단축: 바로 발행 + 자동 배정 (기한 = task 기한). 문항은 시험 화면에서 확인·정정 가능
  const { publishFormAction } = await import("../tests/actions");
  const pub = await publishFormAction(formId);
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.create", target: taskId, detail: `${mode}${pub.ok ? " published" : ""}` });
  revalidatePath("/app/retakes");
  return { ok: true, message: pub.ok ? "재시험을 발행하고 학생에게 배정했습니다. 학생 화면에 바로 나타납니다." : `재시험 초안을 만들었습니다 (발행 실패: ${pub.message})`, data: { examId: exam.id } };
}

/** 보강(재시험) 일정 지정: 날짜·시간 + 메모. 기한이 비어 있으면 보강일 23:59 로 맞춘다. */
export async function scheduleRetakeAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = form.getAll("taskIds").map(String).filter(Boolean);
  const single = String(form.get("taskId") ?? "");
  if (single) ids.push(single);
  const scheduledAt = parseSeoulLocal(form.get("scheduledAt"));
  const note = String(form.get("note") ?? "").trim() || null;
  if (!ids.length) return { ok: false, message: "대상을 선택하세요." };
  let n = 0;
  for (const id of ids) {
    const t = await ownTask(ctx, id);
    if (!t || t.status === "completed" || t.status === "cancelled") continue;
    const dueAt = t.dueAt ?? (scheduledAt ? new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate(), 14, 59) + (scheduledAt.getUTCHours() >= 15 ? 86400e3 : 0)) : null);
    await prisma.retakeTask.update({ where: { id }, data: { scheduledAt, note, dueAt } });
    if (t.retakeExamId) await prisma.assignment.updateMany({ where: { examId: t.retakeExamId, studentId: t.studentId }, data: { dueAt } });
    n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.schedule", detail: `${n}건 ${scheduledAt?.toISOString() ?? "해제"}` });
  revalidatePath("/app/retakes");
  revalidatePath("/app");
  return { ok: true, message: scheduledAt ? `${n}건의 보강 일정을 잡았습니다. 학생 앱에 표시됩니다.` : `${n}건의 일정을 해제했습니다.` };
}

export async function cancelRetakeAction(taskId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const t = await ownTask(ctx, taskId);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  await prisma.retakeTask.update({ where: { id: taskId }, data: { status: "cancelled" } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.cancel", target: taskId });
  revalidatePath("/app/retakes");
  return { ok: true };
}
