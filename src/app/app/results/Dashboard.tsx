import Link from "next/link";
import { prisma } from "@/lib/db";
import type { AcademyContext } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import type { HeatCell } from "@/components/Viz";
import { SortHeader } from "@/components/Motion";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, scoreBins, consecutiveFails, trendDelta, weekIndex } from "@/lib/stats";
import { fmtMD, parseJSON } from "@/lib/util";
import { WidgetBoard, type DashboardData } from "./WidgetBoard";
import { normalizeLayout } from "./widgets";

type Group = "class" | "school" | "grade" | "week";
const GROUPS: { key: Group; label: string }[] = [
  { key: "class", label: "반별" },
  { key: "school", label: "학교별" },
  { key: "grade", label: "학년별" },
  { key: "week", label: "주간" },
];
const RANGES = [
  { key: "1", label: "이번 주", weeks: 1 },
  { key: "4", label: "4주", weeks: 4 },
  { key: "12", label: "12주", weeks: 12 },
];

export type DashboardParams = { group?: string; range?: string; teacher?: string; q?: string; pick?: string };

/**
 * 성적 탭 = 위젯 대시보드(옮기고·키우고·빼고·넣기) → 학생별 요약 → 학생 상세.
 * 반/학교/학년/주간 기준 + 기간(이번 주/4주/12주). 지난 기간과 비교값을 같이 보여 준다.
 */
