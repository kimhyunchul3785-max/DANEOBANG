import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { parseJSON, seoulWeekRange } from "@/lib/util";
import { CountUp, SortHeader } from "@/components/Motion";
import { RETAKE_INCLUDE, retakeRound } from "@/lib/retake";
import { RetakeQueue, type RetakeRow } from "./RetakeQueue";

/**
 * 재시험: 통과 미달 → (출제 전) 범위·마감 정해 출제 → 학생 앱·알림 → 응시 → 통과면 완료, 미달이면 다음 차수로 이어짐.
 * 보강 일정 개념 없음. 마감(dueAt)이 곧 언제까지 치는지.
 */
type View = "open" | "pending" | "waiting" | "all";
const VIEWS: [View, string][] = [
  ["open", "미완료"],
  ["pending", "출제 전"],
  ["waiting", "응시 대기"],
  ["all", "완료 포함"],
];

export default async function RetakesPage({ searchParams }: { searchParams: Promise<{ all?: string; view?: string; student?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : sp.all ? "all" : "open";
  const week = seoulWeekRange();
  const now = new Date();
  const tasks = await prisma.retakeTask.findMany({
    where: { student: studentScope(ctx), ...(sp.student ? { studentId: sp.student } : {}), ...(view === "all" ? {} : { status: { in: ["pending", "issued"] } }) },
    include: RETAKE_INCLUDE,
    orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
  });
  const retakeExams = await prisma.exam.findMany({
    where: { id: { in: tasks.map((t) => t.retakeExamId).filter((x): x is string => !!x) } },
    select: { id: true, status: true, title: true, questionCount: true, assignments: { select: { studentId: true, status: true, dueAt: true, attempts: { orderBy: { attemptNo: "desc" }, take: 1, select: { id: true, status: true, grades: { where: { current: true }, select: { score: true, passed: true } } } } } } },
  });
  const rounds = new Map<string, number>();
  await Promise.all(tasks.map(async (t) => rounds.set(t.id, await retakeRound(t))));

  const rows: RetakeRow[] = tasks.map((t) => {
    const g = t.sourceAttempt?.grades[0];
    const wrong = g ? parseJSON<{ correct: boolean }[]>(g.itemResults, []).filter((r) => !r.correct).length : t.kind === "weak_words" ? parseJSON<string[]>(t.wordIds, []).length : 0;
    const rex = retakeExams.find((e) => e.id === t.retakeExamId);
    const asg = rex?.assignments.find((a) => a.studentId === t.studentId);
    const at = asg?.attempts[0];
    const rg = at?.grades[0];
    const retakeState: RetakeRow["retakeState"] = !rex ? null : rg ? "done" : at?.status === "in_progress" ? "in_progress" : "waiting";
    return {
      id: t.id,
      studentId: t.studentId,
      studentName: t.student.name,
      className: t.student.classRoom?.name ?? null,
      round: rounds.get(t.id) ?? 1,
      kind: t.kind,
      sourceTitle: t.sourceAttempt?.assignment.exam.title ?? `반복 오답 ${wrong}개`,
      sourceAttemptId: t.sourceAttemptId,
      score: g ? Math.round(g.score) : null,
      wrong,
      same: t.sourceAttempt?.assignment.exam.questionCount ?? wrong,
      status: t.status,
      dueAt: (asg?.dueAt ?? t.dueAt)?.toISOString() ?? null,
      issuedAt: t.issuedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      retakeExamId: t.retakeExamId,
      retakeTitle: rex?.title ?? null,
      retakeState,
      retakeScore: rg ? Math.round(rg.score) : null,
      retakePassed: rg?.passed ?? null,
      retakeAttemptId: at?.id ?? null,
    };
  });

  // 출제 전(할 일) → 응시 대기(마감 빠른 순) → 완료·취소
  const order = (r: RetakeRow) => (r.status === "pending" ? 0 : r.status === "issued" ? 1 : r.status === "completed" ? 2 : 3);
  rows.sort((a, b) => order(a) - order(b) || (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));
  const open = rows.filter((r) => r.status === "pending" || r.status === "issued");
  const notIssued = open.filter((r) => !r.retakeExamId).length;
  const waiting = open.filter((r) => r.retakeExamId && r.retakeState !== "done").length;
  const dueThisWeek = open.filter((r) => r.dueAt && new Date(r.dueAt) >= week.start && new Date(r.dueAt) < week.end).length;
  const passedThisWeek = tasks.filter((t) => t.status === "completed" && t.completedAt && t.completedAt >= week.start).length;
  const passedAll = view === "all" ? tasks.filter((t) => t.status === "completed").length : null;
  const listed = view === "pending" ? rows.filter((r) => (r.status === "pending" || r.status === "issued") && !r.retakeExamId) : view === "waiting" ? rows.filter((r) => (r.status === "pending" || r.status === "issued") && !!r.retakeExamId && r.retakeState !== "done") : rows;

  // 앞으로 14일, 마감일별 응시 대기 인원
  const dayStart = new Date(Date.now() - ((Date.now() + 9 * 3600e3) % 86400e3));
  const byDay = Array.from({ length: 14 }, (_, i) => {
    const s = new Date(dayStart.getTime() + i * 86400e3);
    const e = new Date(s.getTime() + 86400e3);
    const l = new Date(s.getTime() + 9 * 3600e3);
    const list = open.filter((r) => r.retakeExamId && r.retakeState !== "done" && r.dueAt && new Date(r.dueAt) >= s && new Date(r.dueAt) < e);
    return { key: i, label: `${l.getUTCMonth() + 1}/${l.getUTCDate()}`, dow: "일월화수목금토"[l.getUTCDay()], n: list.length, names: list.map((r) => r.studentName).join(", ") };
  });
  const overdueN = open.filter((r) => r.retakeExamId && r.retakeState !== "done" && r.dueAt && new Date(r.dueAt) < now).length;

  return (
    <div className="mx-auto max-w-6xl" data-width="wide">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">재시험</h1>
        </div>
        <div className="seg" role="tablist" aria-label="보기" data-testid="retake-views">
          {VIEWS.map(([k, l]) => (
            <Link key={k} href={k === "open" ? "/app/retakes" : `/app/retakes?view=${k}`} className={`seg-item${view === k ? " on" : ""}`} role="tab" aria-selected={view === k} data-view={k}>
              {l}
            </Link>
          ))}
        </div>
      </header>

      {/* 숫자 세 개: 한 표면 · 칸막이 (휴대폰에서도 한 줄) */}
      <div className="kpis k3 mb-4">
        <div>
          <span className="lbl">출제 전</span>
          <span className="kpi-v" style={notIssued ? { color: "var(--warn)" } : undefined}>
            <CountUp value={notIssued} />
          </span>
          <span className="kpi-s hidden sm:block">범위·마감을 정해 내면 됩니다</span>
        </div>
        <div>
          <span className="lbl">응시 대기</span>
          <span className="kpi-v">
            <CountUp value={waiting} />
          </span>
          <span className="kpi-s hidden sm:block">출제됨 · 학생이 칠 차례{overdueN ? ` · 마감 지남 ${overdueN}` : ""}</span>
        </div>
        <div>
          <span className="lbl">이번 주 마감</span>
          <span className="kpi-v">
            <CountUp value={dueThisWeek} />
          </span>
          <span className="kpi-s hidden sm:block">
            통과 {passedThisWeek}
            {passedAll !== null ? ` · 누적 통과 ${passedAll}` : ""}
          </span>
        </div>
      </div>
      {/* 마감일별: 재시험이 있는 날만 칩으로 (빈 날 점은 그리지 않는다) */}
      {byDay.some((d) => d.n > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="due-strip">
          <span className="lbl">마감일별 응시 대기</span>
          {byDay
            .filter((d) => d.n > 0)
            .map((d) => (
              <span key={d.key} className={d.key === 0 ? "badge-red" : "badge-blue"} title={`${d.label} 마감 ${d.n}명: ${d.names}`}>
                {d.key === 0 ? "오늘" : `${d.label}(${d.dow})`} · {d.n}명
              </span>
            ))}
        </div>
      )}
      {sp.student && (
        <div className="card-2 mb-3 flex items-center justify-between rounded-xl px-4 py-2 text-[13px]" data-testid="student-filter">
          <span>
            <b>{tasks[0]?.student.name ?? "이 학생"}</b>의 재시험만 보고 있어요.
          </span>
          <Link href="/app/retakes" className="lbl-ink hover:underline">
            전체 보기
          </Link>
        </div>
      )}

      <section className="card">
        <div className="card-body">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-4">
              <div className="lbl">학생별</div>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="score">점수순</SortHeader>
              </span>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="wrong" defaultDir="desc">오답순</SortHeader>
              </span>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="when">마감순</SortHeader>
              </span>
            </div>
            <span className="digital">{listed.length}</span>
          </div>
          {listed.length === 0 ? <p className="muted">{view === "open" ? "재시험 대상이 없습니다." : "해당하는 항목이 없어요."}</p> : <RetakeQueue rows={listed} />}
        </div>
      </section>
    </div>
  );
}
