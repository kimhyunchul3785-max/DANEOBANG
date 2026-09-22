import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { regenerateFormAction, publishFormAction, releaseAnswersAction, genErrorMessage, updateAssignmentAction } from "../actions";
import { AssignPanel } from "./AssignPanel";
import { FormPreview } from "./FormPreview";
import { PrintBatchForm } from "./PrintBatchForm";

export default async function ExamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ genError?: string; form?: string; published?: string; assigned?: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const sp = await searchParams;
  const exam = await prisma.exam.findFirst({
    where: { id, academyId: ctx.member.academyId },
    include: {
      book: true,
      scopes: true,
      forms: { orderBy: { version: "desc" }, include: { items: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } }, _count: { select: { assignments: true } } } },
      assignments: {
        where: { student: studentScope(ctx) },
        include: {
          student: { include: { classRoom: true } },
          form: { select: { version: true } },
          attempts: { orderBy: { attemptNo: "desc" }, include: { grades: { where: { current: true } }, prints: { where: { status: "active" }, include: { pages: true } } } },
        },
        orderBy: [{ student: { classId: "asc" } }, { student: { name: "asc" } }],
      },
    },
  });
  if (!exam) notFound();
  const days = await prisma.bookDay.findMany({ where: { id: { in: exam.scopes.map((s) => s.dayId) } }, orderBy: { dayNo: "asc" } });
  const students = await prisma.student.findMany({ where: { ...studentScope(ctx), status: "active" }, include: { classRoom: true }, orderBy: [{ classId: "asc" }, { name: "asc" }] });
  const classes = await prisma.classRoom.findMany({ where: { academyId: ctx.member.academyId, archived: false }, orderBy: { name: "asc" } });
  const published = exam.forms.filter((f) => f.status === "published");
  const draft = exam.forms.find((f) => f.status === "draft");
  const selectedForm = sp.form ? exam.forms.find((f) => f.id === sp.form) : draft ?? published[0];
  const pendingPrints = await prisma.job.count({ where: { type: "render_print", status: { in: ["queued", "running"] }, academyId: ctx.member.academyId } });
  const genError = sp.genError ? await genErrorMessage(sp.genError) : null;

  const graded = exam.assignments.flatMap((a) => a.attempts.filter((t) => t.grades[0] && t.attemptNo === 1).map((t) => t.grades[0]));
  const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.score, 0) / graded.length) : null;

  return (
    <div>
      {pendingPrints > 0 && <AutoRefresh ms={2500} />}
      <div className="mb-4">
        <Link href="/app/tests" className="text-xs text-slate-500 hover:underline">
          ← 시험 목록
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="h1">
              {exam.title} {exam.isRetake && <span className="badge-amber align-middle">재시험</span>}
            </h1>
            <p className="muted">
              {exam.book.title} · {days.map((d) => d.label).join(", ")} · {exam.questionCount}문항 · 통과 {exam.passScore}점 · {exam.timeLimitMin ? `${exam.timeLimitMin}분` : "시간 제한 없음"} · 상태 <b>{exam.status}</b>
            </p>
          </div>
          <div className="flex gap-2">
            <ActionButton action={releaseAnswersAction.bind(null, exam.id, !exam.answersReleased)} className={exam.answersReleased ? "btn-secondary" : "btn-primary"}>
              {exam.answersReleased ? "정답 공개 취소" : "정답·오답노트 공개"}
            </ActionButton>
          </div>
        </div>
      </div>

      {sp.published && (
        <div className="card card-body mb-4 border-green-200 bg-green-50 text-sm text-green-800">
          시험을 발행했습니다{sp.assigned && Number(sp.assigned) > 0 ? ` · ${sp.assigned}명에게 배정했습니다. 학생 화면에 바로 나타납니다.` : ". 오른쪽에서 학생을 배정하세요."}
        </div>
      )}
      {genError && (
        <div className="card card-body mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          <b>문항 초안 생성 실패:</b> {genError}
          <div className="mt-2">
            <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn-secondary btn-sm">
              다시 생성
            </ActionButton>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 좌: 버전 */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card card-body">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="h2">문항 버전</h2>
              <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn-secondary btn-sm">
                {draft ? "초안 다시 생성" : "새 버전 초안 생성"}
              </ActionButton>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {exam.forms.map((f) => (
                <Link key={f.id} href={`/app/tests/${exam.id}?form=${f.id}`} className={`rounded-md border px-3 py-1 text-sm ${selectedForm?.id === f.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300"}`}>
                  v{f.version} {f.status === "published" ? "✓ 발행" : "초안"} <span className="text-xs text-slate-400">({f.items.length}문항 · 배정 {f._count.assignments})</span>
                </Link>
              ))}
              {exam.forms.length === 0 && <span className="muted">버전이 없습니다.</span>}
            </div>
            {selectedForm && (
              <div>
                {parseJSON<string[]>(selectedForm.warnings, []).length > 0 && (
                  <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <b>검토 필요 ({parseJSON<string[]>(selectedForm.warnings, []).length})</b>
                    <ul className="mt-1 list-disc pl-4">
                      {parseJSON<string[]>(selectedForm.warnings, []).slice(0, 8).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                  <span>seed 보호됨 · hash {selectedForm.hash?.slice(0, 10)}</span>
                  {selectedForm.publishedAt && <span>· 발행 {fmtDate(selectedForm.publishedAt)}</span>}
                  {selectedForm.status === "draft" && (
                    <ActionButton action={publishFormAction.bind(null, selectedForm.id)} className="btn-primary btn-sm ml-auto">
                      검토 완료 · v{selectedForm.version} 발행
                    </ActionButton>
                  )}
                  {selectedForm.status === "published" && (
                    <a className="btn-secondary btn-sm ml-auto" href={`/api/files/answer-key/${selectedForm.id}`} target="_blank">
                      교사용 정답지 PDF
                    </a>
                  )}
                </div>
                <FormPreview items={selectedForm.items.map((it) => ({ id: it.id, position: it.position, prompt: it.prompt, dayLabel: it.dayLabel, options: it.options.map((o) => ({ id: o.id, position: o.position, text: o.text, isCorrect: o.isCorrect })) }))} editable={selectedForm.status === "published"} />
              </div>
            )}
          </div>

          <div className="card card-body">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="h2">배정 학생 ({exam.assignments.length})</h2>
              <span className="muted">최초 시험 평균 {avg ?? "-"}점 · 확정 {graded.length}명</span>
            </div>
            {exam.assignments.length === 0 ? (
              <p className="muted">배정된 학생이 없습니다. 오른쪽에서 배정하세요.</p>
            ) : (
              <AssignmentsTable exam={exam} />
            )}
          </div>
        </div>

        {/* 우: 배정 */}
        <div className="space-y-4">
          {published.length > 0 ? (
            <AssignPanel examId={exam.id} forms={published.map((f) => ({ id: f.id, version: f.version }))} students={students.filter((s) => !exam.assignments.some((a) => a.studentId === s.id)).map((s) => ({ id: s.id, name: s.name, className: s.classRoom?.name ?? null }))} classes={classes.map((c) => ({ id: c.id, name: c.name }))} />
          ) : (
            <div className="card card-body text-sm text-slate-600">문항 초안을 검토하고 발행하면 학생에게 배정할 수 있습니다.</div>
          )}
          <div className="card card-body text-xs text-slate-500">
            <b>운영 규칙</b>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>발행된 버전은 불변. 문구 수정은 새 버전 초안으로.</li>
              <li>학생별 최초 공식 응시는 1회. 종이 발급 또는 온라인 시작 시 방식이 잠깁니다.</li>
              <li>정답 공개 전에는 학생 화면·API에 정답이 나가지 않습니다.</li>
              <li>정답 키 정정은 문항 미리보기에서 하며 관련 응시가 재채점됩니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

type AssignmentRow = {
  id: string;
  studentId: string;
  mode: string | null;
  status: string;
  dueAt: Date | null;
  student: { name: string; classRoom: { name: string } | null };
  form: { version: number };
  attempts: { id: string; status: string; attemptNo: number; grades: { score: number; passed: boolean }[]; prints: { id: string; pages: { id: string }[] }[] }[];
};

function AssignmentsTable({ exam }: { exam: { id: string; assignments: AssignmentRow[] } }) {
  return (
    <div className="overflow-x-auto">
      <PrintBatchForm examId={exam.id} assignments={exam.assignments.map((a) => ({ id: a.id, name: a.student.name, mode: a.mode, status: a.status }))} />
      <table className="tbl mt-2">
        <thead>
          <tr>
            <th>학생</th>
            <th>반</th>
            <th>버전</th>
            <th>방식</th>
            <th>상태</th>
            <th>점수</th>
            <th>기한</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exam.assignments.map((a) => {
            const latest = a.attempts[0];
            const g = latest?.grades[0];
            const print = latest?.prints[0];
            const expired = a.dueAt && a.dueAt < new Date() && a.status !== "completed";
            return (
              <tr key={a.id}>
                <td>
                  <Link href={`/app/students/${a.studentId}`} className="text-blue-700 hover:underline">
                    {a.student.name}
                  </Link>
                </td>
                <td className="text-xs">{a.student.classRoom?.name ?? "-"}</td>
                <td className="text-xs">v{a.form.version}</td>
                <td className="text-xs">{a.mode === "online" ? "온라인" : a.mode === "paper" ? "종이" : "-"}</td>
                <td>
                  <StatusBadge s={expired ? "expired" : latest?.status === "review" ? "review" : a.status} />
                </td>
                <td>
                  {g ? (
                    <Link href={`/app/results/${latest.id}`} className="hover:underline">
                      {Math.round(g.score)}점 {g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-xs text-slate-500">{a.dueAt ? fmtDate(a.dueAt) : "-"}</td>
                <td className="whitespace-nowrap text-right text-xs">
                  {print && (
                    <a className="btn-ghost btn-sm" href={`/api/files/print/${print.id}`} target="_blank">
                      PDF ({print.pages.length}p)
                    </a>
                  )}
                  {a.mode === "paper" && !print && a.status !== "completed" && <span className="text-slate-400">생성 중…</span>}
                  {a.status !== "completed" && a.mode && (
                    <ActionForm action={updateAssignmentAction} className="inline">
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input type="hidden" name="op" value="reset_mode" />
                      <button className="btn-ghost btn-sm" title="이전 종이 코드·미완료 응시를 무효화합니다">
                        방식 초기화
                      </button>
                    </ActionForm>
                  )}
                  {a.status === "assigned" && !a.mode && (
                    <ActionForm action={updateAssignmentAction} className="inline">
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input type="hidden" name="op" value="remove" />
                      <button className="btn-ghost btn-sm text-red-600">배정 취소</button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

