import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { studentRetakes } from "@/lib/learn";
import { fmtMD, fmtMDHM } from "@/lib/util";
import { StartButton } from "../StartButton";
import { SpeakButton } from "@/components/Speak";

/** 재시험·보강: 달력 + 예정된 보강 상세(날짜·시간·틀린 단어) + 이력 */
export default async function RetakePage() {
  const user = await requireUser();
  const retakes = await studentRetakes(user.id);
  const open = retakes.filter((r) => r.status === "pending" || r.status === "scheduled");
  const next = open.find((r) => r.scheduledAt) ?? open[0] ?? null;
  const done = retakes.filter((r) => r.status === "completed");

  // 이번 달 달력 (KST)
  const now = new Date(Date.now() + 9 * 3600e3);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  const marks = new Map<number, number>();
  for (const r of open) {
    if (!r.scheduledAt) continue;
    const d = new Date(r.scheduledAt.getTime() + 9 * 3600e3);
    if (d.getUTCFullYear() === y && d.getUTCMonth() === m) marks.set(d.getUTCDate(), (marks.get(d.getUTCDate()) ?? 0) + 1);
  }
  const cells: (number | null)[] = [...Array.from({ length: firstDow }, () => null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  const calendar = (
      <div className="card card-body">
        <div className="flex items-center justify-between">
          <div className="lbl">
            {y}.{String(m + 1).padStart(2, "0")}
          </div>
          <span className="lbl">● 보강일 · ○ 오늘</span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <span key={d} className="lbl" style={{ fontSize: 9 }}>
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            const n = d ? marks.get(d) ?? 0 : 0;
            const isToday = d === today;
            return (
              <span key={i} className="flex h-9 items-center justify-center rounded-full text-[13px]" style={n ? { background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600 } : isToday ? { boxShadow: "inset 0 0 0 1.5px var(--ink)" } : { color: d ? "var(--ink-2)" : "transparent" }} title={n ? `보강 ${n}건` : undefined}>
                {d ?? ""}
              </span>
            );
          })}
        </div>
      </div>
  );

  return (
    <div className="learn-grid">
      <div className="col">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="lbl">Retake</div>
          <div className="mt-1 text-[15px] font-semibold">재시험 · 보강 일정</div>
        </div>
        <span className="digital">{String(open.length).padStart(2, "0")} OPEN</span>
      </div>

      {next ? (
        <div className="card-accent card-body">
          <div className="flex items-start justify-between">
            <div className="lbl-on">{next.scheduledAt ? "Scheduled" : "Pending"}</div>
            <span className="badge-gray" style={{ background: "rgba(255,244,240,0.2)", color: "#fff4f0" }}>
              {next.wrongCount} WRONG
            </span>
          </div>
          <div className="num-xl mt-2" style={{ fontSize: 56 }}>
            {next.scheduledAt ? fmtMD(next.scheduledAt) : "--"}
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.9)" }}>
            {next.scheduledAt ? `${fmtMDHM(next.scheduledAt)} · ` : "선생님이 날짜를 정하면 여기에 표시됩니다 · "}
            {next.sourceExam.title} · {next.sourceScore ?? "--"}점 (통과 {next.sourceExam.passScore})
            {next.note ? ` · ${next.note}` : ""}
          </div>
          <div className="mt-4">
            {next.retakeAssignment ? (
              next.retakeAssignment.status === "completed" ? (
                <span className="lbl-on">재시험 응시 완료 · 결과는 내 성적에서</span>
              ) : next.retakeAssignment.canStart ? (
                <StartButton assignmentId={next.retakeAssignment.assignmentId} label={next.retakeAssignment.attemptStatus === "in_progress" ? "재시험 이어서" : "재시험 응시"} variant="on-accent" />
              ) : (
                <span className="lbl-on">{next.retakeAssignment.mode === "paper" ? "종이 재시험 · 보강 때 응시" : "아직 응시할 수 없습니다"}</span>
              )
            ) : (
              <span className="lbl-on">선생님이 재시험을 준비 중입니다</span>
            )}
          </div>
        </div>
      ) : (
        <div className="card card-body">
          <div className="lbl">Retake</div>
          <div className="num-lg mt-3" style={{ color: "var(--ink-3)" }}>
            —
          </div>
          <div className="muted mt-2">예정된 재시험이 없습니다. 통과 기준에 못 미치면 여기에 나타납니다.</div>
        </div>
      )}

      {next && (
        <section className="card card-body">
          <div className="mb-1 flex items-center justify-between">
            <div className="lbl">Review · 틀린 단어</div>
            <span className="digital">{next.wrongCount}</span>
          </div>
          {next.wrongWords.length === 0 ? (
            <p className="muted">선생님이 정답을 공개하면 틀린 단어가 여기에 보입니다.</p>
          ) : (
            <>
              <Link href={`/learn/practice/${next.sourceAttemptId}`} className="btn-primary mb-2 w-full py-3">
                재시험 전에 연습 · random
              </Link>
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
      {calendar}

      {open.length > 1 && (
        <section className="card card-body">
          <div className="lbl mb-1">Upcoming</div>
          <ul>
            {open
              .filter((r) => r !== next)
              .map((r) => (
                <li key={r.id} className="row">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{r.sourceExam.title}</div>
                    <div className="lbl mt-0.5">{r.wrongCount} wrong</div>
                  </div>
                  <span className={r.scheduledAt ? "badge-blue" : "badge-amber"}>{r.scheduledAt ? fmtMD(r.scheduledAt) : "TBD"}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="card card-body">
          <div className="lbl mb-1">Done</div>
          <ul>
            {done.map((r) => (
              <li key={r.id} className="row">
                <span className="truncate text-[14px]">{r.sourceExam.title}</span>
                <span className="badge-green">PASSED</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}
