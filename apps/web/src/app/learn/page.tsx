import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getStudentContext } from "@/lib/auth";
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
  const user = await requireUser("/learn");
  // 선택한 학생 자리(학원) 기준으로만 조회. 자리가 여럿인데 안 골랐으면 계정 전환, 하나도 없으면 연결 안내
  const ctx = await getStudentContext(user);
  const linked = await prisma.student.count({ where: { userId: user.id, status: "active" } });
  if (!ctx && linked > 1) redirect("/switch");
  const sid = ctx?.student.id ?? "__none__";
  const [list, retakes, grades, pending] = await Promise.all([
    listStudentAssignments(user.id, sid),
    studentRetakes(user.id, sid),
    studentGrades(user.id, sid),
    prisma.studentLinkRequest.count({ where: { userId: user.id, status: "pending" } }),
  ]);
  const week = seoulWeekRange();
  // 안 친 시험은 출제된 순서(옛날 → 현재)대로. 맨 위(primary)가 가장 먼저 나온 시험, 그 아래가 다음 차례
  const open = list.filter((a) => a.status !== "completed" && a.status !== "expired");
  const todo = open;
  const [primary, ...rest] = todo;
  const doneThisWeek = list.filter((a) => a.status === "completed" && a.dueAt && new Date(a.dueAt) >= week.start && new Date(a.dueAt) < week.end).length;
  const dday = (d: Date | null) => (d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400e3)) : null);
  // 재시험: 출제된 것(응시 대기) 중 마감이 가장 가까운 것, 없으면 준비 중인 것
  const openRetakes = retakes.filter((r) => r.status === "pending" || r.status === "issued");
  const nextRetake = openRetakes.find((r) => r.retakeAssignment && r.retakeAssignment.status !== "completed") ?? openRetakes[0] ?? null;
  const retakeIssued = !!nextRetake?.retakeAssignment && nextRetake.retakeAssignment.status !== "completed";
  const weeks = recentWeeks(6);
  const first = grades.filter((g) => !g.isRetake);
  const series = weeklySeries(first, weeks);
  const scored = first.slice(-10);
  const passRate = scored.length ? Math.round((scored.filter((g) => g.passed).length / scored.length) * 100) : null;

  return (
    <div className="learn-grid">
      <div className="col">
      {linked === 0 && (
        <div className="card card-body text-[14px]" data-testid="learn-unlinked">
          {pending > 0 ? (
            "선생님이 확인하면 시험이 여기에 보여요. 조금만 기다려 주세요."
          ) : (
            <>
              아직 학원과 연결되지 않았어요.
              <Link href="/welcome/student?from=learn" className="btn-primary mt-3 w-full py-3">
                학원과 연결하기
              </Link>
            </>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[18px] font-semibold tracking-tight break-keep">
            안녕하세요, <span className="whitespace-nowrap">{user.name}님</span>
          </div>
          <div className="lbl mt-1">
            오늘 할 일 · {fmtMD(week.start)} – {fmtMD(new Date(week.end.getTime() - 1))}
          </div>
        </div>
        <span className="digital shrink-0 text-right">
          {String(todo.length).padStart(2, "0")} TODO
          <span className="block sm:inline"> {String(doneThisWeek).padStart(2, "0")} DONE</span>
        </span>
      </div>

      {primary ? (
        <div className="card-accent card-body flex min-h-[210px] flex-col justify-between" data-testid="next-card">
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
              {/* 휴대폰: 날짜만 (시각까지 쓰면 제목 폭을 좁혀 두 줄로 꺾인다) */}
              <div className="lbl-on mt-1 whitespace-nowrap">
                {primary.dueAt ? (
                  <>
                    <span className="sm:hidden">{fmtDate(primary.dueAt, false).slice(6)}</span>
                    <span className="hidden sm:inline">{fmtDate(primary.dueAt).slice(5)}</span>
                  </>
                ) : (
                  "no due"
                )}
              </div>
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
              <span className="lbl-on">{primary.startAt && primary.startAt.getTime() > Date.now() ? `${fmtDate(primary.startAt)} 부터 응시할 수 있어요` : "아직 응시할 수 없습니다"}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="card card-body min-h-[150px]">
          <div className="lbl">Next</div>
          <div className="num-lg mt-4" style={{ color: "var(--ink-3)" }}>
            —
          </div>
          <div className="muted mt-2">지금 할 시험이 없어요.</div>
        </div>
      )}

      {rest.length > 0 && <div className="lbl px-1 lg:mt-2">다음 할 일 {rest.length} · 오래된 순</div>}
      {rest.map((a) => (
        <div key={a.assignmentId} className="pill w-full justify-between" data-testid="queue-item">
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
      {/* 재시험 필: 출제된 재시험의 마감 · 없으면 준비 중/없음 */}
      <Link href="/learn/retake" className="card-dark flex w-full items-center justify-between gap-3 rounded-full px-5 py-3" data-testid="retake-pill">
        <span className="flex items-center gap-3">
          <span className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
            Retake
          </span>
          <span className="digital-lg">{retakeIssued ? (nextRetake!.dueAt ? fmtMD(nextRetake!.dueAt) : "OPEN") : nextRetake ? "SOON" : "--"}</span>
        </span>
        <span className="truncate text-[12px]" style={{ color: "rgba(236,233,227,0.75)" }}>
          {retakeIssued ? `${nextRetake!.retakeExam?.questionCount ?? nextRetake!.wrongCount}문항 · ${nextRetake!.dueAt ? "까지" : "마감 없음"} · ${nextRetake!.retakeExam?.title ?? nextRetake!.sourceExam.title}` : nextRetake ? `선생님이 준비 중 · ${nextRetake.sourceExam.title}` : "치를 재시험 없음"}
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
