import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { studentGrades } from "@/lib/learn";
import { fmtDate } from "@/lib/util";
import { recentWeeks, weeklySeries, weekLabel, avg } from "@/lib/stats";
import { Sparkline, Columns } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { scoreBins } from "@/lib/stats";

/** 내 성적: 12주 추이 · 평균/통과율 · 분포 · 전체 이력 */
export default async function GradesPage() {
  const { user, student } = await requireStudent();
  const grades = await studentGrades(user.id, student.id);
  const first = grades.filter((g) => !g.isRetake);
  const weeks = recentWeeks(12);
  const series = weeklySeries(first, weeks);
  const recent = first.filter((g) => g.at >= weeks[0]);
  const a = avg(recent.map((g) => g.score));
  const pass = recent.length ? Math.round((recent.filter((g) => g.passed).length / recent.length) * 100) : null;
  const best = first.length ? Math.max(...first.map((g) => g.score)) : null;
  const passLine = first.length ? Math.round(first.reduce((s, g) => s + g.passScore, 0) / first.length) : 90;

  return (
    <div className="learn-grid">
      <div className="col">
      <div className="flex items-end justify-between px-1">
        <h1 className="text-[18px] font-bold tracking-tight">내 성적</h1>
        <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          최근 12주 · 시험 {grades.length}회
        </span>
      </div>

      {/* 숫자 네 개는 한 표면 · 칸막이 (링·카드 여러 장 대신) */}
      <div className="kpis" style={{ ["--n" as string]: 4 }} data-testid="grade-kpis">
        <div>
          <span className="lbl">평균</span>
          <span className="kpi-v">
            <CountUp value={a} />
          </span>
          <span className="kpi-s">첫 응시 {recent.length}회</span>
        </div>
        <div>
          <span className="lbl">통과율</span>
          <span className="kpi-v">{pass === null ? "—" : <CountUp value={pass} suffix="%" />}</span>
          <span className="kpi-s">기준 {passLine}점</span>
        </div>
        <div>
          <span className="lbl">최고점</span>
          <span className="kpi-v">
            <CountUp value={best} />
          </span>
        </div>
        <div>
          <span className="lbl">재시험</span>
          <span className="kpi-v" style={grades.filter((g) => g.isRetake).length ? { color: "var(--accent)" } : undefined}>
            <CountUp value={grades.filter((g) => g.isRetake).length} />
            <small>회</small>
          </span>
        </div>
      </div>

      <div className="card card-body">
        <h2 className="sec-t">점수 추이</h2>
        <div className="mt-3">
          <Sparkline values={series} baseline={passLine} accentBelow={passLine} labels={weeks.map(weekLabel)} height={90} />
        </div>
        <div className="mt-1 flex justify-between text-[12px]" style={{ color: "var(--ink-3)" }}>
          <span>{weekLabel(weeks[0])}</span>
          <span>점선 = 통과 {passLine}</span>
          <span>{weekLabel(weeks[11])}</span>
        </div>
      </div>

      {first.length > 0 && (
        <div className="card card-body">
          <h2 className="sec-t mb-3">점수 분포</h2>
          <Columns bins={scoreBins(first.map((g) => g.score))} accentIndexBelow={3} height={84} />
        </div>
      )}
      </div>

      <div className="col">
      {grades.length > 0 && (
        <Link href="/learn/practice" className="card flex w-full items-center justify-between gap-3 px-4 py-3.5" data-testid="practice-all">
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">틀린 단어 모아 연습</span>
            <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              지금까지 틀린 단어를 무작위로
            </span>
          </span>
          <span className="btn-primary btn-sm shrink-0">연습 시작</span>
        </Link>
      )}

      <section className="card card-body">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="sec-t">시험 기록</h2>
          <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            누르면 틀린 문항과 연습
          </span>
        </div>
        {grades.length === 0 && <p className="muted">공개된 성적이 없습니다.</p>}
        <ul>
          {[...grades].reverse().map((g) => (
            <li key={g.attemptId} className="row">
              <Link href={`/learn/results/${g.attemptId}?from=grades`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{g.title}</div>
                <div className="lbl mt-0.5">
                  {fmtDate(g.at, false).slice(5)} · {g.correct}/{g.total}
                  {g.isRetake ? " · 재시험" : ""}
                </div>
              </Link>
              <span className="flex items-center gap-2">
                <span className="num-md">{g.score}</span>
                <span className={g.passed ? "badge-green" : "badge-red"} data-testid="grade-badge">{g.passed ? "통과" : "미달"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      </div>
    </div>
  );
}
