import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getStudentContext } from "@/lib/auth";
import { listStudentAssignments } from "@/lib/attempts";
import { studentRetakes, studentGrades } from "@/lib/learn";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMD, seoulWeekRange, fmtMDHM } from "@/lib/util";
import { recentWeeks, weeklySeries, weekLabel, avg } from "@/lib/stats";
import { StartButton } from "./StartButton";
import { Sparkline } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { RefreshIfStale } from "@/components/AutoRefresh";

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
      <RefreshIfStale renderedAt={Date.now()} />
      <div className="col">
      {linked === 0 && (
        <div className="card card-body text-[14px]" data-testid="learn-unlinked">
          {pending > 0 ? (
            <div data-testid="learn-pending">
              <div className="font-semibold">선생님 확인을 기다리는 중이에요</div>
              <p className="muted mt-1">선생님이 확인하면 시험이 여기에 보여요. 확인되면 알림으로 알려드릴게요.</p>
              <Link href="/learn" className="btn-secondary mt-3 w-full py-3">
                새로고침
              </Link>
            </div>
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

      <div className="flex items-end justify-between gap-3 px-1 pt-1">
        <div className="min-w-0">
          <div className="text-[20px] font-bold tracking-tight break-keep">
            안녕하세요, <span className="whitespace-nowrap">{user.name}님</span>
          </div>
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            이번 주 {fmtMD(week.start)} – {fmtMD(new Date(week.end.getTime() - 1))}
          </div>
        </div>
        <span className="shrink-0 text-right text-[13px]" style={{ color: "var(--ink-3)" }} data-testid="todo-line">
          <span className="whitespace-nowrap">
            할 일 <b style={{ color: "var(--ink)" }}>{todo.length}</b> · 완료 <b style={{ color: "var(--ink)" }}>{doneThisWeek}</b>
          </span>
        </span>
      </div>

      {primary ? (
        <div className="card-accent card-body" data-testid="next-card">
          <div className="flex items-center justify-between gap-3">
            <span className="lbl-on">{primary.exam.isRetake ? "재시험" : primary.attemptStatus === "in_progress" ? "풀던 시험" : "다음 시험"}</span>
            <span className="rounded-md px-2 py-0.5 text-[12.5px] font-bold tabular-nums" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
              {primary.dueAt ? (dday(primary.dueAt)! <= 0 ? "D-DAY" : `D-${dday(primary.dueAt)}`) : "마감 없음"}
            </span>
          </div>
          <div className="mt-2 text-[21px] font-bold leading-snug tracking-tight break-keep">{primary.exam.title}</div>
          <div className="mt-1.5 text-[13px]" style={{ color: "rgba(255,244,240,0.88)" }}>
            {primary.exam.questionCount}문항 · 통과 {primary.exam.passScore}점
            {primary.mode === "paper" ? " · 종이 시험" : ` · 단어당 ${primary.exam.secondsPerItem ?? 7}초`}
            {primary.dueAt ? ` · ${fmtMDHM(primary.dueAt)}까지` : ""}
          </div>
          <div className="mt-5">
            {primary.mode === "paper" ? (
              <Link href="/learn/paper" className="btn w-full text-[15px]" style={{ background: "#fff", color: "var(--accent)", minHeight: 48 }}>
                종이 시험 · 사진 찍어 제출
              </Link>
            ) : primary.canStart ? (
              <StartButton assignmentId={primary.assignmentId} label={primary.attemptStatus === "in_progress" ? `이어서 풀기 · ${primary.answeredCount}/${primary.exam.questionCount} 답함` : "응시 시작"} variant="on-accent" />
            ) : primary.startAt && primary.startAt.getTime() > Date.now() ? (
              // 예약 시험: 눌러볼 게 없어 멈춘 듯 보이지 않게, 시작 시각이 적힌 비활성 버튼
              <button type="button" className="btn w-full py-3 text-[13px]" disabled style={{ background: "rgba(255,244,240,0.18)", color: "#fff4f0", cursor: "default" }} data-testid="scheduled-start">
                {fmtMDHM(primary.startAt)} 시작 · 시작되면 알려드려요
              </button>
            ) : (
              <span className="lbl-on">아직 응시할 수 없습니다</span>
            )}
          </div>
        </div>
      ) : (
        <div className="card card-body py-8 text-center">
          <div className="text-[16px] font-semibold">지금 할 시험이 없어요</div>
          <div className="muted mt-1">선생님이 시험을 내면 여기에 바로 떠요. 알림으로도 알려드려요.</div>
        </div>
      )}

      {rest.length > 0 && <div className="sec-t mt-2 px-1">다음 할 일 <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>{rest.length}</span></div>}
      {rest.map((a) => (
        <div key={a.assignmentId} className="card flex w-full items-center justify-between gap-3 px-4 py-3" data-testid="queue-item">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium">{a.exam.title}</div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>{a.dueAt ? `${fmtMD(a.dueAt)}까지` : "마감 없음"}</div>
          </div>
          {a.mode === "paper" ? (
            <Link href="/learn/paper" className="btn-secondary btn-sm">
              사진 제출
            </Link>
          ) : a.canStart ? <StartButton assignmentId={a.assignmentId} label={a.attemptStatus === "in_progress" ? "이어서" : "시작"} compact /> : <span className="badge-gray">{a.startAt && a.startAt.getTime() > Date.now() ? `${fmtMD(a.startAt)} 시작` : "대기"}</span>}
        </div>
      ))}
      </div>

      <div className="col">
      {/* 재시험: 한 줄 행. 출제됐으면 강조 점 + 마감, 아니면 흐린 상태 */}
      <Link href="/learn/retake" className="card flex w-full items-center gap-3 px-4 py-3.5" data-testid="retake-pill">
        <span className={`dot ${retakeIssued ? "red" : nextRetake ? "amber" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            재시험
            {retakeIssued ? (
              <span className="badge-red">{nextRetake!.dueAt ? `${fmtMD(nextRetake!.dueAt)}까지` : "열림"}</span>
            ) : (
              <span className={nextRetake ? "badge-amber" : "badge-gray"}>{nextRetake ? "준비 중" : "없음"}</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {retakeIssued
              ? `${nextRetake!.retakeExam?.questionCount ?? nextRetake!.wrongCount}문항 · ${nextRetake!.retakeExam?.title ?? nextRetake!.sourceExam.title}`
              : nextRetake
                ? `선생님이 준비 중 · ${nextRetake.sourceExam.title}`
                : "치를 재시험이 없어요"}
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--ink-4)" }}>
          ›
        </span>
      </Link>

      {/* 내 성적: 평균 · 통과율 · 추이를 한 카드에 (링·카드 3장 대신) */}
      <Link href="/learn/grades" className="card card-body block" data-testid="my-stats">
        <div className="sec-h">
          <h2 className="sec-t">내 성적</h2>
          <span className="sec-link">성적 →</span>
        </div>
        <div className="mt-3 grid grid-cols-3">
          <div>
            <div className="lbl">평균</div>
            <div className="kpi-v mt-1">{scored.length ? <CountUp value={avg(scored.map((g) => g.score))} /> : "—"}</div>
          </div>
          <div className="border-l border-[var(--line)] pl-4">
            <div className="lbl">통과율</div>
            <div className="kpi-v mt-1">{passRate === null ? "—" : <CountUp value={passRate} suffix="%" />}</div>
          </div>
          <div className="border-l border-[var(--line)] pl-4">
            <div className="lbl">응시</div>
            <div className="kpi-v mt-1">
              {scored.length}
              <small>회</small>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Sparkline values={series} baseline={90} labels={weeks.map(weekLabel)} height={56} />
        </div>
        <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
          최근 6주 · 점선은 통과 기준 90
        </div>
      </Link>
      </div>
    </div>
  );
}
