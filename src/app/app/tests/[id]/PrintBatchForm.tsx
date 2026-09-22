"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { printAssignmentsAction } from "../actions";

export function PrintBatchForm({ examId, assignments }: { examId: string; assignments: { id: string; name: string; mode: string | null; status: string }[] }) {
  const [open, setOpen] = useState(false);
  const eligible = assignments.filter((a) => a.mode !== "online" && a.status !== "completed");
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(!open)}>
        종이 시험지 발급 (학생별 PDF · QR 마킹) {open ? "▲" : "▼"}
      </button>
      {open && (
        <ActionForm action={printAssignmentsAction} className="mt-2" onSuccess={() => setOpen(false)}>
          <input type="hidden" name="examId" value={examId} />
          <p className="muted mb-1">종이 발급 시 응시 방식이 &lsquo;종이&rsquo;로 잠깁니다. 재출력은 목록의 PDF 링크를 사용하세요 (같은 문항·정답).</p>
          <div className="flex flex-wrap gap-2">
            {eligible.map((a) => (
              <label key={a.id} className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
                <input type="checkbox" name="assignmentIds" value={a.id} defaultChecked />
                {a.name}
              </label>
            ))}
            {eligible.length === 0 && <span className="muted">발급 가능한 학생이 없습니다.</span>}
          </div>
          <button className="btn-primary btn-sm mt-2" disabled={eligible.length === 0}>
            선택 학생 시험지 생성
          </button>
        </ActionForm>
      )}
    </div>
  );
}
