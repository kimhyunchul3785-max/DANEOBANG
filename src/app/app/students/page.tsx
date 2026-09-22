import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { ActionForm } from "@/components/ActionForm";
import { HBars, Columns, Sparkline, Heatmap, Donut, type HeatCell } from "@/components/Viz";
import { CountUp, SortHeader } from "@/components/Motion";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, scoreBins, consecutiveFails, trendDelta, weekIndex } from "@/lib/stats";
import { createStudentAction, bulkCreateStudentsAction } from "./actions";

type Group = "class" | "school" | "grade" | "teacher" | "week";
const GROUPS: { key: Group; label: string }[] = [
  { key: "class", label: "반별" },
  { key: "school", label: "학교별" },
  { key: "grade", label: "학년별" },
  { key: "teacher", label: "선생님별" },
  { key: "week", label: "주간" },
];
const RANGES = [
  { key: "1", label: "이번 주", weeks: 1 },
  { key: "4", label: "4주", weeks: 4 },
  { key: "12", label: "12주", weeks: 12 },
];

/**
 * 학생 탭 = 그룹 대시보드 → 학생 상세.
 * 반/학교/학년/선생님/주간 기준으로 평균·통과율·분포·추이·응시 히트맵을 한눈에 보고, 그룹 막대나 학생을 누르면 내려간다.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ group?: string; range?: string; teacher?: string; q?: string; pick?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const group = (GROUPS.some((g) => g.key === sp.group) ? sp.group : "class") as Group;
  const rangeDef = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const weeks = recentWeeks(rangeDef.weeks);
  const academyId = ctx.member.academyId;
  const now = new Date();

  const students = await prisma.student.findMany({
    where: { ...studentScope(ctx), status: "active", ...(sp.teacher ? { teachers: { some: { memberId: sp.teacher } } } : {}), ...(sp.q ? { name: { contains: sp.q } } : {}) },
    include: { classRoom: true, user: { select: { id: true } }, teachers: { include: { member: { include: { user: { select: { name: true } } } } } } },
    orderBy: [{ classId: "asc" }, { name: "asc" }],
  });
  const ids = students.map((s) => s.id);
  const [grades, openRetakes, overdue, classes, passScoreAgg] = await Promise.all([
    loadGrades(academyId, { id: { in: ids } }, weeks[0]),
    prisma.retakeTask.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, status: { in: ["pending", "scheduled"] } }, _count: true }),
    prisma.assignment.findMany({ where: { studentId: { in: ids }, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: now, gte: weeks[0] } }, select: { studentId: true } }),
    prisma.classRoom.findMany({ where: { academyId, archived: false }, orderBy: { name: "asc" } }),
    prisma.exam.aggregate({ where: { academyId }, _avg: { passScore: true } }),
  ]);
  const passLine = Math.round(passScoreAgg._avg.passScore ?? 90);
  const warnLine = Math.max(60, passLine - 20); // 평균 막대 경고선
  const first = grades.filter((g) => !g.isRetake);
  const byStudent = new Map<string, typeof first>();
  for (const g of first) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]);
  const retakeCount = new Map(openRetakes.map((r) => [r.studentId, r._count]));
  const overdueCount = new Map<string, number>();
  for (const o of overdue) overdueCount.set(o.studentId, (overdueCount.get(o.studentId) ?? 0) + 1);

  // KPI
  const kpi = {
    avg: avg(first.map((g) => g.score)),
    pass: rate(first.filter((g) => g.passed).length, first.length),
    retake: openRetakes.reduce((s, r) => s + r._count, 0),
    missed: overdue.length,
  };

  // 그룹 집계
  const keyOf = (s: (typeof students)[number]): string[] => {
    if (group === "class") return [s.classRoom?.name ?? "반 없음"];
    if (group === "school") return [s.school?.trim() || "학교 미입력"];
    if (group === "grade") return [s.grade?.trim() || "학년 미입력"];
    if (group === "teacher") return s.teachers.length ? s.teachers.map((t) => t.member.user.name) : ["담당 없음"];
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
  const weekRows = weeks.map((w, i) => ({ key: `w${i}`, label: `${weekLabel(w)} 주`, value: weekSeriesAll[i], sub: `${first.filter((g) => weekIndex(weeks, g.at) === i).length}건` }));

  // 학생별 요약 (히트맵·워치리스트·목록)
  const perStudent = students.map((s) => {
    const gs = byStudent.get(s.id) ?? [];
    const series = weeklySeries(gs, weeks);
    // 히트맵 셀: 그 주 평균 + 가장 낮은 점수의 결과 화면 링크 (빨간 칸을 누르면 그 시험지로)
    const cells: HeatCell[] = weeks.map((_, wi) => {
      const inWeek = gs.filter((g) => weekIndex(weeks, g.at) === wi);
      if (!inWeek.length) return { v: null };
      const lowest = inWeek.reduce((m, g) => (g.score < m.score ? g : m), inWeek[0]);
      return { v: avg(inWeek.map((g) => g.score)), href: `/app/results/${lowest.attemptId}`, title: `${s.name} · ${weekLabel(weeks[wi])}: ${inWeek.map((g) => Math.round(g.score)).join(", ")} · ${lowest.examTitle}` };
    });
    const a = avg(gs.map((g) => g.score));
    const fails = consecutiveFails(series, passLine);
    const missedWeeks = weeks.length > 1 ? series.filter((v) => v === null).length : 0;
    return { s, a, series, cells, fails, missedWeeks, retake: retakeCount.get(s.id) ?? 0, overdue: overdueCount.get(s.id) ?? 0, delta: trendDelta(series), last: gs.length ? Math.round(gs[gs.length - 1].score) : null };
  });
  const watch = perStudent
    .filter((p) => p.fails >= 2 || p.overdue >= 2 || (p.a !== null && p.a < 60) || (p.delta !== null && p.delta <= -15))
    .sort((a, b) => (a.a ?? 101) - (b.a ?? 101))
    .slice(0, 6);
  const heat = perStudent.slice(0, 30);
  const pickGroup = sp.pick ? groupRows.find((g) => g.key === sp.pick) : null;
  const listed = pickGroup ? perStudent.filter((p) => pickGroup.students.includes(p.s.id)) : perStudent;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { group, range: rangeDef.key, teacher: sp.teacher, q: sp.q, pick: sp.pick, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/app/students?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Students · {ctx.isOwner ? "학원 전체" : "담당 학생"}</div>
          <h1 className="h1 mt-1">학생 성적 대시보드</h1>
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

      <div className="bento">
        {/* 그룹 막대 */}
        <section className="card span-4 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">
              Group · {GROUPS.find((g) => g.key === group)!.label} · 최근 {rangeDef.label}
            </div>
            <span className="digital">
              {group === "week" ? `${weeks.length} WEEKS` : `${groupRows.length} GROUPS`} · {students.length} STUDENTS
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div>
              <div className="num-lg">
                <CountUp value={kpi.avg} placeholder="–" />
              </div>
              <div className="lbl mt-1">평균 점수</div>
            </div>
            <div>
              <div className="num-lg">
                <CountUp value={kpi.pass} suffix="%" placeholder="–" />
              </div>
              <div className="lbl mt-1">통과율</div>
            </div>
            <div>
              <div className="num-lg" style={kpi.retake ? { color: "var(--accent)" } : undefined}>
                <CountUp value={kpi.retake} />
              </div>
              <div className="lbl mt-1">재시험 대기</div>
            </div>
            <div>
              <div className="num-lg" style={{ color: kpi.missed ? "var(--ink-2)" : undefined }}>
                <CountUp value={kpi.missed} />
              </div>
              <div className="lbl mt-1">미응시</div>
            </div>
          </div>
          <div className="mt-5">
            {group === "week" ? (
              <HBars rows={weekRows} accentBelow={warnLine} />
            ) : groupRows.length === 0 ? (
              <p className="muted">학생이 없습니다.</p>
            ) : (
              <HBars rows={groupRows.map((g) => ({ key: g.key, label: g.label, value: avg(g.scores), sub: `${g.students.length}명` }))} accentBelow={warnLine} hrefFor={(k) => qs({ pick: k })} />
            )}
          </div>
          <p className="muted mt-3">막대를 누르면 그 그룹의 학생 목록으로, 학생을 누르면 개인 추이로 내려갑니다. 빨간 막대 = 평균 {warnLine} 미만 (통과 기준 {passLine}).</p>
        </section>

        {/* 분포 */}
        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Score distribution</div>
            <span className="digital">N={first.length}</span>
          </div>
          <div className="mt-4">
            <Columns bins={scoreBins(first.map((g) => g.score))} accentIndexBelow={3} />
          </div>
          <div className="mt-4">
            <Donut
              parts={[
                { label: "통과", value: first.filter((g) => g.passed).length, color: "var(--ink)" },
                { label: "미달", value: first.filter((g) => !g.passed).length, color: "var(--accent)" },
                { label: "미응시", value: kpi.missed, color: "rgba(27,26,24,0.25)" },
              ]}
              size={84}
              stroke={12}
            />
          </div>
        </section>

        {/* 주간 추이 */}
        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Weekly trend</div>
            <span className="badge-gray">{weeks.length} WEEKS</span>
          </div>
          <div className="mt-3">
            <Sparkline values={weekSeriesAll} baseline={passLine} labels={weeks.map(weekLabel)} height={80} />
          </div>
          <ul className="mt-2 space-y-1">
            {(group === "week" ? [] : groupRows.slice(0, 4)).map((g) => {
              const d = trendDelta(g.series);
              return (
                <li key={g.key} className="flex items-center justify-between text-[13px]">
                  <span>{g.label}</span>
                  <span className="digital" style={{ color: d !== null && d < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                    {d === null ? "··" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "="}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 히트맵 */}
        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Participation · 학생 × 주</div>
            <span className="badge-gray">{heat.length}</span>
          </div>
          <div className="mt-3">
            {heat.length === 0 ? <p className="muted">학생이 없습니다.</p> : <Heatmap rows={heat.map((p) => ({ key: p.s.id, label: p.s.name, cells: p.cells }))} cols={weeks.map(weekLabel)} hrefFor={(id) => `/app/students/${id}`} />}
          </div>
          <p className="muted mt-2">빈 칸 = 그 주 응시 없음 · 빨강 = 60점 미만 · 칸을 누르면 그 시험 결과로 이동.</p>
        </section>

        {/* 워치리스트 */}
        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">Watch list</div>
            <span className={watch.length ? "badge-red" : "badge-gray"}>{watch.length}</span>
          </div>
          {watch.length === 0 ? (
            <p className="muted mt-3">주의가 필요한 학생이 없습니다.</p>
          ) : (
            <ul className="mt-1">
              {watch.map((p) => (
                <li key={p.s.id} className="row">
                  <div>
                    <Link href={`/app/students/${p.s.id}`} className="card-title hover:underline">
                      {p.s.name}
                    </Link>
                    <span className="muted ml-1">{p.s.classRoom?.name}</span>
                    <div className="muted text-[12px]">
                      {p.fails >= 2 ? `${p.fails}주 연속 미달` : p.overdue >= 2 ? `미응시 ${p.overdue}건` : p.delta !== null && p.delta <= -15 ? `하락 ${-p.delta}점` : "평균 60 미만"}
                      {p.retake ? ` · 재시험 ${p.retake}` : ""}
                    </div>
                  </div>
                  <span className="num-md" style={{ color: "var(--accent)" }}>
                    {p.a ?? "–"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 학생 목록 (그룹 선택 시 그 그룹만) */}
      <section className="card mt-4">
        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="h3">{pickGroup ? `${pickGroup.label} · ${listed.length}명` : `학생 목록 · ${listed.length}명`}</div>
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
              <Link href="/app/classes" className="btn-ghost btn-sm">
                반 관리
              </Link>
            </form>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>이름</th>
                <th>반</th>
                <th>학교 · 학년</th>
                <th>담당</th>
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
                <th>계정</th>
              </tr>
            </thead>
            <tbody id="students-body">
              {listed.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center" style={{ color: "var(--ink-3)" }}>
                    학생이 없습니다. 아래에서 등록하세요.
                  </td>
                </tr>
              )}
              {listed.map((p) => (
                <tr key={p.s.id} data-avg={p.a ?? ""} data-last={p.last ?? ""} data-delta={p.delta ?? ""} data-retake={p.retake}>
                  <td>
                    <Link href={`/app/students/${p.s.id}`} className="font-medium hover:underline">
                      {p.s.name}
                    </Link>
                  </td>
                  <td>{p.s.classRoom?.name ?? "-"}</td>
                  <td style={{ color: "var(--ink-2)" }}>
                    {p.s.school ?? ""} {p.s.grade ?? ""}
                  </td>
                  <td className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {p.s.teachers.map((t) => t.member.user.name).join(", ") || "-"}
                  </td>
                  <td className="num-md" style={{ fontSize: 18, color: p.a !== null && p.a < warnLine ? "var(--accent)" : undefined }}>
                    {p.a ?? "–"}
                  </td>
                  <td>{p.last ?? "–"}</td>
                  <td className="digital" style={{ color: p.delta !== null && p.delta < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                    {p.delta === null ? "··" : p.delta > 0 ? `▲${p.delta}` : p.delta < 0 ? `▼${-p.delta}` : "="}
                  </td>
                  <td>{p.retake ? <span className="badge-red">{p.retake}</span> : <span className="muted">-</span>}</td>
                  <td>{p.s.user ? <span className="badge-green">LINKED</span> : <span className="badge-gray">OFFLINE</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card mt-4">
        <summary className="card-body cursor-pointer">
          <span className="h3">학생 등록</span>
          <span className="muted ml-2">이름 · 학교 · 학년 · 반 — 학교/학년을 넣어야 학교별·학년별 대시보드가 채워집니다.</span>
        </summary>
        <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
          <ActionForm action={createStudentAction} className="space-y-2">
            <div className="lbl">한 명</div>
            <input className="input" name="name" placeholder="이름" required maxLength={30} />
            <div className="flex gap-2">
              <input className="input" name="school" placeholder="학교" />
              <input className="input" name="grade" placeholder="학년 (예: 고1)" />
            </div>
            <select className="input" name="classId" defaultValue="">
              <option value="">반 없음</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn-primary w-full">등록</button>
          </ActionForm>
          <ActionForm action={bulkCreateStudentsAction} className="space-y-2">
            <div className="lbl">여러 명 · 한 줄에 한 명: 이름,학교,학년</div>
            <textarea className="input font-mono text-xs" name="text" rows={5} placeholder={"김민준,한빛고,고1\n이서연,중앙고,고2"} />
            <select className="input" name="classId" defaultValue="">
              <option value="">반 없음</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary w-full">일괄 등록</button>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
