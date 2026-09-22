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
export default async function RetakesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const week = seoulWeekRange();
  const now = new Date();
  const tasks = await prisma.retakeTask.findMany({
    where: { student: studentScope(ctx), ...(sp.all ? {} : { status: { in: ["pending", "issued"] } }) },
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
      retakeExamId: t.retakeExamId,
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
  const passedAll = sp.all ? tasks.filter((t) => t.status === "completed").length : null;

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
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Retake · 재시험</div>
          <h1 className="h1 mt-1">재시험</h1>
          <p className="muted mt-1">통과 기준에 못 미치면 자동으로 여기에 들어옵니다. 범위(오답만 / 같은 범위)와 마감을 정해 출제하면 학생 앱에 바로 보이고 알림이 갑니다.</p>
        </div>
        <Link href={sp.all ? "/app/retakes" : "/app/retakes?all=1"} className="btn-ghost btn-sm">
          {sp.all ? "미완료만" : "완료 포함 전체"}
        </Link>
      </header>

      <div className="bento mb-4">
        <div className="card-sm card-body span-2">
          <div className="lbl">출제 전</div>
          <div className="num-lg mt-2" style={notIssued ? { color: "var(--accent)" } : undefined}>
            <CountUp value={notIssued} />
          </div>
          <div className="muted">범위·마감을 정해 내면 됩니다</div>
        </div>
        <div className="card-sm card-body span-2">
          <div className="lbl">응시 대기</div>
          <div className="num-lg mt-2">
            <CountUp value={waiting} />
          </div>
          <div className="muted">출제됨 · 학생이 칠 차례{overdueN ? ` · 마감 지남 ${overdueN}` : ""}</div>
        </div>
        <div className="card-sm card-body span-2">
          <div className="lbl">이번 주</div>
          <div className="num-lg mt-2">
            <CountUp value={dueThisWeek} />
          </div>
          <div className="muted">
            이번 주 마감 · 통과 {passedThisWeek}
            {passedAll !== null ? ` · 누적 통과 ${passedAll}` : ""}
          </div>
        </div>
        <div className="card-dark span-6 flex items-center gap-4 overflow-x-auto rounded-full px-6 py-3" data-testid="due-strip">
          <span className="lbl shrink-0" style={{ color: "rgba(236,233,227,0.55)" }}>
            마감일별
          </span>
          {byDay.map((d) => (
            <div key={d.key} className="flex shrink-0 flex-col items-center" title={d.n ? `${d.label} 마감 ${d.n}명: ${d.names}` : `${d.label} 마감 없음`}>
              <span className="digital" style={{ color: d.n ? "#fff4f0" : "rgba(236,233,227,0.35)", fontSize: 14 }}>
                {d.n ? String(d.n).padStart(2, "0") : "··"}
              </span>
              <span className="lbl" style={{ fontSize: 9, color: d.key === 0 ? "var(--accent)" : "rgba(236,233,227,0.5)" }}>
                {d.label} {d.dow}
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="card">
        <div className="card-body">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-4">
              <div className="lbl">Queue · 학생별</div>
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
            <span className="digital">{rows.length}</span>
          </div>
          {rows.length === 0 ? <p className="muted">재시험 대상이 없습니다.</p> : <RetakeQueue rows={rows} />}
        </div>
      </section>
    </div>
  );
}
