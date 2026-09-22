import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listStudentAssignments } from "@/lib/attempts";
import { studentRetakes, studentGrades } from "@/lib/learn";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMD, seoulWeekRange } from "@/lib/util";
import { recentWeeks, weeklySeries, weekLabel, avg } from "@/lib/stats";
import { StartButton } from "./StartButton";
import { Ring, Sparkline } from "@/components/Viz";
import { CountUp } from "@/components/Motion";

/** 학생 홈: 이번 주 시험 · 보강 일정 · 내 추이 요약 */
export default async function LearnHome() {
  const user = await requireUser();
  const [list, retakes, grades, linked, pending] = await Promise.all([
    listStudentAssignments(user.id),
    studentRetakes(user.id),
    studentGrades(user.id),
    prisma.student.count({ where: { userId: user.id } }),
    prisma.studentLinkRequest.count({ where: { userId: user.id, status: "pending" } }),
  ]);
  const week = seoulWeekRange();
  const open = list.filter((a) => a.status !== "completed" && a.status !== "expired");
  const inWeek = (a: (typeof list)[number]) => (a.dueAt ? new Date(a.dueAt) >= week.start && new Date(a.dueAt) < week.end : true);
  const todo = [...open.filter(inWeek), ...open.filter((a) => !inWeek(a))];
  const [primary, ...rest] = todo;
  const doneThisWeek = list.filter((a) => a.status === "completed" && a.dueAt && new Date(a.dueAt) >= week.start && new Date(a.dueAt) < week.end).length;
  const dday = (d: Date | null) => (d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400e3)) : null);
  const nextRetake = retakes.find((r) => (r.status === "pending" || r.status === "scheduled") && r.scheduledAt) ?? retakes.find((r) => r.status === "pending" || r.status === "scheduled");
  const weeks = recentWeeks(6);
  const first = grades.filter((g) => !g.isRetake);
  const series = weeklySeries(first, weeks);
  const scored = first.slice(-10);
  const passRate = scored.length ? Math.round((scored.filter((g) => g.passed).length / scored.length) * 100) : null;

  return (
    <div className="learn-grid">
      <div className="col">
      {linked === 0 && (
        <div className="card card-body text-[14px]">{pending > 0 ? "선생님 승인을 기다리고 있습니다. 승인되면 시험이 여기에 표시됩니다." : "연결된 학생 명단이 없습니다. 선생님에게 받은 초대 링크를 열어 주세요."}</div>
      )}

      <div className="flex items-end justify-between px-1">
        <div>
          <div className="lbl">This week</div>
          <div className="mt-1 text-[15px] font-semibold">
            {fmtMD(week.start)} – {fmtMD(new Date(week.end.getTime() - 1))}
          </div>
        </div>
        <span className="digital">
          {String(todo.length).padStart(2, "0")} TODO · {String(doneThisWeek).padStart(2, "0")} DONE
        </span>
      </div>

      {primary ? (
        <div className="card-accent card-body flex min-h-[210px] flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="lbl-on">{primary.exam.isRetake ? "Retake" : "Next"}</div>
              <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight">{primary.exam.title}</div>
              <div className="lbl-on mt-2">
                {primary.exam.questionCount} Q · Pass {primary.exam.passScore}
                {primary.mode === "paper" ? " · paper · no time limit" : ` · ${primary.exam.secondsPerItem ?? 7}s / word`}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="digital-lg">{primary.dueAt ? `D-${dday(primary.dueAt)}` : "OPEN"}</div>
              <div className="lbl-on mt-1">{primary.dueAt ? fmtDate(primary.dueAt).slice(5) : "no due"}</div>
            </div>
          </div>
          <div className="mt-5">
            {primary.mode === "paper" ? (
              <Link href="/learn/paper" className="btn w-full py-3 text-[13px]" style={{ background: "var(--accent-ink)", color: "var(--accent)" }}>
                종이 시험 · 사진 찍어 제출
              </Link>
            ) : primary.canStart ? (
              <StartButton assignmentId={primary.assignmentId} label={primary.attemptStatus === "in_progress" ? "이어서 응시" : "응시 시작"} variant="on-accent" />
            ) : (
              <span className="lbl-on">아직 응시할 수 없습니다</span>
            )}
          </div>
        </div>
      ) : (
        <div className="card card-body min-h-[150px]">
          <div className="lbl">Next</div>
          <div className="num-lg mt-4" style={{ color: "var(--ink-3)" }}>
            —
          </div>
          <div className="muted mt-2">이번 주에 응시할 시험이 없습니다.</div>
        </div>
      )}

      {rest.length > 0 && <div className="lbl px-1 lg:mt-2">Queue · 다음 시험 {rest.length}</div>}
      {rest.map((a) => (
        <div key={a.assignmentId} className="pill w-full justify-between">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium">{a.exam.title}</div>
            <div className="lbl mt-0.5">{a.dueAt ? `due ${fmtDate(a.dueAt, false).slice(5)}` : "no due"}</div>
          </div>
          {a.mode === "paper" ? (
            <Link href="/learn/paper" className="btn-secondary btn-sm">
              사진 제출
            </Link>
          ) : a.canStart ? <StartButton assignmentId={a.assignmentId} label="시작" compact /> : <span className="badge-gray">WAIT</span>}
        </div>
      ))}
      </div>

      <div className="col">
      {/* 보강 일정 필 */}
      <Link href="/learn/retake" className="card-dark flex w-full items-center justify-between gap-3 rounded-full px-5 py-3">
        <span className="flex items-center gap-3">
          <span className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
            Retake
          </span>
          <span className="digital-lg">{nextRetake?.scheduledAt ? fmtMD(nextRetake.scheduledAt) : nextRetake ? "TBD" : "--"}</span>
        </span>
        <span className="truncate text-[12px]" style={{ color: "rgba(236,233,227,0.75)" }}>
          {nextRetake ? `${nextRetake.wrongCount}문항 · ${nextRetake.sourceExam.title}` : "예정된 보강 없음"}
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/learn/grades" className="card-sm card-body flex flex-col justify-between">
          <div className="lbl">Average</div>
          <div className="num-lg mt-3">
            <CountUp value={avg(scored.map((g) => g.score))} />
          </div>
          <div className="muted mt-1">최근 {scored.length}회</div>
        </Link>
        <Link href="/learn/grades" className="card-sm card-body flex flex-col items-start justify-between">
          <div className="lbl">Pass rate</div>
          <Ring value={passRate ?? 0} size={64} stroke={5}>
            <span className="digital" style={{ fontSize: 13 }}>
              <CountUp value={passRate} />
            </span>
          </Ring>
        </Link>
      </div>

      <Link href="/learn/grades" className="card card-body block">
        <div className="flex items-center justify-between">
          <div className="lbl">My trend · 6주</div>
          <span className="lbl-ink">More →</span>
        </div>
        <div className="mt-2">
          <Sparkline values={series} baseline={90} labels={weeks.map(weekLabel)} height={64} />
        </div>
      </Link>
      </div>
    </div>
  );
}
