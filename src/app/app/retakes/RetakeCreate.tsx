"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { createRetakeExamAction, scheduleRetakeAction } from "./actions";

export function RetakeCreate({ taskId }: { taskId: string }) {
  const router = useRouter();
  const go = () => router.refresh();
  return (
    <span className="inline-flex gap-1">
      <ActionForm action={createRetakeExamAction} className="inline" onSuccess={go}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="mode" value="wrong" />
        <button className="btn-accent btn-sm">오답만 재시험</button>
      </ActionForm>
      <ActionForm action={createRetakeExamAction} className="inline" onSuccess={go}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="mode" value="same" />
        <button className="btn-secondary btn-sm">같은 범위</button>
      </ActionForm>
    </span>
  );
}

/** 보강 일정: 날짜·시간 입력 → 저장. 학생 앱 홈에 바로 표시된다. */
export function ScheduleBox({ taskId, scheduledAt, note }: { taskId: string; scheduledAt: string | null; note: string | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const local = scheduledAt ? new Date(new Date(scheduledAt).getTime() + 9 * 3600e3).toISOString().slice(0, 16) : "";
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {scheduledAt ? "일정 변경" : "보강 일정"}
      </button>
    );
  return (
    <ActionForm
      action={scheduleRetakeAction}
      className="flex flex-wrap items-center gap-1"
      onSuccess={() => {
        setOpen(false);
        router.refresh();
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input className="input w-48" type="datetime-local" name="scheduledAt" defaultValue={local} aria-label="보강 일시" style={{ padding: "6px 10px" }} />
      <input className="input w-36" name="note" defaultValue={note ?? ""} placeholder="메모 (교실 등)" maxLength={60} style={{ padding: "6px 10px" }} />
      <button className="btn-primary btn-sm">저장</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        닫기
      </button>
    </ActionForm>
  );
}
