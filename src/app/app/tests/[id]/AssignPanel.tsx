"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { assignStudentsAction } from "../actions";

export function AssignPanel({ examId, forms, students, classes }: { examId: string; forms: { id: string; version: number }[]; students: { id: string; name: string; className: string | null }[]; classes: { id: string; name: string }[] }) {
  const [sel, setSel] = useState<string[]>(students.map((s) => s.id));
  return (
    <div className="card card-body">
      <h2 className="h2 mb-2">학생 배정</h2>
      <ActionForm action={assignStudentsAction} className="space-y-2" onSuccess={() => setSel([])}>
        <input type="hidden" name="examId" value={examId} />
        <div>
          <label className="label">문항 버전</label>
          <select className="input" name="formId" defaultValue={forms[0].id}>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                v{f.version}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">반 전체 배정 (선택)</label>
          <select className="input" name="classId" defaultValue="">
            <option value="">선택 안 함</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">개별 학생 (미배정 {students.length}명 · 기본 전체 선택)</label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
            {students.length === 0 && <span className="muted">모든 학생이 배정되었습니다.</span>}
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" name="studentIds" value={s.id} checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />
                {s.name} <span className="text-xs text-slate-400">{s.className ?? ""}</span>
              </label>
            ))}
          </div>
          {students.length > 0 && (
            <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setSel(sel.length === students.length ? [] : students.map((s) => s.id))}>
              {sel.length === students.length ? "전체 해제" : "전체 선택"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">시작 (선택)</label>
            <input className="input" type="datetime-local" name="startAt" />
          </div>
          <div>
            <label className="label">마감 (선택)</label>
            <input className="input" type="datetime-local" name="dueAt" />
          </div>
        </div>
        <button className="btn-primary w-full">배정</button>
      </ActionForm>
    </div>
  );
}
