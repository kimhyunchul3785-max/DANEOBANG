"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { issueRetakeAction, setRetakeDueAction } from "./actions";

/** KST datetime-local 문자열 */
export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 16);
}
export function defaultDueInput(days = 3) {
  const l = new Date(Date.now() + 9 * 3600e3);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + days, 23, 59)).toISOString().slice(0, 16);
}

/** 범위 토글: 오답만 n문항 / 같은 범위 N문항 — 고른 쪽이 검게 칠해지고 아래에 무엇을 골랐는지 문장으로 보인다 */
export function ModeToggle({ mode, onChange, wrong, same, compact }: { mode: "wrong" | "same"; onChange: (m: "wrong" | "same") => void; wrong: number; same: number; compact?: boolean }) {
  return (
    <div className={compact ? "" : "min-w-0"}>
      <div className="seg" role="radiogroup" aria-label="재시험 범위">
        <button type="button" role="radio" aria-checked={mode === "wrong"} className={`seg-item${mode === "wrong" ? " on" : ""}`} onClick={() => onChange("wrong")} disabled={wrong === 0} title={wrong === 0 ? "오답이 없습니다" : undefined} data-testid="retake-mode-wrong">
          오답만 {wrong}
        </button>
        <button type="button" role="radio" aria-checked={mode === "same"} className={`seg-item${mode === "same" ? " on" : ""}`} onClick={() => onChange("same")} data-testid="retake-mode-same">
          같은 범위 {same}
        </button>
      </div>
      {!compact && (
        <div className="muted mt-1 text-[12px]" data-testid="retake-mode-summary">
          {mode === "wrong" ? `틀린 단어 ${wrong}개만 · ${wrong}문항` : `원 시험 범위 전체 · ${same}문항`}
        </div>
      )}
    </div>
  );
}

/** 한 명 출제: [오답만 | 같은 범위] + 마감 + 출제 */
export function IssueBox({ taskId, wrong, same }: { taskId: string; wrong: number; same: number }) {
  const [mode, setMode] = useState<"wrong" | "same">(wrong > 0 ? "wrong" : "same");
  const [due, setDue] = useState(defaultDueInput());
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="issue-box">
      <ModeToggle mode={mode} onChange={setMode} wrong={wrong} same={same} />
      <label className="block">
        <span className="lbl block">마감</span>
        <input type="datetime-local" className="input mt-1 w-[214px]" value={due} onChange={(e) => setDue(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} aria-label="재시험 마감" data-testid="issue-due" />
      </label>
      <button
        type="button"
        className="btn-accent btn-sm"
        disabled={pending}
        data-testid="issue-submit"
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("taskId", taskId);
            fd.set("mode", mode);
            fd.set("dueAt", due);
            const r = await issueRetakeAction(fd);
            toast(r.message ?? "", r.ok);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "출제 중…" : "재시험 출제"}
      </button>
    </div>
  );
}

/** 여러 명 한 번에: 체크한 학생들에게 같은 범위·마감으로 */
export function BulkIssueBar({ selected, onDone }: { selected: { id: string; wrong: number; issued: boolean }[]; onDone: () => void }) {
  const [mode, setMode] = useState<"wrong" | "same">("wrong");
  const [due, setDue] = useState(defaultDueInput());
  const [pending, start] = useTransition();
  const router = useRouter();
  const notIssued = selected.filter((s) => !s.issued);
  const issued = selected.filter((s) => s.issued);
  if (!selected.length) return null;
  return (
    <div className="card-dark card-body mb-3 flex flex-wrap items-end gap-3" data-testid="bulk-issue">
      <div>
        <div className="lbl" style={{ color: "rgba(236,233,227,0.6)" }}>
          선택 {selected.length}명
        </div>
        <div className="mt-1 text-[13px]">
          {notIssued.length ? `${notIssued.length}명 출제` : ""}
          {notIssued.length && issued.length ? " · " : ""}
          {issued.length ? `${issued.length}명 마감 변경` : ""}
        </div>
      </div>
      {notIssued.length > 0 && (
        <div className="seg" role="radiogroup" aria-label="재시험 범위">
          <button type="button" role="radio" aria-checked={mode === "wrong"} className={`seg-item${mode === "wrong" ? " on-accent" : ""}`} onClick={() => setMode("wrong")} style={mode !== "wrong" ? { color: "rgba(236,233,227,0.8)" } : undefined}>
            오답만
          </button>
          <button type="button" role="radio" aria-checked={mode === "same"} className={`seg-item${mode === "same" ? " on-accent" : ""}`} onClick={() => setMode("same")} style={mode !== "same" ? { color: "rgba(236,233,227,0.8)" } : undefined}>
            같은 범위
          </button>
        </div>
      )}
      <label className="block">
        <span className="lbl block" style={{ color: "rgba(236,233,227,0.6)" }}>
          마감
        </span>
        <input type="datetime-local" className="input mt-1 w-[214px]" value={due} onChange={(e) => setDue(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} aria-label="마감" />
      </label>
      <button
        type="button"
        className="btn-accent btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (notIssued.length) {
              const fd = new FormData();
              for (const s of notIssued) fd.append("taskIds", s.id);
              fd.set("mode", mode);
              fd.set("dueAt", due);
              const r = await issueRetakeAction(fd);
              toast(r.message ?? "", r.ok);
            }
            if (issued.length) {
              const fd = new FormData();
              for (const s of issued) fd.append("taskIds", s.id);
              fd.set("dueAt", due);
              const r = await setRetakeDueAction(fd);
              toast(r.message ?? "", r.ok);
            }
            onDone();
            router.refresh();
          })
        }
      >
        {pending ? "처리 중…" : notIssued.length ? `${notIssued.length}명 재시험 출제` : `마감 변경`}
      </button>
      <button type="button" className="btn-ghost btn-sm" style={{ color: "rgba(236,233,227,0.7)" }} onClick={onDone}>
        선택 해제
      </button>
    </div>
  );
}

/** 출제된 재시험의 마감 변경 (접힘 → 펼침) */
export function DueBox({ taskId, dueAt }: { taskId: string; dueAt: string | null }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(toLocalInput(dueAt) || defaultDueInput());
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)} data-testid="due-open">
        마감 변경
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input type="datetime-local" className="input w-[214px]" value={due} onChange={(e) => setDue(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} aria-label="재시험 마감" />
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("taskId", taskId);
            fd.set("dueAt", due);
            const r = await setRetakeDueAction(fd);
            toast(r.message ?? "", r.ok);
            if (r.ok) {
              setOpen(false);
              router.refresh();
            }
          })
        }
      >
        저장
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        닫기
      </button>
    </span>
  );
}
