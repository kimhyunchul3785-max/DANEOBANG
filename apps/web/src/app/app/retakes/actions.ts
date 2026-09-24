"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAcademy, audit } from "@/lib/auth";
import { parseSeoulLocal } from "@/lib/util";
import { issueRetake, issueCombinedRetake, setRetakeDue, ownRetakeTask, type RetakeMode } from "@/lib/retake";
import type { ActionResult } from "../students/actions";

function refresh() {
  revalidatePath("/app/retakes");
  revalidatePath("/app");
  revalidatePath("/learn");
  revalidatePath("/learn/retake");
}

/** 재시험 출제 (한 명 또는 여러 명): 범위(오답만/같은 범위) + 마감 → 시험 생성·발행·배정·알림 */
export async function issueRetakeAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = [...new Set([...form.getAll("taskIds").map(String), String(form.get("taskId") ?? "")].filter(Boolean))];
  const mode = (String(form.get("mode") ?? "wrong") === "same" ? "same" : "wrong") as RetakeMode;
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  if (!ids.length) return { ok: false, message: "학생을 선택하세요." };
  let n = 0;
  let q = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await issueRetake(ctx, id, { mode, dueAt });
    if (r.ok) {
      n++;
      q += r.questionCount;
    } else {
      const t = await ownRetakeTask(ctx, id);
      errors.push(`${t?.student.name ?? id}: ${r.message}`);
    }
  }
  refresh();
  for (const id of ids) {
    const t = await ownRetakeTask(ctx, id);
    if (t) revalidatePath(`/app/students/${t.studentId}`);
  }
  if (!n) return { ok: false, message: errors.join(" / ") || "출제하지 못했습니다." };
  return { ok: true, message: `${n}명에게 재시험을 냈습니다 (${mode === "wrong" ? "오답만" : "같은 범위"} · ${ids.length === 1 ? `${q}문항` : `총 ${q}문항`}). 학생 앱에 바로 보이고 알림이 갑니다.${errors.length ? ` 실패: ${errors.join(" / ")}` : ""}` };
}

/** 한 학생의 출제 전 재시험 여러 건 → 누적 오답으로 시험 하나 */
export async function issueCombinedRetakeAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = [...new Set(form.getAll("taskIds").map(String).filter(Boolean))];
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  const r = await issueCombinedRetake(ctx, ids, dueAt);
  refresh();
  const t = ids[0] ? await ownRetakeTask(ctx, ids[0]) : null;
  if (t) revalidatePath(`/app/students/${t.studentId}`);
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, message: `${r.tasks}건의 오답을 모아 재시험 하나로 냈습니다 (${r.questionCount}문항). 학생 앱에 바로 보이고 알림이 갑니다.` };
}

/** 출제된 재시험의 마감 변경 */
export async function setRetakeDueAction(form: FormData): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const ids = [...new Set([...form.getAll("taskIds").map(String), String(form.get("taskId") ?? "")].filter(Boolean))];
  const dueAt = parseSeoulLocal(form.get("dueAt"));
  if (!ids.length) return { ok: false, message: "대상을 선택하세요." };
  let n = 0;
  for (const id of ids) {
    const r = await setRetakeDue(ctx, id, dueAt);
    if (r.ok) n++;
  }
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.due", detail: `${n}건 ${dueAt?.toISOString() ?? "없음"}` });
  refresh();
  return { ok: true, message: dueAt ? `${n}건의 마감을 바꿨습니다. 학생에게 알림이 갑니다.` : `${n}건의 마감을 없앴습니다.` };
}

/** 여러 건을 재시험 없이 종료 (오래된 항목 정리) */
export async function endRetakesAction(taskIds: string[]): Promise<ActionResult> {
  let n = 0;
  for (const id of taskIds.slice(0, 200)) {
    const r = await cancelRetakeAction(id);
    if (r.ok) n++;
  }
  return { ok: n > 0, message: n ? `${n}건을 재시험 없이 종료했어요.` : "종료할 항목이 없어요." };
}

export async function cancelRetakeAction(taskId: string): Promise<ActionResult> {
  const ctx = await requireAcademy();
  const t = await ownRetakeTask(ctx, taskId);
  if (!t) return { ok: false, message: "권한이 없습니다." };
  await prisma.retakeTask.update({ where: { id: taskId }, data: { status: "cancelled" } });
  // 출제된 재시험은 시험 자체를 보관 처리해 학생 화면에서 사라지게 한다 (응시 기록은 유지)
  if (t.retakeExamId) await prisma.exam.updateMany({ where: { id: t.retakeExamId, status: "published" }, data: { status: "archived" } });
  await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "retake.cancel", target: taskId });
  refresh();
  return { ok: true, message: "재시험 없이 종료했어요." };
}
