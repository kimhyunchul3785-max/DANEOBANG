import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { regradeAttemptAction, voidAttemptAction } from "../../tests/actions";

export default async function ResultDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const ctx = await requireAcademy();
  const { attemptId } = await params;
  const t = await prisma.attempt.findFirst({
    where: { id: attemptId, assignment: { exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } },
    include: {
      grades: { orderBy: { revisionNo: "desc" } },
      answers: true,
      assignment: { include: { student: true, exam: true, form: { include: { items: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } } } } },
      retakeSource: true,
    },
  });
  if (!t) notFound();
  const current = t.grades.find((g) => g.current);
  const results = current ? parseJSON<{ itemId: string; optionId: string | null; correct: boolean }[]>(current.itemResults, []) : [];
  return (
    <div>
      <div className="mb-4">
        <Link href="/app/results" className="text-xs text-slate-500 hover:underline">
          ← 성적
        </Link>
        <h1 className="h1">
          {t.assignment.student.name} · {t.assignment.exam.title}
        </h1>
        <p className="muted">
          {t.mode === "online" ? "온라인" : "종이"} · {t.attemptNo}차 · 상태 {t.status} · 제출 {fmtDate(t.submittedAt)}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card card-body">
            <div className="text-xs text-slate-500">현재 유효 점수</div>
            {current ? (
              <>
                <div className="text-3xl font-bold">{Math.round(current.score)}점</div>
                <div className="text-sm">
                  {current.correctCount}/{current.totalCount} 정답 · {current.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달 (기준 {t.assignment.exam.passScore}점)</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  rev {current.revisionNo} · {current.reason}
                </div>
              </>
            ) : (
              <div className="muted">채점 전 (또는 무효)</div>
            )}
            {t.retakeSource[0] && <div className="mt-2 text-xs">재시험 task: {t.retakeSource[0].status}</div>}
          </div>
          {current && (
            <div className="card card-body space-y-2">
              <a className="btn-secondary w-full" href={`/api/files/wrong-note/${t.id}?scope=attempt`} target="_blank">
                오답노트 PDF (정답 표시)
              </a>
              <a className="btn-secondary w-full" href={`/api/files/wrong-note/${t.id}?scope=cumulative`} target="_blank">
                누적 미해결 오답노트 PDF
              </a>
            </div>
          )}
          <div className="card card-body">
            <h2 className="h2 mb-2">채점 정정</h2>
            <p className="muted mb-2">현재 답안·정답 키로 다시 채점합니다 (사유 필수, 이전 revision 보존). 특정 문항 정답을 바꾸려면 시험의 문항 미리보기에서 &lsquo;정답 정정&rsquo;을 사용하세요.</p>
            <ActionForm action={regradeAttemptAction} className="space-y-2">
              <input type="hidden" name="attemptId" value={t.id} />
              <input className="input" name="reason" placeholder="정정 사유" required />
              <button className="btn-secondary w-full">재채점</button>
            </ActionForm>
            {t.status !== "void" && (
              <div className="mt-3">
                <ActionButton action={voidAttemptAction.bind(null, t.id)} className="btn-danger btn-sm" confirm="이 응시를 무효 처리할까요? 학생은 다시 응시할 수 있게 되고, 기록은 보존됩니다.">
                  응시 무효 처리
                </ActionButton>
              </div>
            )}
          </div>
          {t.grades.length > 1 && (
            <div className="card card-body">
              <h2 className="h2 mb-2">채점 이력</h2>
              <ul className="space-y-1 text-xs">
                {t.grades.map((g) => (
                  <li key={g.id} className={g.current ? "font-semibold" : "text-slate-500"}>
                    rev {g.revisionNo}: {Math.round(g.score)}점 ({g.correctCount}/{g.totalCount}) · {g.reason} · {fmtDate(g.createdAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="card lg:col-span-2">
          <div className="card-body">
            <h2 className="h2 mb-2">문항별 결과</h2>
            <table className="tbl tbl-cards">
              <thead>
                <tr>
                  <th>#</th>
                  <th>단어</th>
                  <th>학생 답</th>
                  <th>정답</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {t.assignment.form.items.map((it) => {
                  const ans = t.answers.find((a) => a.itemId === it.id);
                  const chosen = it.options.find((o) => o.id === ans?.optionId);
                  const correct = it.options.find((o) => o.isCorrect);
                  const r = results.find((x) => x.itemId === it.id);
                  return (
                    <tr key={it.id} className={r && !r.correct ? "bg-red-50/50" : ""}>
                      <td data-label="_check">{it.position}</td>
                      <td className="font-medium" data-label="_title">{it.prompt}</td>
                      <td data-label="학생 답">{chosen ? `${chosen.position}. ${chosen.text}` : <span className="text-slate-400">무응답</span>}</td>
                      <td data-label="정답">{correct ? `${correct.position}. ${correct.text}` : "-"}</td>
                      <td data-label="결과">{r ? r.correct ? <span className="badge-green">O</span> : <span className="badge-red">X</span> : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
