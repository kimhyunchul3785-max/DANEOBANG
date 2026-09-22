import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { studentRetakes } from "@/lib/learn";
import { fmtMDHM } from "@/lib/util";
import { StartButton } from "../StartButton";
import { SpeakButton } from "@/components/Speak";

/** 재시험: 출제된 재시험(마감 순) → 시작 · 틀린 단어 연습 · 지난 재시험 결과 */
export default async function RetakePage() {
  const user = await requireUser();
  const retakes = await studentRetakes(user.id);
  const open = retakes.filter((r) => r.status === "pending" || r.status === "issued");
  const issued = open.filter((r) => r.retakeAssignment && r.retakeAssignment.status !== "completed");
  const preparing = open.filter((r) => !r.retakeAssignment);
  const next = issued[0] ?? null;
  const done = retakes.filter((r) => r.status === "completed" || (r.retakeAssignment && r.retakeAssignment.status === "completed"));
  const dday = (d: Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400e3) : null);

  return (
    <div className="learn-grid">
      <div className="col">
        <div className="flex items-end justify-between px-1">
          <div>
            <div className="lbl">Retake</div>
            <div className="mt-1 text-[15px] font-semibold">재시험</div>
          </div>
          <span className="digital">{String(issued.length).padStart(2, "0")} TO DO</span>
        </div>

        {next ? (
          <div className="card-accent card-body" data-testid="retake-next">
            <div className="flex items-start justify-between">
              <div className="lbl-on">Next · {next.mode === "same" ? "같은 범위" : next.kind === "weak_words" ? "반복 오답" : "오답만"}</div>
              <span className="badge-gray" style={{ background: "rgba(255,244,240,0.2)", color: "#fff4f0" }}>
                {next.retakeExam?.questionCount ?? next.wrongCount} Q
              </span>
            </div>
            <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight">{next.retakeExam?.title ?? next.sourceExam.title}</div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-[13px]" style={{ color: "rgba(255,244,240,0.9)" }}>
                {next.sourceScore !== null ? `지난 점수 ${next.sourceScore} · ` : ""}통과 {next.sourceExam.passScore}점
                <br />
                {next.dueAt ? `${fmtMDHM(next.dueAt)}까지` : "마감 없음"}
              </div>
              <div className="text-right">
                <div className="digital-lg">{next.dueAt ? (dday(next.dueAt)! <= 0 ? "D-DAY" : `D-${dday(next.dueAt)}`) : "OPEN"}</div>
              </div>
            </div>
            <div className="mt-4">
              {next.retakeAssignment!.canStart ? (
                <StartButton assignmentId={next.retakeAssignment!.assignmentId} label={next.retakeAssignment!.attemptStatus === "in_progress" ? "재시험 이어서" : "재시험 시작"} variant="on-accent" />
              ) : (
                <span className="lbl-on">{next.retakeAssignment!.mode === "paper" ? "종이 재시험 · 시험지를 받아 사진으로 제출" : next.retakeAssignment!.status === "expired" ? "마감이 지났어요 · 선생님에게 말하면 다시 열려요" : "아직 응시할 수 없습니다"}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="card card-body">
            <div className="lbl">Retake</div>
            <div className="num-lg mt-3" style={{ color: "var(--ink-3)" }}>
              —
            </div>
            <div className="muted mt-2">{preparing.length ? "선생님이 재시험을 준비하고 있어요. 나오면 알림이 와요." : "치를 재시험이 없어요. 통과 기준에 못 미치면 여기에 나타나요."}</div>
          </div>
        )}

        {next && (
          <section className="card card-body">
            <div className="mb-1 flex items-center justify-between">
              <div className="lbl">Review · 틀린 단어</div>
              <span className="digital">{next.wrongWords.length || next.wrongCount}</span>
            </div>
            {next.wrongWords.length === 0 ? (
              <p className="muted">선생님이 정답을 공개하면 틀린 단어가 여기에 보여요.</p>
            ) : (
              <>
                {next.sourceAttemptId && (
                  <Link href={`/learn/practice/${next.sourceAttemptId}`} className="btn-primary mb-2 w-full py-3">
                    재시험 전에 연습 · random
                  </Link>
                )}
                <ul>
                  {next.wrongWords.map((w, i) => (
                    <li key={i} className="row">
                      <span className="flex min-w-0 items-center gap-2">
                        <SpeakButton text={w.english} size={28} />
                        <span className="text-[15px] font-medium">{w.english}</span>
                      </span>
                      <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                        {w.meaning}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>

      <div className="col">
        {issued.length > 1 && (
          <section className="card card-body">
            <div className="lbl mb-1">Up next · 마감 순</div>
            <ul>
              {issued
                .filter((r) => r !== next)
                .map((r) => (
                  <li key={r.id} className="row">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">{r.retakeExam?.title ?? r.sourceExam.title}</div>
                      <div className="lbl mt-0.5">
                        {r.retakeExam?.questionCount ?? r.wrongCount} Q · {r.dueAt ? `${fmtMDHM(r.dueAt)}까지` : "마감 없음"}
                      </div>
                    </div>
                    {r.retakeAssignment?.canStart ? <StartButton assignmentId={r.retakeAssignment.assignmentId} label="시작" compact /> : <span className="badge-gray">WAIT</span>}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {preparing.length > 0 && (
          <section className="card card-body">
            <div className="lbl mb-1">Preparing · 선생님이 준비 중</div>
            <ul>
              {preparing.map((r) => (
                <li key={r.id} className="row">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{r.sourceExam.title}</div>
                    <div className="lbl mt-0.5">
                      {r.sourceScore !== null ? `${r.sourceScore}점 · ` : ""}
                      {r.wrongCount} wrong
                    </div>
                  </div>
                  <span className="badge-amber">준비 중</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section className="card card-body">
            <div className="lbl mb-1">Done · 지난 재시험</div>
            <ul>
              {done.slice(0, 10).map((r) => (
                <li key={r.id} className="row">
                  <span className="min-w-0 truncate text-[14px]">{r.retakeExam?.title ?? r.sourceExam.title}</span>
                  {r.retakeScore ? <span className={r.retakeScore.passed ? "badge-green" : "badge-red"}>{r.retakeScore.passed ? "PASSED" : "RETRY"} · {r.retakeScore.score}</span> : <span className="badge-green">PASSED</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
