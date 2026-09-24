import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtMDHM } from "@/lib/util";
import { SortHeader } from "@/components/Motion";
import { DuePopover } from "@/components/DuePopover";
import { GradesDashboard, ResultsTabs, VIEWS, type View } from "./Dashboard";
import { DetailFilter } from "./DetailFilter";
import { extendAssignmentDueAction } from "../tests/actions";

/**
 * 성적 = [요약 | 학생별 | 학교별 | 학년별 | 반별] ‹ 항목 칩 › · [단어장 ▾]  (Dashboard)
 * 시험 기록(?examId · ?studentId · ?classId · ?tab=exams)과 미응시(?filter=overdue)는 다른 화면에서 오는 링크로만 연다.
 */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string; examId?: string; classId?: string; studentId?: string; group?: string; teacher?: string; q?: string; pick?: string; view?: string; all?: string; book?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const academyId = ctx.member.academyId;
  const scope = studentScope(ctx);
  const records = sp.tab === "exams" || (!sp.tab && (sp.examId || sp.studentId || sp.classId || sp.filter === "overdue"));
  if (!records) {
    // 예전 링크(?group=school 등)도 받는다
    const legacy = sp.group === "school" || sp.group === "grade" || sp.group === "class" ? sp.group : sp.q ? "students" : null;
    const view: View = VIEWS.some(([k]) => k === sp.tab) ? (sp.tab as View) : (legacy ?? "summary");
    return (
      <div className="mx-auto max-w-6xl" data-width="wide">
        <GradesDashboard ctx={ctx} sp={sp} view={view} />
      </div>
    );
  }
  const tabs = (
    <div className="mt-3">
      <ResultsTabs view={null} />
    </div>
  );
  const exams = await prisma.exam.findMany({ where: { academyId, status: { not: "draft" } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });
  const classes = await prisma.classRoom.findMany({ where: { academyId }, orderBy: { name: "asc" } });

  if (sp.filter === "overdue") {
    const overdue = await prisma.assignment.findMany({ where: { exam: { academyId, status: { not: "archived" } }, student: scope, status: { in: ["assigned", "in_progress"] }, dueAt: { lt: new Date() } }, include: { student: true, exam: true }, orderBy: { dueAt: "asc" } });
    return (
      <div className="mx-auto max-w-6xl" data-width="wide">
        <div className="kicker">성적</div>
        <h1 className="h1 mt-1">미응시 · 기한 경과</h1>
        {tabs}
        <div className="card mt-4">
          <table className="tbl tbl-cards">
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
                  <td data-label="_title">
                    <Link href={`/app/students?q=${encodeURIComponent(a.student.name)}`} className="font-medium hover:underline" title="→ 학생 탭">
                      {a.student.name}
                    </Link>
                  </td>
                  <td data-label="시험">
                    <Link href={`/app/tests/${a.exam.id}`} className="hover:underline">
                      {a.exam.title}
                    </Link>
                  </td>
                  <td className="text-xs" data-label="기한">{fmtMDHM(a.dueAt)}</td>
                  <td data-label="상태">
                    <DuePopover action={extendAssignmentDueAction} fields={{ assignmentId: a.id }} current={a.dueAt} question="마감기한을 늘릴까요?" submitLabel="늘리기" className="badge-red due-miss" testId="overdue-extend" align="right">
                      미응시
                    </DuePopover>
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
      attempt: { status: "graded", assignment: { exam: { academyId, ...(sp.examId ? { id: sp.examId } : {}) }, student: { ...scope, ...(sp.classId ? { classId: sp.classId } : {}), ...(sp.studentId ? { id: sp.studentId } : {}) } } },
    },
    include: { attempt: { include: { assignment: { include: { student: { include: { classRoom: true } }, exam: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  // 첫 응시 = 재시험이 아닌 시험의 1차 응시. 재시험 = 재시험 시험(isRetake) 또는 2차 이상 응시
  const initial = grades.filter((g) => g.attempt.attemptNo === 1 && !g.attempt.assignment.exam.isRetake);
  const retakes = grades.filter((g) => g.attempt.attemptNo > 1 || g.attempt.assignment.exam.isRetake);
  const avg = initial.length ? Math.round(initial.reduce((s, g) => s + g.score, 0) / initial.length) : null;
  const passRate = initial.length ? Math.round((initial.filter((g) => g.passed).length / initial.length) * 100) : null;
  const shownGrades = sp.all ? grades : grades.slice(0, 30);
  const retakePass = retakes.length ? Math.round((retakes.filter((g) => g.passed).length / retakes.length) * 100) : null;
  const filteredStudent = sp.studentId ? await prisma.student.findFirst({ where: { id: sp.studentId, ...scope }, select: { name: true } }) : null;
  // 시험별 = 기본은 시험 한 줄씩 요약. 시험을 누르거나 학생·반 필터가 있으면 그 응시 기록(학생 × 시험)
  const byExamView = !sp.examId && !sp.studentId && !sp.classId && sp.view !== "attempts";
  const examRows = byExamView
    ? await (async () => {
        const map = new Map<string, { id: string; title: string; isRetake: boolean; n: number; sum: number; passed: number; firstN: number; firstPassed: number; last: Date }>();
        for (const g of grades) {
          const e = g.attempt.assignment.exam;
          const r = map.get(e.id) ?? { id: e.id, title: e.title, isRetake: e.isRetake, n: 0, sum: 0, passed: 0, firstN: 0, firstPassed: 0, last: g.createdAt };
          r.n++;
          r.sum += g.score;
          if (g.passed) r.passed++;
          if (g.attempt.attemptNo === 1 && !e.isRetake) {
            r.firstN++;
            if (g.passed) r.firstPassed++;
          }
          if (g.createdAt > r.last) r.last = g.createdAt;
          map.set(e.id, r);
        }
        const ids = [...map.keys()];
        const asg = ids.length ? await prisma.assignment.groupBy({ by: ["examId", "status"], where: { examId: { in: ids }, student: scope }, _count: { _all: true } }) : [];
        return [...map.values()]
          .sort((a, b) => b.last.getTime() - a.last.getTime())
          .map((r) => {
            const mine = asg.filter((x) => x.examId === r.id);
            const total = mine.reduce((n, x) => n + x._count._all, 0);
            const open = mine.filter((x) => x.status === "assigned" || x.status === "in_progress").reduce((n, x) => n + x._count._all, 0);
            return { ...r, avg: Math.round(r.sum / r.n), passRate: Math.round((r.passed / r.n) * 100), total, open };
          });
      })()
    : [];

  return (
    <div className="mx-auto max-w-6xl" data-width="wide">
      <header className="mb-4">
        <div className="kicker">성적 · {ctx.isOwner ? "학원 전체" : "담당 학생"}</div>
        <h1 className="h1 mt-1">성적</h1>
        {tabs}
      </header>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">확정 성적 · 전체 기간 · 최근 {grades.length}건 기준</div>
          <div className="h3">{byExamView ? "시험별 요약" : sp.examId ? `${exams.find((e) => e.id === sp.examId)?.title ?? "시험"} · 학생별 결과` : "응시 기록"}</div>
        </div>
        {byExamView ? (
          <Link href="/app/results?tab=exams&view=attempts" className="btn-ghost btn-sm" data-testid="attempts-link">
            응시 기록 전체 (학생 × 시험) →
          </Link>
        ) : (
          <Link href="/app/results?tab=exams" className="btn-ghost btn-sm">
            ← 시험별 요약
          </Link>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DetailFilter exams={exams} classes={classes.map((c) => ({ id: c.id, name: c.name }))} examId={sp.examId} classId={sp.classId} studentId={sp.studentId} studentName={filteredStudent?.name} />
        <Link href="/app/results?tab=exams&filter=overdue" className="btn-ghost mb-3">
          미응시·기한 경과
        </Link>
      </div>
      {byExamView ? (
        <div className="card overflow-x-auto" data-testid="exam-summary">
          <table className="tbl tbl-cards">
            <thead>
              <tr className="[&>th]:whitespace-nowrap">
                <th>시험</th>
                <th>응시</th>
                <th>평균</th>
                <th>통과율</th>
                <th>안 친 학생</th>
                <th>최근 확정</th>
              </tr>
            </thead>
            <tbody>
              {examRows.map((r) => (
                <tr key={r.id} data-testid="exam-summary-row">
                  <td data-label="_title">
                    <Link href={`/app/results?tab=exams&examId=${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    {r.isRetake && <span className="badge-gray ml-1.5">재시험</span>}
                  </td>
                  <td data-label="응시">
                    {r.n}
                    {r.total ? <span className="muted"> / {r.total}명</span> : null}
                  </td>
                  <td className="num-md" data-label="평균" style={{ fontSize: 18 }}>
                    {r.avg}
                  </td>
                  <td data-label="통과율" style={{ color: r.passRate < 60 ? "var(--accent)" : undefined }}>
                    {r.passRate}%
                  </td>
                  <td data-label="안 친 학생">{r.open ? <span className="badge-red">{r.open}명</span> : <span className="muted">-</span>}</td>
                  <td className="text-xs" data-label="최근 확정" style={{ color: "var(--ink-3)" }}>
                    {fmtMDHM(r.last)}
                  </td>
                </tr>
              ))}
              {examRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center" style={{ color: "var(--ink-3)" }}>
                    확정된 성적이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <>
      {/* 위 위젯과 겹치는 KPI 카드 대신 한 줄 요약 (필터 결과 기준) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[13px]" style={{ color: "var(--ink-2)" }} data-testid="detail-summary">
        <span>
          확정 <b className="font-semibold">{grades.length}</b>건
        </span>
        <span>
          첫 응시 평균 <b className="font-semibold">{avg ?? "–"}</b>
        </span>
        <span>
          첫 응시 통과율 <b className="font-semibold">{passRate ?? "–"}%</b>
        </span>
        <span>
          재시험 통과율 <b className="font-semibold">{retakePass ?? "–"}%</b>
        </span>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl tbl-cards">
          <thead>
            <tr className="[&>th]:whitespace-nowrap">
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
            {shownGrades.map((g) => (
              <tr key={g.id} data-score={Math.round(g.score)} data-at={g.createdAt.getTime()}>
                <td data-label="_title">
                  <span>
                    <Link href={`/app/students?q=${encodeURIComponent(g.attempt.assignment.student.name)}`} className="hover:underline" title="→ 학생 탭">
                      {g.attempt.assignment.student.name}
                    </Link>
                    <span className="ml-1.5 text-[12px] font-normal sm:hidden" style={{ color: "var(--ink-3)" }}>{g.attempt.assignment.student.classRoom?.name ?? ""}</span>
                  </span>
                </td>
                <td className="hidden text-xs sm:table-cell">{g.attempt.assignment.student.classRoom?.name ?? "-"}</td>
                <td data-label="시험">
                  <Link href={`/app/tests?q=${encodeURIComponent(g.attempt.assignment.exam.title)}`} className="hover:underline" title="→ 시험 탭">
                    {g.attempt.assignment.exam.title}
                  </Link>
                </td>
                <td className="text-xs" data-label="방식">
                  {g.attempt.mode === "online" ? "온라인" : "종이"} · {g.attempt.assignment.exam.isRetake ? "재시험" : `${g.attempt.attemptNo}차`}
                </td>
                <td data-label="점수">
                  <Link href={`/app/results/${g.attemptId}`} className="hover:underline" title="응시 결과 · 오답 · 재채점" data-testid="result-open">
                    <span className="num-md" style={{ fontSize: 18, color: g.passed ? undefined : "var(--accent)" }}>
                      {Math.round(g.score)}
                    </span>
                    <span className="muted ml-1">
                      ({g.correctCount}/{g.totalCount}){g.revisionNo > 1 && <span className="ml-1 text-[10px]">r{g.revisionNo}</span>}
                    </span>
                  </Link>
                </td>
                <td data-label="결과">{g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}</td>
                <td className="text-xs text-slate-500" data-label="확정">{fmtMDHM(g.createdAt)}</td>
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
        {shownGrades.length < grades.length && (
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--line)" }}>
            <Link href={`/app/results?${new URLSearchParams({ tab: "exams", ...(sp.examId ? { examId: sp.examId } : {}), ...(sp.classId ? { classId: sp.classId } : {}), ...(sp.studentId ? { studentId: sp.studentId } : {}), ...(sp.view ? { view: sp.view } : {}), all: "1" }).toString()}#detail`} className="btn-ghost btn-sm" scroll={false}>
              {grades.length - shownGrades.length}건 더 보기
            </Link>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
