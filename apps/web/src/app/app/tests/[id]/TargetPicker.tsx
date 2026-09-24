"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { ActionBar } from "@/components/ActionBar";
import { assignStudentsAction } from "../actions";

const seoulNowLocal = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
const plusDaysEnd = (days: number) => {
  const l = new Date(Date.now() + 9 * 3600e3);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + days, 23, 59)).toISOString().slice(0, 16);
};
const md = (local: string) => {
  const m = local.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${+m[1]}/${+m[2]} ${m[3]}:${m[4]}` : "";
};

type Group = { id: string; name: string; students: { id: string; name: string }[] };

/**
 * 응시 대상 고르기 → 하단 [출제하기].
 * 반을 체크하면 그 반 학생 전부, 학생 칩을 하나씩 더하거나 뺄 수 있다. 누를 때까지 아무것도 나가지 않는다.
 */
export function TargetPicker({ examId, forms, groups, defaultDue, first, backTo }: { examId: string; forms: { id: string; version: number }[]; groups: Group[]; defaultDue: Date | null; first: boolean; backTo: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const [startPreset, setStartPreset] = useState<"now" | "custom">("now");
  const [startAt, setStartAt] = useState(() => seoulNowLocal());
  const [due, setDue] = useState(() => (defaultDue ? new Date(defaultDue.getTime() + 9 * 3600e3).toISOString().slice(0, 16) : plusDaysEnd(7)));
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    setStartAt(seoulNowLocal());
    if (!defaultDue) setDue(plusDaysEnd(7));
  }, [defaultDue]);
  const all = useMemo(() => groups.flatMap((g) => g.students.map((s) => s.id)), [groups]);
  const effectiveStart = startPreset === "now" ? seoulNowLocal() : startAt;
  const dueError = due && due <= effectiveStart ? "마감이 시작보다 빠르거나 같아요." : null;
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const toggleGroup = (g: Group) => {
    const ids = g.students.map((s) => s.id);
    const on = ids.every((id) => sel.includes(id));
    setSel(on ? sel.filter((x) => !ids.includes(x)) : [...new Set([...sel, ...ids])]);
  };
  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("examId", examId);
      fd.set("formId", formId);
      fd.set("startAt", startPreset === "now" ? "now" : startAt);
      fd.set("dueAt", due);
      sel.forEach((id) => fd.append("studentIds", id));
      const r = await assignStudentsAction(fd);
      toast(r.message ?? (r.ok ? "" : "출제하지 못했어요."), r.ok);
      if (r.ok) {
        const n = (r.data as { issued?: number } | undefined)?.issued ?? sel.length;
        setSel([]);
        router.replace(`${backTo}?issued=${n}`);
        router.refresh();
      }
    });
  return (
    <section className="card" data-testid="assign-panel">
      <div className="sec-h px-5 pb-2 pt-4">
        <h2 className="sec-t">{first ? "응시 대상 고르기" : "대상 더하기"}</h2>
        <span className="text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
          학생 {all.length}명
        </span>
      </div>
      {all.length === 0 ? (
        <p className="muted px-5 pb-5">더할 학생이 없어요.</p>
      ) : (
        <div className="space-y-1 px-5 pb-3">
          {groups.map((g) => {
            const ids = g.students.map((s) => s.id);
            const on = ids.every((id) => sel.includes(id));
            const some = !on && ids.some((id) => sel.includes(id));
            return (
              <div key={g.id} className="border-t border-[var(--line)] py-3 first:border-t-0">
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold" data-testid="pick-class" data-class={g.name}>
                  <input
                    type="checkbox"
                    checked={on}
                    ref={(el) => {
                      if (el) el.indeterminate = some;
                    }}
                    onChange={() => toggleGroup(g)}
                    style={{ width: 18, height: 18 }}
                  />
                  {g.name}
                  <span className="text-[12.5px] font-medium tabular-nums" style={{ color: "var(--ink-3)" }}>
                    {ids.filter((id) => sel.includes(id)).length}/{ids.length}
                  </span>
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-[28px]">
                  {g.students.map((s) => (
                    <button key={s.id} type="button" className={`chip${sel.includes(s.id) ? " on" : ""}`} aria-pressed={sel.includes(s.id)} onClick={() => toggle(s.id)} data-testid="pick-student">
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid gap-3 border-t border-[var(--line)] px-5 py-4 sm:grid-cols-[auto_minmax(0,260px)_auto]">
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
          <label className="label" htmlFor="assign-due">
            마감
          </label>
          <input id="assign-due" className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} data-testid="assign-due-input" />
          {dueError && (
            <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--accent)" }} role="alert">
              {dueError}
            </p>
          )}
        </div>
        {forms.length > 1 && (
          <div>
            <label className="label" htmlFor="assign-form">
              문항
            </label>
            <select id="assign-form" className="input" value={formId} onChange={(e) => setFormId(e.target.value)}>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  v{f.version}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="px-3 pb-3">
        <ActionBar testId="issue-bar" note={sel.length ? `${sel.length}명 선택 · ${startPreset === "now" ? "지금 시작" : `${md(startAt)} 시작`} · ${md(due)} 마감` : "대상을 고르세요"}>
          <button type="button" className="btn-primary" disabled={!sel.length || !!dueError || pending} onClick={submit} data-testid="assign-add">
            {pending ? "출제 중…" : sel.length ? `출제하기 · ${sel.length}명` : "출제하기"}
          </button>
        </ActionBar>
      </div>
    </section>
  );
}
