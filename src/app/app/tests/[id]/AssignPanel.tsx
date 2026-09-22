"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { assignStudentsAction } from "../actions";

/**
 * 응시 대상 추가 — 출제할 때 정한 대상에 빠진 학생을 더한다 (반 전체 또는 개별).
 * 기본 마감은 기존 대상과 같게 맞춘다.
 */
export function AssignPanel({ examId, forms, students, classes, defaultDue }: { examId: string; forms: { id: string; version: number }[]; students: { id: string; name: string; className: string | null }[]; classes: { id: string; name: string }[]; defaultDue: Date | null }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const due = defaultDue ? new Date(defaultDue.getTime() + 9 * 3600e3).toISOString().slice(0, 16) : "";
  return (
    <div className="card card-body" data-testid="assign-panel">
      <div className="lbl">Add · 대상 추가</div>
      <p className="muted mt-1">아직 대상이 아닌 학생 {students.length}명. 반을 고르거나 개별로 체크하세요.</p>
      <ActionForm action={assignStudentsAction} className="mt-3 space-y-2" onSuccess={() => setSel([])}>
        <input type="hidden" name="examId" value={examId} />
        {forms.length > 1 ? (
          <select className="input" name="formId" defaultValue={forms[0].id} aria-label="문항 버전">
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                문항 v{f.version}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="formId" value={forms[0].id} />
        )}
        <select className="input" name="classId" defaultValue="" aria-label="반 전체 추가">
          <option value="">반 전체 추가 (선택)</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} 전체
            </option>
          ))}
        </select>
        <div>
          <button type="button" className="lbl-ink" onClick={() => setOpen(!open)} data-testid="assign-toggle-list">
            개별 학생 {open ? "접기 ▲" : `고르기 ▼`}
            {sel.length ? ` · ${sel.length}명 선택` : ""}
          </button>
          {open && (
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl p-2 text-[13px]" style={{ background: "var(--surface-2)" }}>
              {students.length === 0 && <span className="muted">모든 학생이 이미 대상입니다.</span>}
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" name="studentIds" value={s.id} checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />
                  {s.name} <span className="muted text-[12px]">{s.className ?? ""}</span>
                </label>
              ))}
              {students.length > 0 && (
                <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setSel(sel.length === students.length ? [] : students.map((s) => s.id))}>
                  {sel.length === students.length ? "전체 해제" : "전체 선택"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">시작 (선택)</label>
            <input className="input" type="datetime-local" name="startAt" />
          </div>
          <div>
            <label className="label">마감</label>
            <input className="input" type="datetime-local" name="dueAt" defaultValue={due} />
          </div>
        </div>
        <button className="btn-primary w-full" data-testid="assign-add">
          대상에 추가
        </button>
      </ActionForm>
    </div>
  );
}
