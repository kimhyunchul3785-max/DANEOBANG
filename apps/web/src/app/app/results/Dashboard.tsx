import Link from "next/link";
import { prisma } from "@/lib/db";
import type { AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import type { HeatCell } from "@/components/Viz";
import { TrendChart } from "@/components/Viz";
import { SortHeader, CountUp } from "@/components/Motion";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, scoreBins, consecutiveFails, trendDelta, weekIndex, bookLineage } from "@/lib/stats";
import { fmtMD, fmtMDHM, parseJSON } from "@/lib/util";
import { WidgetBoard, type DashboardData } from "./WidgetBoard";
import { normalizeLayout } from "./widgets";
import { ChipRail, BookSelect, type RailItem } from "./ResultsNav";

export type View = "summary" | "students" | "school" | "grade" | "class";
export const VIEWS: [View, string][] = [
  ["summary", "요약"],
  ["students", "학생별"],
  ["school", "학교별"],
  ["grade", "학년별"],
  ["class", "반별"],
];
type Dim = "school" | "grade" | "class";

export type DashboardParams = { tab?: string; teacher?: string; q?: string; pick?: string; book?: string };

/** 성적 머리의 기준 탭 — 시험 기록 화면(?examId 등)에서는 아무 것도 고르지 않은 채로 */
export function ResultsTabs({ view, book }: { view: View | null; book?: string | null }) {
  return (
    <div className="seg" role="tablist" aria-label="분류 기준" data-testid="results-tabs">
      {VIEWS.map(([k, l]) => (
        <Link key={k} href={`/app/results?tab=${k}${book ? `&book=${book}` : ""}`} className={`seg-item${view === k ? " on" : ""}`} role="tab" aria-selected={view === k} data-tab={k}>
          {l}
        </Link>
      ))}
    </div>
  );
}

/**
 * 성적 = [요약 | 학생별 | 학교별 | 학년별 | 반별] ‹ 항목 칩 › · [단어장 ▾]
 * 단어장 전체 = 최근 12주, 단어장을 고르면 그 단어장(병합본이면 원본까지)으로 만든 시험의 전체 기간.
 */
