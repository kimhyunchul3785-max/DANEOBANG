"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { printAssignmentsAction } from "../actions";

/** 종이 시험지 발급: 아직 온라인으로 시작하지 않은 학생에게 학생별 PDF(QR 다름) 생성 */
export function PrintBatchForm({ examId, assignments }: { examId: string; assignments: { id: string; name: string; mode: string | null; status: string }[] }) {
  const [open, setOpen] = useState(false);
  const eligible = assignments.filter((a) => a.mode !== "online" && a.status !== "completed");
  return (
    <div className="w-full">
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(!open)} data-testid="print-open">
        종이 시험지 발급 · 학생별 PDF {open ? "▲" : "▼"}
      </button>
      {open && (
        <ActionForm action={printAssignmentsAction} className="mt-2" onSuccess={() => setOpen(false)}>
          <input type="hidden" name="examId" value={examId} />
          <p className="muted mb-1">발급하면 그 학생의 응시 방식이 &lsquo;종이&rsquo;로 잠깁니다. 재출력은 표의 PDF 버튼(같은 문항·정답).</p>
          <div className="flex flex-wrap gap-1.5">
            {eligible.map((a) => (
              <label key={a.id} className="chip">
                <input type="checkbox" name="assignmentIds" value={a.id} defaultChecked className="mr-1" />
                {a.name}
              </label>
            ))}
            {eligible.length === 0 && <span className="muted">발급 가능한 학생이 없습니다 (모두 온라인 응시 중이거나 완료).</span>}
          </div>
          <button className="btn-primary btn-sm mt-2" disabled={eligible.length === 0} data-testid="print-issue">
            선택 학생 시험지 생성 ({eligible.length}명)
          </button>
        </ActionForm>
      )}
    </div>
  );
}
