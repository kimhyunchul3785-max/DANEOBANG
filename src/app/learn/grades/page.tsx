import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { studentGrades } from "@/lib/learn";
import { fmtDate } from "@/lib/util";
import { recentWeeks, weeklySeries, weekLabel, avg } from "@/lib/stats";
import { Ring, Sparkline, Columns } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { scoreBins } from "@/lib/stats";

/** 내 성적: 12주 추이 · 평균/통과율 · 분포 · 전체 이력 */
export default async function GradesPage() {
  const user = await requireUser();
  const grades = await studentGrades(user.id);
  const first = grades.filter((g) => !g.isRetake);
  const weeks = recentWeeks(12);
  const series = weeklySeries(first, weeks);
  const recent = first.filter((g) => g.at >= weeks[0]);
  const a = avg(recent.map((g) => g.score));
  const pass = recent.length ? Math.round((recent.filter((g) => g.passed).length / recent.length) * 100) : null;
  const best = first.length ? Math.max(...first.map((g) => g.score)) : null;
  const passLine = first.length ? Math.round(first.reduce((s, g) => s + g.passScore, 0) / first.length) : 90;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="lbl">Grades</div>
          <div className="mt-1 text-[15px] font-semibold">내 성적 · 최근 12주</div>
        </div>
        <span className="digital">{String(grades.length).padStart(2, "0")} TESTS</span>
      </div>

      <div className="card card-body">
        <div className="flex items-end justify-between">
          <div>
            <div className="num-xl" style={{ fontSize: 64 }}>
              <CountUp value={a} />
            </div>
            <div className="lbl mt-1">평균 · 첫 응시 {recent.length}회</div>
          </div>
          <Ring value={pass ?? 0} size={84} stroke={6}>
            <span className="digital">
              <CountUp value={pass} suffix="%" />
            </span>
          </Ring>
        </div>
        <div className="mt-4">
          <Sparkline values={series} baseline={passLine} accentBelow={passLine} labels={weeks.map(weekLabel)} height={90} />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="lbl" style={{ fontSize: 9 }}>
            {weekLabel(weeks[0])}
          </span>
          <span className="lbl" style={{ fontSize: 9 }}>
            점선 = 통과 {passLine}
          </span>
          <span className="lbl" style={{ fontSize: 9 }}>
            {weekLabel(weeks[11])}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-sm card-body">
          <div className="lbl">Best</div>
          <div className="num-lg mt-2">
            <CountUp value={best} />
          </div>
        </div>
        <div className="card-sm card-body">
          <div className="lbl">Retakes</div>
          <div className="num-lg mt-2" style={grades.some((g) => g.isRetake) ? { color: "var(--accent)" } : undefined}>
            <CountUp value={grades.filter((g) => g.isRetake).length} />
          </div>
        </div>
      </div>

      {first.length > 0 && (
        <div className="card card-body">
          <div className="lbl mb-3">Distribution · 점수 분포</div>
          <Columns bins={scoreBins(first.map((g) => g.score))} accentIndexBelow={3} height={84} />
        </div>
      )}

      {grades.length > 0 && (
        <Link href="/learn/practice" className="card-dark flex w-full items-center justify-between gap-3 rounded-full px-5 py-3" data-testid="practice-all">
          <span className="flex items-center gap-3">
            <span className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
              Practice
            </span>
            <span className="text-[13px] font-semibold">틀린 단어 모아 연습</span>
          </span>
          <span className="digital">RANDOM →</span>
        </Link>
      )}

      <section className="card card-body">
        <div className="mb-1 flex items-center justify-between">
          <div className="lbl">History · 시험지를 누르면 틀린 문항과 연습</div>
          <span className="digital">{grades.length}</span>
        </div>
        {grades.length === 0 && <p className="muted">공개된 성적이 없습니다.</p>}
        <ul>
          {[...grades].reverse().map((g) => (
            <li key={g.attemptId} className="row">
              <Link href={`/learn/results/${g.attemptId}`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{g.title}</div>
                <div className="lbl mt-0.5">
                  {fmtDate(g.at, false).slice(5)} · {g.correct}/{g.total}
                  {g.isRetake ? " · RETAKE" : ""}
                </div>
              </Link>
              <span className="flex items-center gap-2">
                <span className="num-md">{g.score}</span>
                <span className={g.passed ? "badge-green" : "badge-red"}>{g.passed ? "PASS" : "RETAKE"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