export async function GradesDashboard({ ctx, sp }: { ctx: AcademyContext; sp: DashboardParams }) {
  const group = (GROUPS.some((g) => g.key === sp.group) ? sp.group : "class") as Group;
  const rangeDef = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const weeks = recentWeeks(rangeDef.weeks);
  const prevStart = new Date(weeks[0].getTime() - rangeDef.weeks * 7 * 86400e3);
  const academyId = ctx.member.academyId;
  const now = new Date();

  const students = await prisma.student.findMany({
    where: { ...studentScope(ctx), status: "active", ...(sp.teacher ? { teachers: { some: { memberId: sp.teacher } } } : {}), ...(sp.q ? { name: { contains: sp.q } } : {}) },
    include: { classRoom: true },
    orderBy: [{ classId: "asc" }, { name: "asc" }],
  });
  const ids = students.map((s) => s.id);
  const [gradesAll, openRetakes, overdue, passScoreAgg] = await Promise.all([
    loadGrades(academyId, { id: { in: ids } }, prevStart),
    prisma.retakeTask.findMany({ where: { studentId: { in: ids }, status: { in: ["pending", "issued"] } }, select: { studentId: true, retakeExamId: true } }),
    prisma.assignment.findMany({ where: { studentId: { in: ids }, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: now, gte: weeks[0] } }, select: { studentId: true } }),
    prisma.exam.aggregate({ where: { academyId }, _avg: { passScore: true } }),
  ]);
  const passLine = Math.round(passScoreAgg._avg.passScore ?? 90);
  const warnLine = Math.max(60, passLine - 20);
  const firstAll = gradesAll.filter((g) => !g.isRetake && g.attemptNo === 1);
  const first = firstAll.filter((g) => g.at >= weeks[0]);
  const prev = firstAll.filter((g) => g.at < weeks[0]);
  const byStudent = new Map<string, typeof first>();
  for (const g of first) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]);
  const retakeCount = new Map<string, number>();
  for (const r of openRetakes) retakeCount.set(r.studentId, (retakeCount.get(r.studentId) ?? 0) + 1);
  const overdueCount = new Map<string, number>();
  for (const o of overdue) overdueCount.set(o.studentId, (overdueCount.get(o.studentId) ?? 0) + 1);

  const kpi: DashboardData["kpi"] = {
    avg: avg(first.map((g) => g.score)),
    avgPrev: avg(prev.map((g) => g.score)),
    pass: rate(first.filter((g) => g.passed).length, first.length),
    passPrev: rate(prev.filter((g) => g.passed).length, prev.length),
    graded: first.length,
    retake: openRetakes.length,
    retakeNotIssued: openRetakes.filter((r) => !r.retakeExamId).length,
    missed: overdue.length,
  };

  // 그룹 집계
  const keyOf = (s: (typeof students)[number]): string[] => {
    if (group === "class") return [s.classRoom?.name ?? "반 없음"];
    if (group === "school") return [s.school?.trim() || "학교 미입력"];
    if (group === "grade") return [s.grade?.trim() || "학년 미입력"];
    return [];
  };
  type G = { key: string; label: string; students: string[]; scores: number[]; passed: number; series: (number | null)[] };
  const groups = new Map<string, G>();
  if (group !== "week") {
    for (const s of students) {
      for (const k of keyOf(s)) {
        const g = groups.get(k) ?? { key: k, label: k, students: [], scores: [], passed: 0, series: [] };
        g.students.push(s.id);
        const gs = byStudent.get(s.id) ?? [];
        g.scores.push(...gs.map((x) => x.score));
        g.passed += gs.filter((x) => x.passed).length;
        groups.set(k, g);
      }
    }
    for (const g of groups.values()) g.series = weeklySeries(first.filter((x) => g.students.includes(x.studentId)), weeks);
  }
  const groupRows = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const weekSeriesAll = weeklySeries(first, weeks);
  const weekRows = weeks.map((w, i) => ({ label: weekLabel(w), value: weekSeriesAll[i], count: first.filter((g) => weekIndex(weeks, g.at) === i).length }));

  // 학생별 요약
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
    return { s, a, series, cells, fails, retake: retakeCount.get(s.id) ?? 0, overdue: overdueCount.get(s.id) ?? 0, delta: trendDelta(series), last: gs.length ? Math.round(gs[gs.length - 1].score) : null };
  });
  const watch = perStudent
    .filter((p) => p.fails >= 2 || p.overdue >= 2 || (p.a !== null && p.a < 60) || (p.delta !== null && p.delta <= -15))
    .sort((a, b) => (a.a ?? 101) - (b.a ?? 101))
    .slice(0, 8);
  const pickGroup = sp.pick ? groupRows.find((g) => g.key === sp.pick) : null;
  const listed = pickGroup ? perStudent.filter((p) => pickGroup.students.includes(p.s.id)) : perStudent;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { group, range: rangeDef.key, teacher: sp.teacher, q: sp.q, pick: sp.pick, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/app/results?${p.toString()}`;
  };

  // 최근 시험 (기간 안에 채점된 시험별)
  const byExam = new Map<string, { title: string; scores: number[]; passed: number; at: Date; isRetake: boolean }>();
  for (const g of gradesAll.filter((g) => g.at >= weeks[0])) {
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

  const data: DashboardData = {
    rangeLabel: rangeDef.label,
    groupLabel: GROUPS.find((g) => g.key === group)!.label,
    weeks: weeks.map(weekLabel),
    passLine,
    warnLine,
    students: students.length,
    kpi,
    groups: groupRows.map((g) => ({ key: g.key, label: g.label, avg: avg(g.scores), count: g.students.length, delta: trendDelta(g.series), href: qs({ pick: g.key }) })),
    weekRows,
    isWeekGroup: group === "week",
    trend: weekSeriesAll,
    bins: scoreBins(first.map((g) => g.score)),
    donut: { pass: first.filter((g) => g.passed).length, fail: first.filter((g) => !g.passed).length, missed: kpi.missed },
    heat: perStudent.slice(0, 30).map((p) => ({ id: p.s.id, name: p.s.name, cells: p.cells })),
    watch: watch.map((p) => ({ id: p.s.id, name: p.s.name, className: p.s.classRoom?.name ?? null, reason: p.fails >= 2 ? `${p.fails}주 연속 미달` : p.overdue >= 2 ? `미응시 ${p.overdue}건` : p.delta !== null && p.delta <= -15 ? `하락 ${-p.delta}점` : "평균 60 미만", avg: p.a, retake: p.retake })),
    recent,
  };
  const layout = normalizeLayout(parseJSON<unknown>(ctx.member.dashboardLayout, null));

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Results · {ctx.isOwner ? "학원 전체" : "담당 학생"}</div>
          <h1 className="h1 mt-1">성적</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="tablist" aria-label="그룹 기준">
            {GROUPS.map((g) => (
              <Link key={g.key} href={qs({ group: g.key, pick: undefined })} className={`seg-item${group === g.key ? " on" : ""}`} role="tab" aria-selected={group === g.key}>
                {g.label}
              </Link>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="기간">
            {RANGES.map((r) => (
              <Link key={r.key} href={qs({ range: r.key })} className={`seg-item${rangeDef.key === r.key ? " on" : ""}`} role="tab" aria-selected={rangeDef.key === r.key}>
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <WidgetBoard data={data} initialLayout={layout} />

      {/* 학생 목록 (그룹 선택 시 그 그룹만) */}
      <section className="card mt-4">
        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="h3">{pickGroup ? `${pickGroup.label} · ${listed.length}명` : `학생별 요약 · ${listed.length}명`}</div>
              {pickGroup && (
                <Link href={qs({ pick: undefined })} className="muted hover:underline">
                  ← 전체 보기
                </Link>
              )}
            </div>
            <form className="flex gap-2" method="get">
              {Object.entries({ group, range: rangeDef.key, teacher: sp.teacher, pick: sp.pick }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
              <input className="input" name="q" placeholder="이름 검색" defaultValue={sp.q ?? ""} style={{ padding: "7px 12px", width: 160 }} />
              <button className="btn-secondary btn-sm">검색</button>
              <Link href="/app/students" className="btn-ghost btn-sm">
                명단 관리
              </Link>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
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
                {listed.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center" style={{ color: "var(--ink-3)" }}>
                      학생이 없습니다. 학생 탭에서 등록하세요.
                    </td>
                  </tr>
                )}
                {listed.map((p) => (
                  <tr key={p.s.id} data-avg={p.a ?? ""} data-last={p.last ?? ""} data-delta={p.delta ?? ""} data-retake={p.retake}>
                    <td className="whitespace-nowrap">
                      <Link href={`/app/students/${p.s.id}`} className="font-medium hover:underline">
                        {p.s.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{p.s.classRoom?.name ?? "-"}</td>
                    <td className="whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                      {p.s.school ?? ""} {p.s.grade ?? ""}
                    </td>
                    <td className="num-md" style={{ fontSize: 18, color: p.a !== null && p.a < warnLine ? "var(--accent)" : undefined }}>
                      {p.a ?? "–"}
                    </td>
                    <td>{p.last ?? "–"}</td>
                    <td className="digital" style={{ color: p.delta !== null && p.delta < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                      {p.delta === null ? "··" : p.delta > 0 ? `▲${p.delta}` : p.delta < 0 ? `▼${-p.delta}` : "="}
                    </td>
                    <td>{p.retake ? <span className="badge-red">{p.retake}</span> : <span className="muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
