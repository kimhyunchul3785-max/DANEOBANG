import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy, type AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, fmtMD, fmtMDHM, seoulWeekRange } from "@/lib/util";
import { StatusBadge } from "@/components/StatusBadge";
import { Ring, PulseBars, HBars, Donut, Sparkline } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { StudentRotator } from "./StudentRotator";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, trendDelta } from "@/lib/stats";
import { Onboarding } from "./Onboarding";

export default async function HomePage() {
  const ctx = await requireAcademy();
  return (
    <div className="mx-auto max-w-6xl">
      <Onboarding ctx={ctx} />
      {ctx.isOwner ? <OwnerOverview ctx={ctx} /> : <TeacherToday ctx={ctx} />}
    </div>
  );
}

/* ───────────── 학원장: 학원 전체가 잘 돌아가는지 조망 ───────────── */
async function OwnerOverview({ ctx }: { ctx: AcademyContext }) {
  const academyId = ctx.member.academyId;
  const now = new Date();
  const week = seoulWeekRange(now);
  const weeks8 = recentWeeks(8);
  const [grades8, students, teachers, retakeOpen, missed, books, wordCount, newBooks] = await Promise.all([
    loadGrades(academyId, { academyId }, weeks8[0]),
    prisma.student.findMany({ where: { academyId, status: "active" }, include: { classRoom: true, teachers: { select: { memberId: true } } } }),
    prisma.academyMember.findMany({ where: { academyId, status: "active" }, include: { user: { select: { name: true } }, students: { select: { studentId: true } } } }),
    prisma.retakeTask.count({ where: { student: { academyId }, status: { in: ["pending", "issued"] } } }),
    prisma.assignment.count({ where: { exam: { academyId }, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: now, gte: week.start } } }),
    prisma.vocabBook.count({ where: { academyId, status: "active" } }),
    prisma.word.count({ where: { book: { academyId, status: "active" } } }),
    prisma.vocabBook.count({ where: { academyId, createdAt: { gte: week.start } } }),
  ]);
  const first = grades8.filter((g) => !g.isRetake);
  const thisWeek = first.filter((g) => g.at >= week.start);
  const weekAvg = avg(thisWeek.map((g) => g.score));
  const weekPass = rate(thisWeek.filter((g) => g.passed).length, thisWeek.length);
  const byDay = Array.from({ length: 7 }, (_, i) => thisWeek.filter((g) => Math.floor((g.at.getTime() - week.start.getTime()) / 86400e3) === i).length);
  const series8 = weeklySeries(first, weeks8);
  const delta8 = trendDelta(series8);

  // 반별 통과율·추세 → 주의 반
  const classes = new Map<string, { name: string; ids: string[] }>();
  for (const s of students) {
    const k = s.classRoom?.name ?? "반 없음";
    const c = classes.get(k) ?? { name: k, ids: [] };
    c.ids.push(s.id);
    classes.set(k, c);
  }
  const classStats = [...classes.values()].map((c) => {
    const g = first.filter((x) => c.ids.includes(x.studentId) && x.at >= weeks8[4]);
    const series = weeklySeries(first.filter((x) => c.ids.includes(x.studentId)), weeks8);
    return { ...c, pass: rate(g.filter((x) => x.passed).length, g.length), avg: avg(g.map((x) => x.score)), n: g.length, series, delta: trendDelta(series) };
  });
  const attention = classStats.filter((c) => c.n >= 3).sort((a, b) => (a.pass ?? 101) - (b.pass ?? 101) || (a.delta ?? 0) - (b.delta ?? 0))[0];
  const attentionTeachers = attention ? teachers.filter((t) => t.students.some((s) => attention.ids.includes(s.studentId))).map((t) => t.user.name) : [];
  const teacherRows = teachers
    .filter((t) => t.students.length > 0)
    .map((t) => {
      const ids = t.students.map((s) => s.studentId);
      const g = first.filter((x) => ids.includes(x.studentId) && x.at >= weeks8[4]);
      return { key: t.id, label: t.user.name, value: avg(g.map((x) => x.score)), sub: `${ids.length}명` };
    });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Overview · 학원 전체</div>
          <h1 className="h1 mt-1">{ctx.member.academy.name} 운영 현황</h1>
        </div>
      </header>

      <div className="bento">
        <section className="card span-4 card-body flex min-h-[250px] flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="lbl">This week · 학원 전체</div>
            <span className="digital">
              {fmtMD(week.start)} — {fmtMD(new Date(week.end.getTime() - 1))}
            </span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="num-xl">
                <CountUp value={weekAvg} />
              </div>
              <div className="muted mt-2">이번 주 평균 점수 · 시험 {thisWeek.length}건 확정</div>
              <div className="mt-3">
                <PulseBars values={byDay} labels={["월", "화", "수", "목", "금", "토", "일"]} height={34} />
              </div>
            </div>
            {/* 통과율은 링 하나로만 (같은 숫자를 옆에 한 번 더 쓰지 않는다) */}
            <div className="flex items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <Ring value={weekPass ?? 0} size={96} stroke={6}>
                  <span className="digital">
                    <CountUp value={weekPass} suffix="%" />
                  </span>
                </Ring>
                <div className="lbl">Pass rate</div>
              </div>
              <div className="flex gap-6 pb-7">
                <div>
                  <div className="lbl">Retake open</div>
                  <div className="num-md mt-1" style={retakeOpen ? { color: "var(--accent)" } : undefined}>
                    <CountUp value={retakeOpen} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card-accent span-2 card-body flex min-h-[250px] flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="lbl-on">Attention</div>
            <span className="badge-gray" style={{ background: "rgba(255,244,240,0.2)", color: "#fff4f0" }}>
              {classStats.length} CLASSES
            </span>
          </div>
          {attention ? (
            <>
              <div>
                <div className="text-[26px] font-bold leading-tight">{attention.name}</div>
                <div className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.9)" }}>
                  통과율 {attention.pass ?? "--"}% · 평균 {attention.avg ?? "--"}
                  {attention.delta !== null && attention.delta < 0 ? ` · 최근 ${-attention.delta}점 하락` : ""}
                </div>
                <div className="mt-2">
                  <Sparkline values={attention.series} height={44} color="#fff4f0" fill="rgba(255,244,240,0.18)" showDots={false} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "rgba(255,244,240,0.85)" }}>
                  담당 {attentionTeachers.join(", ") || "없음"}
                </span>
                <Link href={`/app/students?group=class&pick=${encodeURIComponent(attention.name)}`} className="btn-primary btn-sm" style={{ background: "#fff4f0", color: "var(--accent)" }}>
                  상세
                </Link>
              </div>
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
              아직 비교할 만큼 채점 결과가 없습니다. 시험이 쌓이면 통과율이 가장 낮은 반이 여기에 뜹니다.
            </p>
          )}
        </section>

        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Teachers · 담당별 4주 평균</div>
            <span className="digital">{teacherRows.length}</span>
          </div>
          <div className="mt-4">{teacherRows.length ? <HBars rows={teacherRows} accentBelow={70} hrefFor={(k) => `/app/students?teacher=${k}`} /> : <p className="muted">담당 지정된 선생님이 없습니다.</p>}</div>
          <Link href="/app/teachers" className="lbl-ink mt-3 inline-block">
            All →
          </Link>
        </section>

        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">This week · 결과 구성</div>
            <span className="digital">{thisWeek.length + missed}</span>
          </div>
          <div className="mt-4">
            <Donut
              parts={[
                { label: "통과", value: thisWeek.filter((g) => g.passed).length, color: "var(--ink)" },
                { label: "재시험", value: thisWeek.filter((g) => !g.passed).length, color: "var(--accent)" },
                { label: "미응시", value: missed, color: "rgba(27,26,24,0.25)" },
              ]}
            />
          </div>
        </section>

        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Weekly · 8주 추이</div>
            <span className="badge-gray" style={delta8 !== null && delta8 < 0 ? { color: "var(--accent)" } : undefined}>
              {delta8 === null ? "··" : delta8 > 0 ? `+${delta8}` : delta8}
            </span>
          </div>
          <div className="mt-3">
            <Sparkline values={series8} baseline={90} labels={weeks8.map(weekLabel)} height={90} />
          </div>
          <div className="muted mt-1 flex justify-between text-[11px]">
            <span>{weekLabel(weeks8[0])}</span>
            <span>이번 주 {series8[7] ?? "--"}</span>
          </div>
        </section>

        <Link href="/app/vocabulary" className="card-dark span-6 flex flex-wrap items-center justify-between gap-4 rounded-full px-6 py-4">
          <div className="flex items-center gap-4">
            <span className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
              Words
            </span>
            <span className="digital-lg">
              <CountUp value={books} /> BOOKS · <CountUp value={wordCount} /> WORDS
            </span>
          </div>
          <span className="text-[13px]" style={{ color: "rgba(236,233,227,0.75)" }}>
            이번 주 새 단어장 {newBooks} · 학생 {students.length}명 · 미응시 {missed}
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ───────────── 선생님: 오늘 할 일 ───────────── */
async function TeacherToday({ ctx }: { ctx: AcademyContext }) {
  const academyId = ctx.member.academyId;
  const scope = studentScope(ctx);
  const now = new Date();
  const week = seoulWeekRange(now);
  const weeks = recentWeeks(4);
  const dayStart = new Date(now.getTime() - ((now.getTime() + 9 * 3600e3) % 86400e3));
  const dayEnd = new Date(dayStart.getTime() + 86400e3);
  const [students, grades, todayAssignments, weekAssignments, overdue, retakes, scansPending] = await Promise.all([
    prisma.student.findMany({ where: { ...scope, status: "active" }, include: { classRoom: true } }),
    loadGrades(academyId, scope, weeks[0]),
    prisma.assignment.findMany({ where: { exam: { academyId }, student: scope, OR: [{ dueAt: { gte: dayStart, lt: dayEnd } }, { createdAt: { gte: dayStart, lt: dayEnd } }] }, include: { exam: true, student: true }, take: 50 }),
    prisma.assignment.findMany({ where: { exam: { academyId, isRetake: false }, student: scope, OR: [{ dueAt: { gte: week.start, lt: week.end } }, { createdAt: { gte: week.start } }] }, include: { exam: { select: { id: true, title: true } } } }),
    prisma.assignment.count({ where: { exam: { academyId }, student: scope, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: now } } }),
    prisma.retakeTask.findMany({ where: { student: scope, status: { in: ["pending", "issued"] } }, include: { student: true, sourceAttempt: { include: { assignment: { include: { exam: true } } } } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 60 }),
    prisma.scanUpload.count({ where: { academyId, status: { in: ["needs_review", "queued", "processing", "unrecognized"] } } }),
  ]);
  const first = grades.filter((g) => !g.isRetake);
  const todayDone = todayAssignments.filter((a) => a.status === "completed").length;
  const todayPct = todayAssignments.length ? Math.round((todayDone / todayAssignments.length) * 100) : 0;
  // 이번 주 대표 시험 (배정 수 최다)
  const examCount = new Map<string, { title: string; total: number; done: number }>();
  for (const a of weekAssignments) {
    const e = examCount.get(a.examId) ?? { title: a.exam.title, total: 0, done: 0 };
    e.total++;
    if (a.status === "completed") e.done++;
    examCount.set(a.examId, e);
  }
  const weekExam = [...examCount.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  // 마감이 가까운 시험부터: 아직 안 친 배정이 있는 발행 시험을 마감 오름차순으로 (마감 없음은 뒤)
  const openAssign = await prisma.assignment.findMany({ where: { exam: { academyId, status: "published" }, student: scope, status: { in: ["assigned", "in_progress"] } }, select: { examId: true, dueAt: true, exam: { select: { title: true, isRetake: true } } } });
  const dueMap = new Map<string, { title: string; due: Date | null; remaining: number; isRetake: boolean }>();
  for (const a of openAssign) {
    const e = dueMap.get(a.examId) ?? { title: a.exam.title, due: a.dueAt, remaining: 0, isRetake: a.exam.isRetake };
    e.remaining++;
    if (a.dueAt && (!e.due || a.dueAt < e.due)) e.due = a.dueAt;
    dueMap.set(a.examId, e);
  }
  // 마감 임박 순: 아직 남은 시험(가까운 마감부터) → 마감 없는 시험 → 이미 지난 시험(경과)
  const rank = (d: Date | null) => (d === null ? 1 : d.getTime() >= now.getTime() ? 0 : 2);
  const dueSoon = [...dueMap.entries()]
    .sort((x, y) => rank(x[1].due) - rank(y[1].due) || (x[1].due?.getTime() ?? 0) - (y[1].due?.getTime() ?? 0))
    .slice(0, 5);
  const dday = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400e3) : null);
  const weekGrades = first.filter((g) => g.at >= week.start);
  const byDay = Array.from({ length: 7 }, (_, i) => weekGrades.filter((g) => Math.floor((g.at.getTime() - week.start.getTime()) / 86400e3) === i).length);
  // 학생별 평균·추세
  const rows = students
    .map((s) => {
      const gs = first.filter((g) => g.studentId === s.id);
      const series = weeklySeries(gs, weeks);
      return { s, a: avg(gs.map((g) => g.score)), delta: trendDelta(series), last: gs.length ? Math.round(gs[gs.length - 1].score) : null };
    })
    .sort((x, y) => (x.a ?? 101) - (y.a ?? 101));
  // 재시험: 출제 전 / 출제됨(마감일별 묶음)
  const retakeNotIssued = retakes.filter((r) => !r.retakeExamId);
  const retakeIssued = retakes.filter((r) => !!r.retakeExamId);
  const retakeByDue = new Map<string, { label: string; at: number; names: string[]; overdue: boolean }>();
  for (const r of retakeIssued) {
    const key = r.dueAt ? fmtMD(r.dueAt) : "마감 없음";
    const e = retakeByDue.get(key) ?? { label: key, at: r.dueAt?.getTime() ?? Infinity, names: [], overdue: !!r.dueAt && r.dueAt < now };
    if (!e.names.includes(r.student.name)) e.names.push(r.student.name);
    retakeByDue.set(key, e);
  }
  const retakeGroups = [...retakeByDue.values()].sort((a, b) => a.at - b.at);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Today · {fmtDate(now, false)}</div>
          <h1 className="h1 mt-1">오늘 할 일</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/tests/new" className="btn-primary">
            + 시험 출제
          </Link>
          <Link href="/app/vocabulary" className="btn-secondary">
            단어장 업로드
          </Link>
          <Link href="/app/scans" className="btn-ghost">
            사진 채점
          </Link>
        </div>
      </header>

      <div className="bento">
        <Link href="/app/tests" className="card span-4 card-body flex min-h-[220px] flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="lbl">Today · 오늘 시험 진행</div>
            <span className="digital">{todayAssignments.length ? `${todayDone}/${todayAssignments.length}` : "--"}</span>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="num-xl">
                <CountUp value={todayPct} />
                <span className="num-md align-top" style={{ color: "var(--ink-3)" }}>
                  %
                </span>
              </div>
              <div className="muted mt-2">오늘 마감·배정된 시험의 완료율 · 미응시 {overdue}</div>
            </div>
            <Ring value={todayPct} size={88} stroke={5}>
              <span className="lbl-ink">
                <CountUp value={todayDone} />
              </span>
            </Ring>
          </div>
        </Link>

        <div className="card-accent span-2 card-body flex min-h-[220px] flex-col justify-between" data-testid="due-soon">
          <div className="flex items-start justify-between">
            <div className="lbl-on">Due soon · 마감 임박 순</div>
            <span className="digital">{weekExam ? `${weekExam[1].done}/${weekExam[1].total}` : "--"}</span>
          </div>
          <div>
            {dueSoon.length === 0 ? (
              <>
                <div className="num-lg">--</div>
                <div className="lbl-on mt-2">안 친 시험이 없습니다</div>
              </>
            ) : (
              <ul className="mt-1">
                {dueSoon.map(([id, e]) => {
                  const d = dday(e.due);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderTop: "1px solid rgba(255,244,240,0.2)" }}>
                      <Link href={d !== null && d < 0 ? `/app/tests/${id}?step=3#due` : `/app/tests/${id}`} className="min-w-0 truncate text-[13.5px] font-semibold hover:underline" title={d !== null && d < 0 ? "기한 경과 · 마감기한 변경" : undefined}>
                        {e.title}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="lbl-on">{e.remaining}명 남음</span>
                        <span className="digital" style={{ color: d !== null && d <= 1 ? "#ffd9cc" : undefined, opacity: d !== null && d < 0 ? 0.7 : 1 }}>
                          {d === null ? "NO DUE" : d < 0 ? `경과 ${-d}일` : d === 0 ? "D-DAY" : `D-${d}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <PulseBars values={byDay} labels={["월", "화", "수", "목", "금", "토", "일"]} color="#fff4f0" dim="rgba(255,244,240,0.3)" height={34} />
        </div>

        <section className="card span-3 card-body">
          <div className="mb-2 flex items-center justify-between">
            <div className="lbl">Students · 담당 {students.length}명 · 4주</div>
            <Link href="/app/students" className="lbl-ink">
              Dashboard →
            </Link>
          </div>
          <StudentRotator rows={rows.map((r) => ({ id: r.s.id, name: r.s.name, className: r.s.classRoom?.name ?? null, a: r.a, delta: r.delta, last: r.last }))} pageSize={6} />
        </section>

        <section className="card span-3 card-body" data-testid="retake-today">
          <div className="mb-2 flex items-center justify-between">
            <div className="lbl">Retake · 재시험 · 마감일별</div>
            <span className={retakes.length ? "badge-red" : "badge-gray"}>{retakes.length}</span>
          </div>
          {retakes.length === 0 ? (
            <p className="muted">재시험 대상이 없습니다.</p>
          ) : (
            <ul>
              {retakeNotIssued.length > 0 && (
                <li className="row">
                  <span className="min-w-0 truncate text-[14px]">
                    <b>출제 전</b> <span className="muted">· {[...new Set(retakeNotIssued.map((r) => r.student.name))].slice(0, 4).join(", ")}{new Set(retakeNotIssued.map((r) => r.student.name)).size > 4 ? ` 외 ${new Set(retakeNotIssued.map((r) => r.student.name)).size - 4}명` : ""}</span>
                  </span>
                  <Link href="/app/retakes" className="badge-amber">
                    {retakeNotIssued.length}건 내기
                  </Link>
                </li>
              )}
              {retakeGroups.slice(0, 5).map((g) => (
                <li key={g.label} className="row">
                  <span className="min-w-0 truncate text-[14px]">
                    <b style={g.overdue ? { color: "var(--accent)" } : undefined}>{g.at === Infinity ? "마감 없음" : `${g.label}${g.overdue ? " 지남" : " 마감"}`}</b> <span className="muted">· {g.names.slice(0, 4).join(", ")}{g.names.length > 4 ? ` 외 ${g.names.length - 4}명` : ""}</span>
                  </span>
                  <span className={g.overdue ? "badge-red" : "badge-blue"}>{g.names.length}명</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/retakes" className="lbl-ink mt-2 inline-block">
            재시험 화면 →
          </Link>
        </section>

        <Link href="/app/scans" className="card-sm span-2 card-body">
          <div className="lbl">Scan queue</div>
          <div className="mt-3 flex items-baseline gap-3">
            <div className="num-lg">
              <CountUp value={scansPending} />
            </div>
            <span className={scansPending ? "badge-amber" : "badge-gray"}>{scansPending ? "REVIEW" : "CLEAR"}</span>
          </div>
        </Link>
        <Link href="/app/results?filter=overdue" className="card-sm span-2 card-body">
          <div className="lbl">Overdue</div>
          <div className="num-lg mt-3" style={overdue ? { color: "var(--accent)" } : undefined}>
            <CountUp value={overdue} />
          </div>
          <div className="muted mt-1">미응시 · 기한 경과</div>
        </Link>
        <div className="card-dark span-2 card-body">
          <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
            Next retake due
          </div>
          <div className="digital-lg mt-3">{retakeGroups[0]?.at !== undefined && retakeGroups[0].at !== Infinity ? retakeGroups[0].label : "--"}</div>
          <div className="mt-1 text-[12px]" style={{ color: "rgba(236,233,227,0.7)" }}>
            {retakeGroups[0] ? `${retakeGroups[0].names.length}명 · ${retakeGroups[0].names.slice(0, 3).join(", ")}` : retakeNotIssued.length ? `출제 전 ${retakeNotIssued.length}명` : "가까운 재시험 마감 없음"}
          </div>
        </div>

        {todayAssignments.length > 0 && (
          <section className="card span-6 card-body">
            <div className="mb-2 flex items-center justify-between">
              <div className="lbl">Assigned today</div>
              <span className="digital">{todayAssignments.length}</span>
            </div>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {todayAssignments.slice(0, 10).map((a) => (
                <li key={a.id} className="row">
                  <span className="text-[14px]">
                    {a.student.name} <span className="muted">· {a.exam.title}</span>
                  </span>
                  <StatusBadge s={a.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
