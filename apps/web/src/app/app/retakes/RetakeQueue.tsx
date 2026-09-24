"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { fmtMDHM } from "@/lib/util";
import { IssueBox, DueBox, BulkIssueBar, defaultDueInput } from "./RetakeCreate";
import { cancelRetakeAction, issueRetakeAction, endRetakesAction, issueCombinedRetakeAction } from "./actions";

export type RetakeRow = {
  id: string;
  studentId: string;
  studentName: string;
  className: string | null;
  round: number;
  kind: string;
  sourceTitle: string;
  sourceAttemptId: string | null;
  score: number | null;
  wrong: number;
  same: number;
  status: string;
  dueAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  retakeExamId: string | null;
  retakeTitle: string | null;
  retakeState: "waiting" | "in_progress" | "done" | null;
  retakeScore: number | null;
  retakePassed: boolean | null;
  retakeAttemptId: string | null;
};

const STALE_DAYS = 56; // 8주

/** 재시험 한 줄: 상태 · [오답만 | 같은 범위] + 마감 + 출제 · 재시험 없이 종료 */
function Row({ r, checked, onToggle, now, primary }: { r: RetakeRow; checked: boolean; onToggle: () => void; now: number; primary: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const isOpen = r.status === "pending" || r.status === "issued";
  const overdue = r.dueAt && new Date(r.dueAt).getTime() < now && r.retakeState !== "done";
  const end = () => {
    if (!confirm(`${r.studentName} 학생의 "${r.sourceTitle}" 재시험 없이 종료할까요?\n재시험을 내지 않고 이 항목을 닫습니다. 원 시험 점수는 그대로 남아요.`)) return;
    start(async () => {
      const res = await cancelRetakeAction(r.id);
      toast(res.message ?? "", res.ok);
      if (res.ok) router.refresh();
    });
  };
  return (
    <li className="py-2.5" style={{ borderTop: "1px solid var(--line)" }} data-testid="retake-row" data-task={r.id} data-score={r.score ?? ""} data-wrong={r.wrong} data-when={r.dueAt ? new Date(r.dueAt).getTime() : ""}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {isOpen ? <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${r.studentName} · ${r.sourceTitle} 선택`} style={{ width: 18, height: 18 }} /> : <span style={{ width: 18 }} />}
        <span className="min-w-0 flex-1 text-[13.5px]">
          <Link href={`/app/tests?q=${encodeURIComponent(r.sourceTitle)}`} className="hover:underline" title="→ 시험 탭">
            {r.sourceTitle}
          </Link>
          {r.round > 1 && <span className="badge-amber ml-1.5">{r.round}차</span>}
          {r.kind === "weak_words" && <span className="badge-gray ml-1.5">반복 오답</span>}
          <span className="muted ml-2">
            {r.score !== null ? `${r.score}점 · ` : ""}틀림 {r.wrong}
          </span>
        </span>

        {/* 상태 한 단어 */}
        {r.status === "completed" ? (
          <span className="badge-green" data-testid="retake-status">
            통과{r.retakeScore !== null ? ` · ${r.retakeScore}점` : ""}
          </span>
        ) : r.status === "cancelled" ? (
          <span className="badge-gray" data-testid="retake-status">
            종료
          </span>
        ) : !r.retakeExamId ? (
          <span className="badge-amber" data-testid="retake-status">
            출제 전
          </span>
        ) : r.retakeState === "done" ? (
          <span className={r.retakePassed ? "badge-green" : "badge-red"} data-testid="retake-status">
            {r.retakePassed ? "통과" : "미달"} · {r.retakeScore}점
          </span>
        ) : (
          <span className={overdue ? "badge-red" : "badge-blue"} data-testid="retake-status" title={r.issuedAt ? `출제 ${fmtMDHM(r.issuedAt)}` : undefined}>
            {r.retakeState === "in_progress" ? "응시 중" : "응시 대기"} · {r.dueAt ? `${fmtMDHM(r.dueAt)}까지` : "마감 없음"}
            {overdue ? " · 지남" : ""}
          </span>
        )}

        {/* 동작: 출제 전 = 기본값으로 바로 [출제] + [조정] · 출제됨 = [마감 변경] · 둘 다 [재시험 없이 종료] */}
        {isOpen && (
          <span className="flex w-full items-center justify-end gap-1 pl-[30px] sm:w-auto sm:pl-0">
            {/* 출제 전: [오답만 | 같은 범위] + 마감 + 출제 — 한 줄에서 바로 */}
            {!r.retakeExamId && <IssueBox taskId={r.id} wrong={r.wrong} same={r.same} />}
            {r.retakeExamId && <DueBox taskId={r.id} dueAt={r.dueAt} />}
            {r.retakeAttemptId && (
              <Link href={`/app/results?studentId=${r.studentId}#detail`} className="btn-ghost btn-sm retake-btn" title="→ 성적 탭">
                성적 →
              </Link>
            )}
            <button type="button" className="btn-ghost btn-sm retake-btn" disabled={pending} onClick={end} title="재시험을 내지 않고 이 항목을 닫습니다" data-testid="retake-end">
              <span className="sm:hidden">종료</span>
              <span className="hidden sm:inline">재시험 없이 종료</span>
            </button>
          </span>
        )}
        {!isOpen && r.retakeAttemptId && (
          <Link href={`/app/results?studentId=${r.studentId}#detail`} className="btn-ghost btn-sm" title="→ 성적 탭">
            성적 →
          </Link>
        )}
      </div>
    </li>
  );
}