export async function GradesDashboard({ ctx, sp, view }: { ctx: AcademyContext; sp: DashboardParams; view: View }) {
  const academyId = ctx.member.academyId;
  const now = new Date();
  const books = await prisma.vocabBook.findMany({ where: { academyId, status: "active" }, select: { id: true, title: true, mergedFrom: true }, orderBy: { updatedAt: "desc" } });
  const bookId = sp.book && books.some((b) => b.id === sp.book) ? sp.book : null;
  const bookIds = bookId ? await bookLineage(academyId, bookId) : null;

  const students = await prisma.student.findMany({
    where: { ...studentScope(ctx), status: "active", ...(sp.teacher ? { teachers: { some: { memberId: sp.teacher } } } : {}) },
    include: { classRoom: true },
    orderBy: [{ classId: "asc" }, { name: "asc" }],
  });
  const ids = students.map((s) => s.id);

  // 기간: 전체 = 최근 12주(+ 비교용 이전 12주), 단어장 = 첫 성적부터 지금까지(주 단위, 최대 52주)
  let weeks = recentWeeks(12);
  const prevStart = new Date(weeks[0].getTime() - 12 * 7 * 86400e3);
  const gradesAll = await loadGrades(academyId, { id: { in: ids } }, bookIds ? undefined : prevStart, bookIds);
  if (bookIds && gradesAll.length) {
    const n = Math.ceil((now.getTime() - gradesAll[0].at.getTime()) / (7 * 86400e3)) + 1;
    weeks = recentWeeks(Math.min(52, Math.max(4, n)));
  }
  const from = bookIds ? new Date(0) : weeks[0];
  const [openRetakes, overdue, passScoreAgg] = await Promise.all([
    prisma.retakeTask.findMany({
      where: { studentId: { in: ids }, status: { in: ["pending", "issued"] }, ...(bookIds ? { sourceAttempt: { assignment: { exam: { bookId: { in: bookIds } } } } } : {}) },
      select: { studentId: true, retakeExamId: true },
    }),
    prisma.assignment.findMany({ where: { studentId: { in: ids }, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: now, gte: from }, exam: { status: { not: "archived" }, ...(bookIds ? { bookId: { in: bookIds } } : {}) } }, select: { studentId: true } }),
    prisma.exam.aggregate({ where: { academyId }, _avg: { passScore: true } }),
  ]);
  const passLine = Math.round(passScoreAgg._avg.passScore ?? 90);
  const warnLine = Math.max(60, passLine - 20);
  const firstAll = gradesAll.filter((g) => !g.isRetake && g.attemptNo === 1);
  const first = firstAll.filter((g) => g.at >= from);
  const prev = bookIds ? [] : firstAll.filter((g) => g.at < from);
  const byStudent = new Map<string, typeof first>();
  for (const g of first) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]);
  const retakeCount = new Map<string, number>();
  for (const r of openRetakes) retakeCount.set(r.studentId, (retakeCount.get(r.studentId) ?? 0) + 1);
  const overdueCount = new Map<string, number>();
  for (const o of overdue) overdueCount.set(o.studentId, (overdueCount.get(o.studentId) ?? 0) + 1);

  // 학생별 요약 행
  const perStudent = students.map((s) => {
    const gs = byStudent.get(s.id) ?? [];
    const series = weeklySeries(gs, weeks);
    const cells: HeatCell[] = weeks.map((_, wi) => {
      const inWeek = gs.filter((g) => weekIndex(weeks, g.at) === wi);
      if (!inWeek.length) return { v: null };
      const lowest = inWeek.reduce((m, g) => (g.score < m.score ? g : m), inWeek[0]);
      return { v: avg(inWeek.map((g) => g.score)), href: `/app/results/${lowest.attemptId}`, title: `${s.name} · ${weekLabel(weeks[wi])}: ${inWeek.map((g) => Math.round(g.score)).join(", ")} · ${lowest.examTitle}` };
    });
    const a = avg(gs.map((g) => g.score));
    const fails = consecutiveFails(series, passLine);
    return { s, a, n: gs.length, pass: rate(gs.filter((g) => g.passed).length, gs.length), series, cells, fails, retake: retakeCount.get(s.id) ?? 0, overdue: overdueCount.get(s.id) ?? 0, delta: trendDelta(series), last: gs.length ? Math.round(gs[gs.length - 1].score) : null };
  });
  type P = (typeof perStudent)[number];

  // 학교 · 학년 · 반 묶음 (학생 정보에 등록한 값 그대로)
  const keyOf = (dim: Dim, s: (typeof students)[number]): [string, string] => {
    if (dim === "class") return [s.classId ?? "none", s.classRoom?.name ?? "반 없음"];
    if (dim === "school") {
      const v = s.school?.trim();
      return [v || "none", v || "학교 미입력"];
    }
    const v = s.grade?.trim();
    return [v || "none", v || "학년 미입력"];
  };
  const groupsOf = (dim: Dim) => {
    const m = new Map<string, { key: string; label: string; rows: P[] }>();
    for (const p of perStudent) {
      const [k, l] = keyOf(dim, p.s);
      const g = m.get(k) ?? { key: k, label: l, rows: [] };
      g.rows.push(p);
      m.set(k, g);
    }
    return [...m.values()]
      .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label, "ko", { numeric: true })))
      .map((g) => {
        const sids = new Set(g.rows.map((r) => r.s.id));
        const gs = first.filter((x) => sids.has(x.studentId));
        const series = weeklySeries(gs, weeks);
        return {
          ...g,
          avg: avg(gs.map((x) => x.score)),
          pass: rate(gs.filter((x) => x.passed).length, gs.length),
          n: gs.length,
          series,
          delta: trendDelta(series),
          retake: g.rows.reduce((n, r) => n + r.retake, 0),
          overdue: g.rows.reduce((n, r) => n + r.overdue, 0),
        };
      });
  };

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: view, pick: sp.pick, book: bookId ?? undefined, teacher: sp.teacher, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/app/results?${p.toString()}`;
  };
  const bookTitle = bookId ? books.find((b) => b.id === bookId)!.title : null;
  const periodLabel = bookIds ? (bookIds.length > 1 ? `원본 ${bookIds.length - 1}권 포함 · 전체 기간` : "전체 기간") : "최근 12주";

  // 머리: 기준 탭 ‹ 항목 칩 › · 단어장
  let rail: RailItem[] = [];
  if (view === "students") rail = [{ key: "", label: "전체", sub: students.length, href: qs({ pick: undefined }) }, ...perStudent.map((p) => ({ key: p.s.id, label: p.s.name, href: qs({ pick: p.s.id }) }))];
  if (view === "school" || view === "grade" || view === "class") rail = [{ key: "", label: "전체", href: qs({ pick: undefined }) }, ...groupsOf(view).map((g) => ({ key: g.key, label: g.label, sub: g.rows.length, href: qs({ pick: g.key }) }))];
  const header = (
    <header className="mb-4">
      <div className="kicker">
        {ctx.isOwner ? "학원 전체" : "담당 학생"} · {bookTitle ? `${bookTitle} · ` : ""}
        {periodLabel}
      </div>
      <h1 className="h1 mt-1">성적</h1>
      <div className="results-nav mt-3">
        <ResultsTabs view={view} book={bookId} />
        {rail.length > 0 && <ChipRail items={rail} current={sp.pick ?? ""} />}
        <BookSelect books={books.map((b) => ({ id: b.id, title: b.title, merged: !!b.mergedFrom }))} value={bookId} />
      </div>
    </header>
  );

  // ── 요약: 위젯 보드 ──
  if (view === "summary") {
    const byExam = new Map<string, { title: string; scores: number[]; passed: number; at: Date; isRetake: boolean }>();
    for (const g of gradesAll.filter((g) => g.at >= from)) {
      const e = byExam.get(g.examId) ?? { title: g.examTitle, scores: [], passed: 0, at: g.at, isRetake: g.isRetake };
      e.scores.push(g.score);
      if (g.passed) e.passed++;
      if (g.at > e.at) e.at = g.at;
      byExam.set(g.examId, e);
    }
    const recent = [...byExam.entries()]
      .sort((a, b) => b[1].at.getTime() - a[1].at.getTime())
      .slice(0, 8)
      .map(([examId, e]) => ({ examId, title: e.title, avg: avg(e.scores), n: e.scores.length, passRate: rate(e.passed, e.scores.length), at: fmtMD(e.at), isRetake: e.isRetake }));
    const watch = perStudent
      .filter((p) => p.fails >= 2 || p.overdue >= 2 || (p.a !== null && p.a < 60) || (p.delta !== null && p.delta <= -15))
      .sort((a, b) => (a.a ?? 101) - (b.a ?? 101))
      .slice(0, 8);
    const classGroups = groupsOf("class");
    const data: DashboardData = {
      rangeLabel: periodLabel,
      groupLabel: "반별",
      weeks: weeks.map(weekLabel),
      passLine,
      warnLine,
      students: students.length,
      kpi: {
        avg: avg(first.map((g) => g.score)),
        avgPrev: bookIds ? null : avg(prev.map((g) => g.score)),
        pass: rate(first.filter((g) => g.passed).length, first.length),
        passPrev: bookIds ? null : rate(prev.filter((g) => g.passed).length, prev.length),
        graded: first.length,
        retake: openRetakes.length,
        retakeNotIssued: openRetakes.filter((r) => !r.retakeExamId).length,
        missed: overdue.length,
      },
      groups: classGroups.map((g) => ({ key: g.key, label: g.label, avg: g.avg, count: g.rows.length, delta: g.delta, href: qs({ tab: "class", pick: g.key }) })),
      weekRows: [],
      isWeekGroup: false,
      trend: weeklySeries(first, weeks),
      bins: scoreBins(first.map((g) => g.score)),
      donut: { pass: first.filter((g) => g.passed).length, fail: first.filter((g) => !g.passed).length, missed: overdue.length },
      heat: perStudent.slice(0, 30).map((p) => ({ id: p.s.id, name: p.s.name, cells: p.cells })),
      watch: watch.map((p) => ({ id: p.s.id, name: p.s.name, className: p.s.classRoom?.name ?? null, reason: p.fails >= 2 ? `${p.fails}주 연속 미달` : p.overdue >= 2 ? `미응시 ${p.overdue}건` : p.delta !== null && p.delta <= -15 ? `하락 ${-p.delta}점` : "평균 60 미만", avg: p.a, retake: p.retake })),
      recent,
    };
    const layout = normalizeLayout(parseJSON<unknown>(ctx.member.dashboardLayout, null));
    return (
      <div>
        <WidgetBoard data={data} initialLayout={layout} header={header} />
      </div>
    );
  }

  // ── 학생별 ──
  if (view === "students") {
    const picked = sp.pick ? perStudent.find((p) => p.s.id === sp.pick) : null;
    if (picked) {
      const rows = gradesAll.filter((g) => g.studentId === picked.s.id && g.at >= from).reverse();
      return (
        <div>
          {header}
          <div className="sec-h mb-3" data-testid="pick-student-view">
            <h2 className="text-[19px] font-bold tracking-tight">
              {picked.s.name}
              <span className="ml-2 text-[14px] font-medium" style={{ color: "var(--ink-3)" }}>
                {[picked.s.classRoom?.name, picked.s.school, picked.s.grade].filter(Boolean).join(" · ")}
              </span>
            </h2>
            <Link href={`/app/students/${picked.s.id}`} className="sec-link">
              학생 상세 →
            </Link>
          </div>
          <Kpis items={[["평균", picked.a, "", picked.a !== null && picked.a < warnLine, <DeltaNote key="d" d={picked.delta} series={picked.series} />], ["통과율", picked.pass, "%", false], ["응시", picked.n, "", false], ["재시험", picked.retake, "", picked.retake > 0]]} />
          <section className="card card-body mb-4" data-testid="student-trend">
            <div className="sec-h mb-3">
              <h2 className="sec-t">점수 추이</h2>
              <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {periodLabel} · 점선 통과 기준 {passLine}
              </span>
            </div>
            <TrendChart values={picked.series} labels={weeks.map(weekLabel)} passLine={passLine} height={200} lastLabel="이번 주" ariaLabel={`${picked.s.name} 주별 평균`} />
          </section>
          <AttemptTable rows={rows} />
        </div>
      );
    }
    return (
      <div>
        {header}
        <StudentTable rows={perStudent} warnLine={warnLine} title={`학생 ${perStudent.length}명`} />
      </div>
    );
  }

  // ── 학교별 · 학년별 · 반별 ──
  const groups = groupsOf(view);
  const dimLabel = VIEWS.find(([k]) => k === view)![1].replace("별", "");
  const pg = sp.pick ? groups.find((g) => g.key === sp.pick) : null;
  if (pg) {
    return (
      <div>
        {header}
        <div className="sec-h mb-3" data-testid="pick-group-view">
          <h2 className="text-[19px] font-bold tracking-tight">
            {pg.label}
            <span className="ml-2 text-[14px] font-medium" style={{ color: "var(--ink-3)" }}>
              {pg.rows.length}명
            </span>
          </h2>
        </div>
        <Kpis items={[["평균", pg.avg, "", pg.avg !== null && pg.avg < warnLine, <DeltaNote key="d" d={pg.delta} series={pg.series} />], ["통과율", pg.pass, "%", false], ["재시험", pg.retake, "", pg.retake > 0], ["미응시", pg.overdue, "", pg.overdue > 0]]} />
        <section className="card card-body mb-4" data-testid="group-trend">
          <div className="sec-h mb-3">
            <h2 className="sec-t">점수 추이</h2>
            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {periodLabel} · 점선 통과 기준 {passLine}
            </span>
          </div>
          <TrendChart values={pg.series} labels={weeks.map(weekLabel)} passLine={passLine} height={200} lastLabel="이번 주" ariaLabel={`${pg.label} 주별 평균`} />
        </section>
        <StudentTable rows={pg.rows} warnLine={warnLine} title={`학생 ${pg.rows.length}명`} />
      </div>
    );
  }
  return (
    <div>
      {header}
      <div className="card overflow-x-auto" data-testid="group-table">
        <table className="tbl tbl-cards">
          <thead>
            <tr className="[&>th]:whitespace-nowrap">
              <th>{dimLabel}</th>
              <th>학생</th>
              <th>평균</th>
              <th>통과율</th>
              <th>추세</th>
              <th>재시험</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} data-testid="group-row">
                <td data-label="_title">
                  <Link href={qs({ pick: g.key })} className="font-medium hover:underline" scroll={false}>
                    {g.label}
                  </Link>
                </td>
                <td data-label="학생">{g.rows.length}명</td>
                <td className="num-md" data-label="평균" style={{ fontSize: 18, color: g.avg !== null && g.avg < warnLine ? "var(--accent)" : undefined }}>
                  {g.avg ?? "–"}
                </td>
                <td data-label="통과율">{g.pass === null ? "–" : `${g.pass}%`}</td>
                <td className="digital" data-label="추세" style={{ color: g.delta !== null && g.delta < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                  <Trend d={g.delta} />
                </td>
                <td data-label="재시험">{g.retake ? <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{g.retake}</span> : <span className="muted">-</span>}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center" style={{ color: "var(--ink-3)" }}>
                  학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Trend({ d }: { d: number | null }) {
  return <>{d === null ? "··" : d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "="}</>;
}

/** 추세(trendDelta: 최근 k주 평균 − 직전 k주 평균)를 숫자 아래 한 줄로 — 숫자가 주인공, 이 줄은 방향만 */
function DeltaNote({ d, series }: { d: number | null; series: (number | null)[] }) {
  if (d === null) return null;
  const n = series.filter((v) => v !== null).length;
  const k = n >= 6 ? 3 : n >= 4 ? 2 : 1;
  return (
    <span className="kpi-s" title={`최근 ${k}주 평균 − 직전 ${k}주 평균`}>
      <span style={{ color: d < 0 ? "var(--accent)" : "var(--ink-2)", fontWeight: 600 }}>{d > 0 ? `+${d}` : d === 0 ? "±0" : d}</span> 최근 {k}주
    </span>
  );
}

function Kpis({ items }: { items: [string, number | null, string, boolean, React.ReactNode?][] }) {
  return (
    <div className="kpis mb-4" style={{ ["--n" as string]: items.length }} data-testid="pick-kpis">
      {items.map(([l, v, suf, warn, sub]) => (
        <div key={l}>
          <span className="lbl">{l}</span>
          <span className="kpi-v" style={warn ? { color: "var(--accent)" } : undefined}>
            <CountUp value={v} suffix={suf} placeholder="–" />
          </span>
          {sub}
        </div>
      ))}
    </div>
  );
}

type StudentRow = { s: { id: string; name: string; school: string | null; grade: string | null; classRoom: { name: string } | null }; a: number | null; last: number | null; delta: number | null; retake: number };

function StudentTable({ rows, warnLine, title }: { rows: StudentRow[]; warnLine: number; title: string }) {
  return (
    <section className="card">
      <div className="sec-h px-5 pb-1 pt-4">
        <h2 className="sec-t">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl tbl-cards">
          <thead>
            <tr className="[&>th]:whitespace-nowrap">
              <th>이름</th>
              <th>반</th>
              <th>학교 · 학년</th>
              <th>
                <SortHeader target="#students-body" attr="avg">평균</SortHeader>
              </th>
              <th>
                <SortHeader target="#students-body" attr="last">최근</SortHeader>
              </th>
              <th>
                <SortHeader target="#students-body" attr="delta">추세</SortHeader>
              </th>
              <th>
                <SortHeader target="#students-body" attr="retake">재시험</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody id="students-body">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center" style={{ color: "var(--ink-3)" }}>
                  학생이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.s.id} data-avg={p.a ?? ""} data-last={p.last ?? ""} data-delta={p.delta ?? ""} data-retake={p.retake}>
                <td className="whitespace-nowrap" data-label="_title">
                  <span>
                    <Link href={`/app/students/${p.s.id}`} className="font-medium hover:underline">
                      {p.s.name}
                    </Link>
                    <span className="ml-1.5 text-[12px] font-normal sm:hidden" style={{ color: "var(--ink-3)" }}>
                      {p.s.classRoom?.name ?? ""}
                    </span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap sm:table-cell">{p.s.classRoom?.name ?? "-"}</td>
                <td className="whitespace-nowrap" data-label="학교" style={{ color: "var(--ink-2)" }}>
                  {p.s.school ?? ""} {p.s.grade ?? ""}
                </td>
                <td className="num-md" data-label="평균" style={{ fontSize: 18, color: p.a !== null && p.a < warnLine ? "var(--accent)" : undefined }}>
                  {p.a ?? "–"}
                </td>
                <td data-label="최근">{p.last ?? "–"}</td>
                <td className="digital" data-label="추세" style={{ color: p.delta !== null && p.delta < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                  <Trend d={p.delta} />
                </td>
                <td data-label="재시험">{p.retake ? <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{p.retake}</span> : <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttemptTable({ rows }: { rows: { attemptId: string; examTitle: string; score: number; passed: boolean; correct: number; total: number; at: Date; attemptNo: number; isRetake: boolean; mode: string }[] }) {
  return (
    <section className="card" data-testid="pick-attempts">
      <div className="sec-h px-5 pb-1 pt-4">
        <h2 className="sec-t">응시 기록 {rows.length}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl tbl-cards">
          <thead>
            <tr className="[&>th]:whitespace-nowrap">
              <th>시험</th>
              <th>차수</th>
              <th>점수</th>
              <th>결과</th>
              <th>확정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.attemptId}>
                <td data-label="_title">
                  <Link href={`/app/results/${g.attemptId}`} className="font-medium hover:underline">
                    {g.examTitle}
                  </Link>
                </td>
                <td className="text-xs" data-label="차수">
                  {g.mode === "online" ? "온라인" : "종이"} · {g.isRetake ? "재시험" : `${g.attemptNo}차`}
                </td>
                <td data-label="점수">
                  <span className="num-md" style={{ fontSize: 18, color: g.passed ? undefined : "var(--accent)" }}>
                    {Math.round(g.score)}
                  </span>
                  <span className="muted ml-1">
                    ({g.correct}/{g.total})
                  </span>
                </td>
                <td data-label="결과">{g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}</td>
                <td className="text-xs" data-label="확정" style={{ color: "var(--ink-3)" }}>
                  {fmtMDHM(g.at)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center" style={{ color: "var(--ink-3)" }}>
                  확정된 성적이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
