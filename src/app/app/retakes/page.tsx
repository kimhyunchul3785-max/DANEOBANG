import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtMDHM, parseJSON, seoulWeekRange } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { CountUp, SortHeader } from "@/components/Motion";
import { RetakeCreate, ScheduleBox } from "./RetakeCreate";
import { cancelRetakeAction } from "./actions";

/**
 * 재시험 큐: 오답 → 재출제(오답만/같은 범위, 즉시 발행·배정) → 보강 일정(날짜·시간) → 학생 앱 표시 → 통과 시 완료
 */
export default async function RetakesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const week = seoulWeekRange();
  const tasks = await prisma.retakeTask.findMany({
    where: { student: studentScope(ctx), ...(sp.all ? {} : { status: { in: ["pending", "scheduled"] } }) },
    include: { student: { include: { classRoom: true } }, sourceAttempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: true } } } } },
    orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const retakeExams = await prisma.exam.findMany({ where: { id: { in: tasks.map((t) => t.retakeExamId).filter((x): x is string => !!x) } }, select: { id: true, status: true, title: true, assignments: { select: { status: true } } } });
  const open = tasks.filter((t) => t.status === "pending" || t.status === "scheduled");
  const waiting = open.filter((t) => !t.retakeExamId).length;
  const scheduledThisWeek = open.filter((t) => t.scheduledAt && t.scheduledAt >= week.start && t.scheduledAt < week.end).length;
  const unscheduled = open.filter((t) => !t.scheduledAt).length;
  // 앞으로 14일 보강 캘린더
  const dayStart = new Date(Date.now() - ((Date.now() + 9 * 3600e3) % 86400e3));
  const cal = Array.from({ length: 14 }, (_, i) => {
    const s = new Date(dayStart.getTime() + i * 86400e3);
    const e = new Date(s.getTime() + 86400e3);
    const l = new Date(s.getTime() + 9 * 3600e3);
    return { key: i, label: `${l.getUTCMonth() + 1}/${l.getUTCDate()}`, dow: "일월화수목금토"[l.getUTCDay()], n: open.filter((t) => t.scheduledAt && t.scheduledAt >= s && t.scheduledAt < e).length };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Retake · 재시험</div>
          <h1 className="h1 mt-1">재시험 · 보강</h1>
          <p className="muted mt-1">통과 기준 미달이면 자동으로 여기에 들어옵니다. 오답만 다시 내고, 보강 날짜를 잡으면 학생 앱에 바로 보입니다.</p>
        </div>
        <Link href={sp.all ? "/app/retakes" : "/app/retakes?all=1"} className="btn-ghost btn-sm">
          {sp.all ? "미완료만" : "완료 포함 전체"}
        </Link>
      </header>

      <div className="bento mb-4">
        <div className="card-sm card-body span-2">
          <div className="lbl">Queue</div>
          <div className="num-lg mt-2">
            <CountUp value={open.length} />
          </div>
          <div className="muted">미완료 재시험</div>
        </div>
        <div className="card-sm card-body span-2">
          <div className="lbl">Not issued</div>
          <div className="num-lg mt-2" style={waiting ? { color: "var(--accent)" } : undefined}>
            <CountUp value={waiting} />
          </div>
          <div className="muted">아직 재출제 안 됨</div>
        </div>
        <div className="card-sm card-body span-2">
          <div className="lbl">This week</div>
          <div className="num-lg mt-2">
            <CountUp value={scheduledThisWeek} />
          </div>
          <div className="muted">이번 주 보강 · 미정 {unscheduled}</div>
        </div>
        <div className="card-dark span-6 flex items-center gap-4 overflow-x-auto rounded-full px-6 py-3">
          <span className="lbl shrink-0" style={{ color: "rgba(236,233,227,0.55)" }}>
            14 days
          </span>
          {cal.map((d) => (
            <div key={d.key} className="flex shrink-0 flex-col items-center" title={`${d.label} 보강 ${d.n}건`}>
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
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="lbl">Queue · 학생별</div>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="score">점수순</SortHeader>
              </span>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="wrong" defaultDir="desc">오답순</SortHeader>
              </span>
              <span className="lbl">
                <SortHeader target="#retake-queue" attr="when">일정순</SortHeader>
              </span>
            </div>
            <span className="digital">{tasks.length}</span>
          </div>
          {tasks.length === 0 && <p className="muted">재시험 대상이 없습니다.</p>}
          <ul id="retake-queue">
            {tasks.map((t) => {
              const g = t.sourceAttempt.grades[0];
              const rex = retakeExams.find((e) => e.id === t.retakeExamId);
              const isOpen = t.status === "pending" || t.status === "scheduled";
              const wrong = g ? parseJSON<{ correct: boolean }[]>(g.itemResults, []).filter((r) => !r.correct).length : 0;
              const done = rex?.assignments.some((a) => a.status === "completed");
              return (
                <li key={t.id} className="row flex-wrap gap-y-2" data-testid="retake-row" data-task={t.id} data-score={g ? Math.round(g.score) : ""} data-wrong={wrong} data-when={t.scheduledAt ? t.scheduledAt.getTime() : ""}>
                  <div className="min-w-[200px] flex-1">
                    <Link href={`/app/students/${t.studentId}`} className="card-title hover:underline">
                      {t.student.name}
                    </Link>
                    <span className="muted ml-2">{t.student.classRoom?.name}</span>
                    <div className="muted mt-0.5 truncate">
                      <Link href={`/app/results/${t.sourceAttemptId}`} className="hover:underline">
                        {t.sourceAttempt.assignment.exam.title}
                      </Link>
                      {rex && <span> → {rex.status === "published" ? (done ? "재시험 응시 완료" : "재시험 배정됨") : "초안"}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num-md" style={{ color: g && !g.passed ? "var(--accent)" : undefined }}>
                      {g ? Math.round(g.score) : "–"}
                    </span>
                    <span className="badge-red">{wrong} WRONG</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === "completed" ? (
                      <span className="badge-green">DONE</span>
                    ) : t.status === "cancelled" ? (
                      <span className="badge-gray">CANCELLED</span>
                    ) : t.scheduledAt ? (
                      <span className="badge-blue" title={t.note ?? ""}>
                        {fmtMDHM(t.scheduledAt)}
                      </span>
                    ) : (
                      <span className="badge-amber">일정 미정</span>
                    )}
                  </div>
                  {isOpen && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!t.retakeExamId && <RetakeCreate taskId={t.id} />}
                      <ScheduleBox taskId={t.id} scheduledAt={t.scheduledAt?.toISOString() ?? null} note={t.note} />
                      <ActionButton action={cancelRetakeAction.bind(null, t.id)} className="btn-ghost btn-sm" confirm="재시험 할 일을 취소할까요? 원 시험의 실패 기록은 유지됩니다.">
                        취소
                      </ActionButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
