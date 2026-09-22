"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { fmtMDHM } from "@/lib/util";
import { IssueBox, DueBox, BulkIssueBar } from "./RetakeCreate";
import { cancelRetakeAction } from "./actions";

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
  retakeExamId: string | null;
  retakeState: "waiting" | "in_progress" | "done" | null;
  retakeScore: number | null;
  retakePassed: boolean | null;
  retakeAttemptId: string | null;
};

/** 재시험 큐 (체크 → 여러 명 한 번에 출제·마감 변경) */
export function RetakeQueue({ rows }: { rows: RetakeRow[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const openRows = rows.filter((r) => r.status === "pending" || r.status === "issued");
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const allOn = openRows.length > 0 && openRows.every((r) => sel.includes(r.id));
  const now = Date.now();
  return (
    <>
      <BulkIssueBar selected={rows.filter((r) => sel.includes(r.id)).map((r) => ({ id: r.id, wrong: r.wrong, issued: !!r.retakeExamId }))} onDone={() => setSel([])} />
      <div className="mb-1 flex items-center gap-3 px-1">
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
          <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : openRows.map((r) => r.id))} aria-label="미완료 전체 선택" />
          전체 선택
        </label>
        <span className="muted text-[12px]">체크하면 여러 명을 같은 범위·마감으로 한 번에 낼 수 있습니다.</span>
      </div>
      <ul id="retake-queue">
        {rows.map((r) => {
          const isOpen = r.status === "pending" || r.status === "issued";
          const overdue = r.dueAt && new Date(r.dueAt).getTime() < now && r.retakeState !== "done";
          return (
            <li key={r.id} className="row flex-wrap gap-x-5 gap-y-2 !py-3.5" data-testid="retake-row" data-task={r.id} data-score={r.score ?? ""} data-wrong={r.wrong} data-when={r.dueAt ? new Date(r.dueAt).getTime() : ""} style={sel.includes(r.id) ? { background: "rgba(27,26,24,0.04)" } : undefined}>
              <div className="flex min-w-[220px] flex-1 items-start gap-3">
                {isOpen ? <input type="checkbox" className="mt-1.5" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.studentName} 선택`} /> : <span className="w-[13px]" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/students/${r.studentId}`} className="card-title hover:underline">
                      {r.studentName}
                    </Link>
                    <span className="muted">{r.className}</span>
                    {r.round > 1 && <span className="badge-amber">{r.round}차</span>}
                    {r.kind === "weak_words" && <span className="badge-gray">반복 오답</span>}
                  </div>
                  <div className="muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    {r.sourceAttemptId ? (
                      <Link href={`/app/results/${r.sourceAttemptId}`} className="truncate hover:underline">
                        {r.sourceTitle}
                      </Link>
                    ) : (
                      <span className="truncate">{r.sourceTitle}</span>
                    )}
                    {r.score !== null && (
                      <span>
                        <b style={{ color: "var(--accent)" }}>{r.score}점</b> · {r.wrong}개 틀림
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 상태 */}
              <div className="flex items-center gap-2">
                {r.status === "completed" ? (
                  <span className="badge-green" data-testid="retake-status">
                    통과 {r.retakeScore !== null ? `· ${r.retakeScore}점` : ""}
                  </span>
                ) : r.status === "cancelled" ? (
                  <span className="badge-gray" data-testid="retake-status">
                    취소
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
                    {r.retakeState === "in_progress" ? "응시 중" : "응시 대기"} · {r.dueAt ? `마감 ${fmtMDHM(r.dueAt)}` : "마감 없음"}
                    {overdue ? " · 지남" : ""}
                  </span>
                )}
              </div>

              {/* 동작 */}
              {isOpen && (
                <div className="flex w-full flex-wrap items-center gap-3 pl-[25px] sm:w-auto sm:pl-0">
                  {!r.retakeExamId ? (
                    <IssueBox taskId={r.id} wrong={r.wrong} same={r.same} />
                  ) : (
                    <>
                      <DueBox taskId={r.id} dueAt={r.dueAt} />
                      <Link href={`/app/tests/${r.retakeExamId}?step=3`} className="btn-ghost btn-sm">
                        시험지
                      </Link>
                      {r.retakeAttemptId && (
                        <Link href={`/app/results/${r.retakeAttemptId}`} className="btn-ghost btn-sm">
                          결과
                        </Link>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("재시험을 취소할까요? 원 시험 결과는 그대로 남습니다.")) return;
                      start(async () => {
                        const r2 = await cancelRetakeAction(r.id);
                        toast(r2.message ?? "", r2.ok);
                        router.refresh();
                      });
                    }}
                  >
                    취소
                  </button>
                </div>
              )}
              {!isOpen && r.retakeAttemptId && (
                <Link href={`/app/results/${r.retakeAttemptId}`} className="btn-ghost btn-sm">
                  결과
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
