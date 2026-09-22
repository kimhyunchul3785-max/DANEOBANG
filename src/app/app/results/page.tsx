import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate } from "@/lib/util";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp, SortHeader } from "@/components/Motion";
import { GradesDashboard } from "./Dashboard";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ filter?: string; examId?: string; classId?: string; group?: string; range?: string; teacher?: string; q?: string; pick?: string; view?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const academyId = ctx.member.academyId;
  const scope = studentScope(ctx);
  const exams = await prisma.exam.findMany({ where: { academyId, status: { not: "draft" } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });
  const classes = await prisma.classRoom.findMany({ where: { academyId }, orderBy: { name: "asc" } });

  if (sp.filter === "overdue") {
    const overdue = await prisma.assignment.findMany({ where: { exam: { academyId }, student: scope, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: new Date() } }, include: { student: true, exam: true }, orderBy: { dueAt: "asc" } });
    return (
      <div>
        <h1 className="h1 mb-4">미응시 · 기한 경과</h1>
        <p className="muted mb-3">기한이 지났지만 시작하지 않은 배정입니다. 0점 평균에 포함하지 않습니다. <b>MISSED</b>를 누르면 시험을 열어 마감기한을 바꿀 수 있고, 학생 이름을 누르면 이행률·성적 추이가 보입니다.</p>
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>학생</th>
                <th>시험</th>
                <th>기한</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((a) => (
                <tr key={a.id} data-testid="overdue-row">
                  <td>
                    <Link href={`/app/students/${a.studentId}`} className="font-medium hover:underline">
                      {a.student.name}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/app/tests/${a.examId}?step=3`} className="hover:underline">
                      {a.exam.title}
                    </Link>
                  </td>
                  <td className="text-xs">{fmtDate(a.dueAt)}</td>
                  <td>
                    <Link href={`/app/tests/${a.examId}?step=3#due`} title="시험을 열어 마감기한 수정">
                      <StatusBadge s="expired" />
                    </Link>
                  </td>
                </tr>
              ))}
              {overdue.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400">
                    없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const grades = await prisma.gradeRevision.findMany({
    where: {
      current: true,
      attempt: { status: "graded", assignment: { exam: { academyId, ...(sp.examId ? { id: sp.examId } : {}) }, student: { ...scope, ...(sp.classId ? { classId: sp.classId } : {}) } } },
    },
    include: { attempt: { include: { assignment: { include: { student: { include: { classRoom: true } }, exam: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const initial = grades.filter((g) => g.attempt.attemptNo === 1);
  const retakes = grades.filter((g) => g.attempt.attemptNo > 1 || g.attempt.assignment.exam.isRetake);
  const avg = initial.length ? Math.round(initial.reduce((s, g) => s + g.score, 0) / initial.length) : null;
  const passRate = initial.length ? Math.round((initial.filter((g) => g.passed).length / initial.length) * 100) : null;
  const retakePass = retakes.length ? Math.round((retakes.filter((g) => g.passed).length / retakes.length) * 100) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <GradesDashboard ctx={ctx} sp={sp} />

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Detail · 확정 성적</div>
          <div className="h3">시험별 상세 성적</div>
        </div>
      </div>
      <form className="mb-3 flex flex-wrap gap-2" method="get" id="detail">
        <select className="input w-64" name="examId" defaultValue={sp.examId ?? ""}>
          <option value="">모든 시험</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <select className="input w-40" name="classId" defaultValue={sp.classId ?? ""}>
          <option value="">현재 모든 반</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">조회</button>
        <Link href="/app/results?filter=overdue" className="btn-ghost">
          미응시·기한 경과
        </Link>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-sm card-body">
          <div className="lbl">First attempt</div>
          <div className="num-lg mt-2">
            <CountUp value={avg} placeholder="–" />
          </div>
          <div className="muted mt-1">최초 시험 평균</div>
        </div>
        <div className="card-sm card-body">
          <div className="lbl">Pass rate</div>
          <div className="num-lg mt-2">
            <CountUp value={passRate} suffix="%" placeholder="–" />
          </div>
          <div className="muted mt-1">최초 통과율</div>
        </div>
        <div className="card-sm card-body">
          <div className="lbl">Retake pass</div>
          <div className="num-lg mt-2">
            <CountUp value={retakePass} suffix="%" placeholder="–" />
          </div>
          <div className="muted mt-1">재시험 통과율</div>
        </div>
        <div className="card-sm card-body">
          <div className="lbl">Graded</div>
          <div className="num-lg mt-2">
            <CountUp value={grades.length} />
          </div>
          <div className="muted mt-1">확정 응시</div>
        </div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>학생</th>
              <th>반(현재)</th>
              <th>시험</th>
              <th>방식·차수</th>
              <th>
                <SortHeader target="#results-body" attr="score">점수</SortHeader>
              </th>
              <th>결과</th>
              <th>
                <SortHeader target="#results-body" attr="at" defaultDir="desc">확정</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody id="results-body">
            {grades.map((g) => (
              <tr key={g.id} data-score={Math.round(g.score)} data-at={g.createdAt.getTime()}>
                <td>
                  <Link href={`/app/students/${g.attempt.assignment.studentId}`} className="hover:underline">
                    {g.attempt.assignment.student.name}
                  </Link>
                </td>
                <td className="text-xs">{g.attempt.assignment.student.classRoom?.name ?? "-"}</td>
                <td>
                  <Link href={`/app/results/${g.attemptId}`} className="text-blue-700 hover:underline">
                    {g.attempt.assignment.exam.title}
                  </Link>
                </td>
                <td className="text-xs">
                  {g.attempt.mode === "online" ? "온라인" : "종이"} · {g.attempt.assignment.exam.isRetake ? "재시험" : `${g.attempt.attemptNo}차`}
                </td>
                <td>
                  <span className="num-md" style={{ fontSize: 18, color: g.passed ? undefined : "var(--accent)" }}>
                    {Math.round(g.score)}
                  </span>
                  <span className="muted ml-1">
                    ({g.correctCount}/{g.totalCount}){g.revisionNo > 1 && <span className="ml-1 text-[10px]">r{g.revisionNo}</span>}
                  </span>
                </td>
                <td>{g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}</td>
                <td className="text-xs text-slate-500">{fmtDate(g.createdAt)}</td>
              </tr>
            ))}
            {grades.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400">
                  확정된 성적이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