/** 한 학생의 출제 전 여러 건 → 누적 오답으로 한 번에 (학생 그룹의 주 버튼) */
function CombinedIssue({ rows }: { rows: RetakeRow[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const due = defaultDueInput();
  const words = rows.reduce((n, r) => n + r.wrong, 0);
  return (
    <button
      type="button"
      className="btn-primary btn-sm retake-btn"
      disabled={pending}
      data-testid="issue-combined"
      title={`출제 전 ${rows.length}건의 오답(중복 제거)을 모아 재시험 하나로 · ${due.slice(5, 10).replace("-", "/")}까지`}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          rows.forEach((r) => fd.append("taskIds", r.id));
          fd.set("dueAt", due);
          const res = await issueCombinedRetakeAction(fd);
          toast(res.message ?? "", res.ok);
          if (res.ok) router.refresh();
        })
      }
    >
      {pending ? (
        "출제 중…"
      ) : (
        <>
          {rows.length}건 한 번에 출제<span className="hidden sm:inline"> · 누적 오답 최대 {words}개</span>
        </>
      )}
    </button>
  );
}

/** 재시험 큐 — 학생별로 묶어서. 항목이 많은 학생은 접힌다. 체크하면 여러 명 한 번에 출제·마감 변경 */
export function RetakeQueue({ rows }: { rows: RetakeRow[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const now = Date.now();
  const openRows = rows.filter((r) => r.status === "pending" || r.status === "issued");
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const allOn = openRows.length > 0 && openRows.every((r) => sel.includes(r.id));
  const stale = openRows.filter((r) => new Date(r.issuedAt ?? r.createdAt).getTime() < now - STALE_DAYS * 86400e3);

  // 학생별 묶기 (등장 순서 유지)
  const groups: { key: string; name: string; className: string | null; rows: RetakeRow[] }[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.key === r.studentId);
    if (!g) {
      g = { key: r.studentId, name: r.studentName, className: r.className, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return (
    <>
      <BulkIssueBar selected={rows.filter((r) => sel.includes(r.id)).map((r) => ({ id: r.id, wrong: r.wrong, issued: !!r.retakeExamId }))} onDone={() => setSel([])} />
      {stale.length > 0 && (
        <div className="card-2 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-[13px]" data-testid="stale-notice">
          <span>
            <b>{STALE_DAYS / 7}주 넘게</b> 남아 있는 항목 {stale.length}건
          </span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={pending}
            data-testid="stale-end"
            onClick={() => {
              if (!confirm(`오래된 ${stale.length}건을 재시험 없이 종료할까요? 원 시험 점수는 그대로 남아요.`)) return;
              start(async () => {
                const r = await endRetakesAction(stale.map((s) => s.id));
                toast(r.message ?? "", r.ok);
                if (r.ok) router.refresh();
              });
            }}
          >
            오래된 {stale.length}건 정리
          </button>
        </div>
      )}
      <div className="mb-1 flex items-center gap-3 px-1">
        <label className="flex items-center gap-2 whitespace-nowrap text-[12px]" style={{ color: "var(--ink-2)" }}>
          <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : openRows.map((r) => r.id))} aria-label="미완료 전체 선택" style={{ width: 18, height: 18 }} />
          전체 선택
        </label>
      </div>
      <ul id="retake-queue">
        {groups.map((g) => {
          const openN = g.rows.filter((r) => r.status === "pending" || r.status === "issued").length;
          const notIssued = g.rows.filter((r) => !r.retakeExamId && (r.status === "pending" || r.status === "issued")).length;
          const collapsed = g.rows.length > 2 && !opened[g.key];
          const shown = collapsed ? g.rows.slice(0, 2) : g.rows;
          return (
            <li key={g.key} className="py-2" data-testid="retake-group" data-student={g.name}>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="flex items-center gap-2">
                  <Link href={`/app/students?q=${encodeURIComponent(g.name)}`} className="card-title whitespace-nowrap hover:underline" title="→ 학생 탭">
                    {g.name}
                  </Link>
                  <span className="muted whitespace-nowrap">{g.className}</span>
                  <span className="digital whitespace-nowrap" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {g.rows.length}건{openN ? ` · 미완료 ${openN}` : ""}
                    {notIssued ? ` · 출제 전 ${notIssued}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                {notIssued >= 2 && <CombinedIssue rows={g.rows.filter((r) => !r.retakeExamId && (r.status === "pending" || r.status === "issued"))} />}
                {g.rows.length > 2 && (
                  <button type="button" className="lbl-ink hover:underline" onClick={() => setOpened({ ...opened, [g.key]: collapsed })} data-testid="group-toggle">
                    {collapsed ? `${g.rows.length - 2}건 더 ▾` : "접기 ▴"}
                  </button>
                )}
                </span>
              </div>
              <ul>
                {shown.map((r) => (
                  <Row key={r.id} r={r} checked={sel.includes(r.id)} onToggle={() => toggle(r.id)} now={now} primary={notIssued < 2} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}
