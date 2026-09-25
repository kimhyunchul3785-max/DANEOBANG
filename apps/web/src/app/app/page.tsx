import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy, type AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, fmtMD, fmtMDHM, seoulWeekRange } from "@/lib/util";
import { RankBars, CompositionBar, MicroTrend } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { Icon } from "@/components/Icon";
import { StudentRotator } from "./StudentRotator";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, trendDelta } from "@/lib/stats";
import { Onboarding } from "./Onboarding";
import { Suspense } from "react";
import { DeniedNotice } from "./DeniedNotice";
import { todayAssignmentWhere, overdueAssignmentWhere, MIN_SAMPLE } from "@/lib/metrics";

export default async function HomePage() {
  const ctx = await requireAcademy();
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={null}>
        <DeniedNotice />
      </Suspense>
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
  const enough = thisWeek.length >= MIN_SAMPLE;
  const weekPass = enough ? rate(thisWeek.filter((g) => g.passed).length, thisWeek.length) : null;
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
      return { key: t.id, label: t.user.name, value: avg(g.map((x) => x.score)), sub: `${ids.length}명`, href: `/app/students?teacher=${t.id}` };
    });

  const ranked = [...classStats].sort((a, b) => (a.n >= 3 ? 0 : 1) - (b.n >= 3 ? 0 : 1) || (a.pass ?? 101) - (b.pass ?? 101));
  const weekParts = [
    { label: "통과", value: thisWeek.filter((g) => g.passed).length, tone: "ink" as const },
    { label: "재시험", value: thisWeek.filter((g) => !g.passed).length, tone: "accent" as const, href: "/app/retakes" },
    { label: "미응시", value: missed, tone: "muted" as const, href: "/app/results?filter=overdue" },
  ];
  // 반별 8주 미니 추이는 같은 세로 범위로 — 줄끼리 높낮이를 비교할 수 있게
  const classVals = classStats.flatMap((c) => c.series.filter((v): v is number => v !== null));
  const classDomain: [number, number] | undefined = classVals.length ? [Math.max(0, Math.min(...classVals) - 4), Math.min(100, Math.max(...classVals) + 4)] : undefined;
  const avg8 = avg(first.map((g) => g.score));
  const n8 = series8.filter((v) => v !== null).length;
  const k8 = n8 >= 6 ? 3 : n8 >= 4 ? 2 : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">
            {fmtDate(now, false)} · 이번 주 {fmtMD(week.start)}–{fmtMD(new Date(week.end.getTime() - 1))}
          </div>
          <h1 className="h1 mt-0.5">운영 현황</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/app/teachers" className="btn-secondary">
            선생님 관리
          </Link>
        </div>
      </header>

      {/* 학원 전체 숫자 5개: 한 줄. 표본이 적으면 '—' + 이유를 같은 칸에 */}
      <div className="kpis" style={{ ["--n" as string]: 5 }}>
        <div>
          <span className="lbl">이번 주 평균</span>
          <span className="kpi-v">{weekAvg === null ? "—" : <CountUp value={weekAvg} />}</span>
          <span className="kpi-s">
            시험 {thisWeek.length}건 확정{!enough && thisWeek.length > 0 ? " · 표본 적음" : ""}
          </span>
        </div>
        <div>
          <span className="lbl">통과율</span>
          <span className="kpi-v">{weekPass === null ? "—" : <CountUp value={weekPass} suffix="%" />}</span>
          <span className="kpi-s">{enough ? `첫 응시 ${thisWeek.length}건` : `${MIN_SAMPLE}건 이상부터 표시`}</span>
        </div>
        <Link href="/app/retakes">
          <span className="lbl">재시험 진행</span>
          <span className="kpi-v" style={retakeOpen ? { color: "var(--warn)" } : undefined}>
            <CountUp value={retakeOpen} />
            <small>건</small>
          </span>
          <span className="kpi-s">출제 전 + 응시 대기</span>
        </Link>
        <Link href="/app/results?filter=overdue">
          <span className="lbl">이번 주 미응시</span>
          <span className="kpi-v" style={missed ? { color: "var(--accent)" } : undefined}>
            {missed}
            <small>건</small>
          </span>
          <span className="kpi-s">학생 {students.length}명 중</span>
        </Link>
        <Link href="/app/vocabulary">
          <span className="lbl">단어장</span>
          <span className="kpi-v">
            <CountUp value={books} />
            <small>권 · {wordCount.toLocaleString()}단어</small>
          </span>
          <span className="kpi-s">이번 주 새 단어장 {newBooks}</span>
        </Link>
      </div>

      {/* 왼쪽: 반별 표 → 선생님별 비교 · 오른쪽: 이번 주 결과 + 8주 평균을 한 표면에 (카드 수를 줄인다) */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 반별: 가장 약한 반을 맨 위에, '주의' 표시로만 강조 (주황 카드 대신) */}
        <section className="card overflow-hidden" data-testid="class-health">
          <div className="sec-h px-5 pb-2 pt-4">
            <h2 className="sec-t">반별 현황 · 최근 4주</h2>
            <Link href="/app/students?group=class" className="sec-link">
              반 전체 →
            </Link>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>반</th>
                <th>학생</th>
                <th>통과율</th>
                <th>평균</th>
                <th>추세</th>
                <th className="hidden sm:table-cell">8주</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const warn = attention?.name === c.name;
                return (
                  <tr key={c.name}>
                    <td style={{ paddingLeft: 20 }}>
                      <Link href={`/app/students?group=class&pick=${encodeURIComponent(c.name)}`} className="flex items-center gap-2 font-semibold hover:underline">
                        {c.name}
                        {warn && <span className="badge-red">주의</span>}
                      </Link>
                      {warn && attentionTeachers.length > 0 && <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>담당 {attentionTeachers.join(", ")}</div>}
                    </td>
                    <td className="tabular-nums">{c.ids.length}명</td>
                    <td className="font-semibold tabular-nums" style={warn ? { color: "var(--accent)" } : undefined}>
                      {c.n >= 3 && c.pass !== null ? `${c.pass}%` : "—"}
                    </td>
                    <td className="tabular-nums">{c.avg ?? "—"}</td>
                    <td className="tabular-nums text-[13px]" style={{ color: c.delta !== null && c.delta < 0 ? "var(--accent)" : "var(--ink-3)" }}>
                      {c.delta === null ? "—" : c.delta > 0 ? `▲ ${c.delta}` : c.delta < 0 ? `▼ ${-c.delta}` : "–"}
                    </td>
                    <td className="hidden w-[120px] sm:table-cell">
                      <MicroTrend values={c.series} labels={weeks8.map(weekLabel)} height={28} domain={classDomain} warn={warn} ariaLabel={`${c.name} 8주 평균`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {classStats.length === 0 && <p className="muted px-5 pb-5">반이 없습니다.</p>}
        </section>

        <section className="card lg:col-start-2 lg:row-span-2 lg:row-start-1" data-testid="owner-week">
          <div className="card-body">
            <div className="sec-h">
              <h2 className="sec-t">이번 주 결과</h2>
              <span className="text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                {thisWeek.length + missed}건
              </span>
            </div>
            {thisWeek.length + missed === 0 ? (
              <p className="muted mt-3 text-[13.5px]">아직 이번 주 결과가 없어요</p>
            ) : (
              <div className="mt-4">
                <CompositionBar parts={weekParts} />
                {weekPass !== null && (
                  <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    통과율 <b className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{weekPass}%</b>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="card-body border-t" style={{ borderColor: "var(--line)" }}>
            <div className="lbl">8주 평균</div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="kpi-v" style={{ fontSize: 30 }}>{avg8 ?? "—"}</span>
              {n8 >= 4 && delta8 !== null && delta8 !== 0 && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: delta8 < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                  {delta8 > 0 ? `+${delta8}` : delta8} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>최근 {k8}주</span>
                </span>
              )}
            </div>
            <div className="mt-3">
              <MicroTrend values={series8} labels={weeks8.map(weekLabel)} baseline={90} height={48} tips ariaLabel="8주 평균 추이" />
            </div>
            <div className="mt-1 flex justify-between text-[11.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
              <span>{weekLabel(weeks8[0])}</span>
              <span>이번 주</span>
            </div>
          </div>
        </section>

        <section className="card card-body">
          <div className="sec-h">
            <h2 className="sec-t">선생님별 · 담당 학생 4주 평균</h2>
            <Link href="/app/teachers" className="sec-link">
              전체 →
            </Link>
          </div>
          <div className="mt-2">{teacherRows.length ? <RankBars rows={teacherRows} warnBelow={70} limit={8} moreHref="/app/teachers" /> : <p className="muted">담당 지정된 선생님이 없습니다.</p>}</div>
        </section>
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
  const todayWhere = todayAssignmentWhere(academyId, scope, now);
  const [todayTotal, todayDone, students, grades, todayAssignments, overdue, retakes, scansPending] = await Promise.all([
    prisma.assignment.count({ where: todayWhere }),
    prisma.assignment.count({ where: { ...todayWhere, status: "completed" } }),
    prisma.student.findMany({ where: { ...scope, status: "active" }, include: { classRoom: true } }),
    loadGrades(academyId, scope, weeks[0]),
    prisma.assignment.findMany({ where: todayWhere, include: { exam: true, student: true }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 80 }),
    prisma.assignment.count({ where: overdueAssignmentWhere(academyId, scope, now) }),
    prisma.retakeTask.findMany({ where: { student: scope, status: { in: ["pending", "issued"] } }, include: { student: true, sourceAttempt: { include: { assignment: { include: { exam: true } } } } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 60 }),
    prisma.scanUpload.count({ where: { academyId, status: { in: ["needs_review", "queued", "processing", "unrecognized"] } } }),
  ]);
  const first = grades.filter((g) => !g.isRetake);
  const todayPct = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;
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
  const dueAll = [...dueMap.entries()].sort((x, y) => rank(x[1].due) - rank(y[1].due) || (x[1].due?.getTime() ?? 0) - (y[1].due?.getTime() ?? 0));
  const dueSoon = dueAll.filter(([, e]) => rank(e.due) !== 2).slice(0, 4);
  // 기한 지남은 상위 몇 개가 아니라 전체로 센다 → '기한 지남' 카드 숫자와 같다
  const overdueExams = dueAll.filter(([, e]) => rank(e.due) === 2);
  const overdueStudents = overdueExams.reduce((n, [, e]) => n + e.remaining, 0);
  const dday = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400e3) : null);
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

  // 진행 중 시험별 학생 현황 (마감 임박 목록 안에서 펼쳐 보인다 — 따로 '학생별' 카드를 두지 않는다)
  const byExam = new Map<string, { done: number; total: number; pending: string[] }>();
  for (const a of todayAssignments) {
    const e = byExam.get(a.examId) ?? { done: 0, total: 0, pending: [] };
    e.total++;
    if (a.status === "completed") e.done++;
    else e.pending.push(a.student.name);
    byExam.set(a.examId, e);
  }
  const retakeWaiting = retakeIssued.length;
  const names = (xs: string[], n = 4) => `${xs.slice(0, n).join(", ")}${xs.length > n ? ` 외 ${xs.length - n}명` : ""}`;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">{fmtDate(now, false)}</div>
          <h1 className="h1 mt-0.5">오늘 할 일</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/vocabulary" className="btn-secondary hidden sm:inline-flex">
            <Icon name="upload" size={16} />
            단어장 업로드
          </Link>
          <Link href="/app/tests/new" className="btn-primary">
            <Icon name="plus" size={16} strokeWidth={2.2} />
            시험 만들기
          </Link>
        </div>
      </header>

      {/* 상태 요약: 카드 4장 대신 한 표면을 칸막이로 — 숫자는 같은 크기, 색은 문제일 때만 */}
      <div className="kpis" style={{ ["--n" as string]: 4 }}>
        <Link href="/app/tests" className="kpi">
          <span className="lbl">
            진행 중인 시험<span className="hidden sm:inline"> · 오늘 기준</span>
          </span>
          <span className="kpi-v">
            {todayDone}
            <small>/ {todayTotal} 완료</small>
          </span>
          <div className="meter" aria-hidden>
            <i className="tick" style={{ width: `${todayPct}%` }} />
          </div>
          <span className="kpi-s" data-testid="today-line">
            {todayTotal ? `완료 ${todayDone} / 배정 ${todayTotal} · 남음 ${todayTotal - todayDone}` : "지금 진행 중인 시험이 없어요"}
          </span>
        </Link>
        <Link href="/app/results?filter=overdue" className="kpi" data-testid="kpi-overdue">
          <span className="lbl">기한 지남</span>
          <span className="kpi-v" style={overdue ? { color: "var(--accent)" } : undefined} data-testid="kpi-overdue-v">
            {overdue}
            <small>건</small>
          </span>
          <span className="kpi-s">{overdue ? "마감이 지났는데 안 친 배정" : "밀린 시험이 없어요"}</span>
        </Link>
        <Link href="/app/retakes" className="kpi">
          <span className="lbl">재시험 출제 전</span>
          <span className="kpi-v" style={retakeNotIssued.length ? { color: "var(--warn)" } : undefined}>
            {retakeNotIssued.length}
            <small>건</small>
          </span>
          <span className="kpi-s">응시 대기 {retakeWaiting}건</span>
        </Link>
        <Link href="/app/tests/scans" className="kpi">
          <span className="lbl">사진 채점 대기</span>
          <span className="kpi-v" style={scansPending ? { color: "var(--warn)" } : undefined}>
            {scansPending}
            <small>장</small>
          </span>
          <span className="kpi-s">{scansPending ? "확인이 필요해요" : "확인할 사진 없음"}</span>
        </Link>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* 왼쪽: 해야 할 일의 본체 — 마감 순 시험 + 안 친 학생 */}
        <section className="card overflow-hidden" data-testid="due-soon">
          <div className="sec-h px-5 pb-3 pt-4">
            <h2 className="sec-t">마감 임박 시험</h2>
            <Link href="/app/tests" className="sec-link">
              시험 전체 →
            </Link>
          </div>
          {dueSoon.length === 0 && overdueExams.length === 0 ? (
            <div className="px-5 pb-8 pt-4 text-center">
              <p className="text-[14px] font-semibold">안 친 시험이 없습니다</p>
              <Link href="/app/tests/new" className="btn-secondary btn-sm mt-3">
                시험 만들기
              </Link>
            </div>
          ) : (
            <ul>
              {dueSoon.map(([id, e]) => {
                const d = dday(e.due);
                const st = byExam.get(id);
                const done = st?.done ?? 0;
                const total = st?.total ?? e.remaining;
                return (
                  <li key={id} className="border-t border-[var(--line)] px-5 py-3.5">
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <Link href={`/app/tests/${id}`} className="block truncate text-[14.5px] font-semibold hover:underline">
                          {e.title}
                        </Link>
                        {/* 날짜 · D-day 는 배지가 아니라 한 줄 글자로 — 급할 때(D-1 이내)만 강조색 */}
                        <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                          {e.due ? `${fmtMDHM(e.due)}까지` : "마감 없음"}
                          {d !== null && <span style={d <= 1 ? { color: "var(--accent)", fontWeight: 600 } : undefined}>{d === 0 ? " · 오늘 마감" : ` · D-${d}`}</span>}
                          {e.isRetake && " · 재시험"}
                          <span className="sm:hidden">
                            {" · "}
                            {done}/{total} 완료
                          </span>
                        </div>
                      </div>
                      <div className="hidden w-[160px] shrink-0 sm:block">
                        <div className="flex justify-between text-[12.5px]">
                          <span style={{ color: "var(--ink-3)" }}>완료</span>
                          <span className="font-semibold tabular-nums">
                            {done}/{total}
                          </span>
                        </div>
                        <div className="meter mt-1.5" aria-hidden>
                          <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                    {st && st.pending.length > 0 && (
                      <p className="mt-2 break-keep text-[12.5px] leading-5" style={{ color: "var(--ink-2)" }}>
                        <span style={{ color: "var(--ink-3)" }}>안 친 학생 {e.remaining} · </span>
                        {st.pending.slice(0, 8).join(", ")}
                        {st.pending.length > 8 && <span style={{ color: "var(--ink-3)" }}> 외 {st.pending.length - 8}명</span>}
                      </p>
                    )}
                  </li>
                );
              })}
              {/* 지난 시험은 섞지 않고 따로 한 줄 */}
              {overdueExams.length > 0 && (
                <li className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3" style={{ background: "var(--accent-soft)" }} data-testid="due-overdue-line">
                  <span className="flex min-w-0 items-center gap-2.5 text-[14px]">
                    <span className="dot red" />
                    <span className="truncate">
                      <b>기한 지남</b> · {overdueExams.length}개 시험 · {overdueStudents}명
                    </span>
                  </span>
                  <Link href="/app/tests?filter=overdue" className="btn-secondary btn-sm shrink-0">
                    마감 늘리기
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* 오른쪽: 후속 조치 — 재시험 · 챙길 학생 */}
        <div className="flex flex-col gap-4">
          <section className="card" data-testid="retake-today">
            <div className="sec-h px-5 pb-2 pt-4">
              <h2 className="sec-t">재시험</h2>
              <Link href="/app/retakes" className="sec-link">
                재시험 화면 →
              </Link>
            </div>
            {retakes.length === 0 ? (
              <p className="muted px-5 pb-5">재시험 대상이 없습니다.</p>
            ) : (
              <ul className="px-5 pb-3">
                {retakeNotIssued.length > 0 && (
                  <li className="row">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        <span className="dot amber" />
                        출제 전 {retakeNotIssued.length}건
                      </span>
                      <span className="muted block truncate pl-[15px] text-[12.5px]">{names([...new Set(retakeNotIssued.map((r) => r.student.name))], 3)}</span>
                    </span>
                    <Link href="/app/retakes" className="btn-primary btn-sm shrink-0">
                      출제하기
                    </Link>
                  </li>
                )}
                {retakeGroups.slice(0, 4).map((g) => (
                  <li key={g.label} className="row">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-semibold" style={g.overdue ? { color: "var(--accent)" } : undefined}>
                        <span className={`dot ${g.overdue ? "red" : "blue"}`} />
                        {g.at === Infinity ? "마감 없음" : `${g.label}${g.overdue ? " 지남" : " 마감"}`}
                      </span>
                      <span className="muted block truncate pl-[15px] text-[12.5px]">{names(g.names, 3)}</span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--ink-3)" }}>
                      {g.names.length}명
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card px-5 pb-4 pt-4">
            <div className="sec-h mb-1">
              <h2 className="sec-t">
                담당 학생 <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>{students.length}</span>
              </h2>
              <Link href="/app/students" className="sec-link">
                4주 평균 · 전체 →
              </Link>
            </div>
            <StudentRotator rows={rows.map((r) => ({ id: r.s.id, name: r.s.name, className: r.s.classRoom?.name ?? null, a: r.a, delta: r.delta, last: r.last }))} pageSize={5} />
          </section>
        </div>
      </div>
    </div>
  );
}
