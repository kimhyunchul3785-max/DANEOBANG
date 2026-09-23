"use client";
import { useEffect, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { assignStudentsAction } from "../actions";

const seoulNowLocal = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
const plusDays = (local: string, days: number) => {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days, +m[4], +m[5])).toISOString().slice(0, 16) : local;
};

/**
 * 응시 대상 추가 — 출제할 때 정한 대상에 빠진 학생을 더한다 (반 전체 또는 개별).
 * 시작은 기본 "지금", 마감은 기존 대상과 같게 (없으면 7일 뒤).
 */
export function AssignPanel({ examId, forms, students, classes, defaultDue }: { examId: string; forms: { id: string; version: number }[]; students: { id: string; name: string; className: string | null }[]; classes: { id: string; name: string; count: number }[]; defaultDue: Date | null }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [startPreset, setStartPreset] = useState<"now" | "custom">("now");
  const [startAt, setStartAt] = useState(() => seoulNowLocal());
  const [due, setDue] = useState(() => (defaultDue ? new Date(defaultDue.getTime() + 9 * 3600e3).toISOString().slice(0, 16) : plusDays(seoulNowLocal(), 7)));
  useEffect(() => {
    // 서버 렌더 시각 → 브라우저 시각으로 한 번 맞춘다
    setStartAt(seoulNowLocal());
    if (!defaultDue) setDue(plusDays(seoulNowLocal(), 7));
  }, [defaultDue]);
  const effectiveStart = startPreset === "now" ? seoulNowLocal() : startAt;
  const dueError = due && due <= effectiveStart ? "마감이 시작보다 빠르거나 같아요." : null;
  return (
    <div className="card card-body" data-testid="assign-panel">
      <div className="lbl">Add · 대상 추가</div>
      <p className="muted mt-1">아직 대상이 아닌 학생 {students.length}명. 반을 고르거나 개별로 체크하세요.</p>
      <ActionForm action={assignStudentsAction} className="mt-3 space-y-3" onSuccess={() => setSel([])}>
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="startAt" value={startPreset === "now" ? "now" : startAt} />
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
        <select className="input" name="classId" defaultValue="" aria-label="반 전체 추가" disabled={classes.length === 0}>
          <option value="">{classes.length === 0 ? "더할 수 있는 반이 없어요" : "반 전체 추가 (선택)"}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} 전체 · {c.count}명
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
        <div>
          <div className="label">시작</div>
          <div className="seg" role="radiogroup" aria-label="시작 시각">
            <button type="button" role="radio" aria-checked={startPreset === "now"} className={`seg-item${startPreset === "now" ? " on" : ""}`} onClick={() => setStartPreset("now")} data-testid="assign-start-now">
              지금
            </button>
            <button type="button" role="radio" aria-checked={startPreset === "custom"} className={`seg-item${startPreset === "custom" ? " on" : ""}`} onClick={() => setStartPreset("custom")} data-testid="assign-start-custom">
              예약
            </button>
          </div>
          {startPreset === "custom" && <input className="input mt-2" type="datetime-local" value={startAt} min={seoulNowLocal()} onChange={(e) => setStartAt(e.target.value)} aria-label="시작 일시" data-testid="assign-start-input" />}
        </div>
        <div>
          <label className="label">마감 {defaultDue ? "· 기존 대상과 같게" : "· 기본 7일 뒤"}</label>
          <input className="input" type="datetime-local" name="dueAt" value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감 일시" data-testid="assign-due-input" />
          {dueError && (
            <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--accent)" }} role="alert">
              {dueError}
            </p>
          )}
        </div>
        <button className="btn-primary w-full" data-testid="assign-add" disabled={!!dueError}>
          대상에 추가
        </button>
      </ActionForm>
    </div>
  );
}
