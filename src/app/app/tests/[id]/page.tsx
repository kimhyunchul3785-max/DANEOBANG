import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { regenerateFormAction, publishFormAction, releaseAnswersAction, genErrorMessage, updateAssignmentAction, updateExamDueAction } from "../actions";
import { AssignPanel } from "./AssignPanel";
import { FormPreview } from "./FormPreview";
import { PrintBatchForm } from "./PrintBatchForm";

/**
 * 시험 상세 — 세 단계로 나눠 본다 (우측 하단 이전/다음).
 *   1 단어 목록 점검: 문항 버전·경고·보기·정답 정정
 *   2 응시 대상: 지금 배정된 학생(현재 상태) + 추가·제외. 출제 화면에서 이미 정한 대상을 "수정"하는 용도
 *   3 출제·진행: 발행, 마감기한, 정답 공개, 종이 시험지(학생별 PDF·전체 zip), 응시 현황 → 성적
 */
const STEPS = [
  ["1", "단어 목록 점검"],
  ["2", "응시 대상"],
  ["3", "출제 · 진행"],
] as const;

export default async function ExamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ genError?: string; form?: string; published?: string; assigned?: string; step?: string }> }) {
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
  // 기본 단계: 발행 전이면 1, 발행·배정 후면 3(진행), 발행됐지만 대상이 없으면 2
  const step = sp.step && ["1", "2", "3"].includes(sp.step) ? Number(sp.step) : sp.published ? 3 : !published.length ? 1 : exam.assignments.length === 0 ? 2 : 3;
  const href = (n: number) => `/app/tests/${exam.id}?step=${n}${sp.form ? `&form=${sp.form}` : ""}`;

  const graded = exam.assignments.flatMap((a) => a.attempts.filter((t) => t.grades[0] && t.attemptNo === 1).map((t) => t.grades[0]));
  const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.score, 0) / graded.length) : null;
  const done = exam.assignments.filter((a) => a.status === "completed").length;
  const now = new Date();
  const overdue = exam.assignments.filter((a) => a.dueAt && a.dueAt < now && a.status !== "completed").length;
  const prints = exam.assignments.flatMap((a) => a.attempts.flatMap((t) => t.prints)).length;
  const dueList = [...new Set(exam.assignments.filter((a) => a.status !== "completed").map((a) => a.dueAt?.getTime() ?? 0))];
  const commonDue = dueList.length === 1 && dueList[0] ? new Date(dueList[0]) : null;
  const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16) : "");

  return (
    <div className="mx-auto max-w-6xl" data-testid="exam-detail" data-step={step}>
      {pendingPrints > 0 && <AutoRefresh ms={2500} />}
      <div className="mb-4">
        <Link href="/app/tests" className="lbl-ink">
          ← Tests · 시험
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="h1 truncate">
              {exam.title} {exam.isRetake && <span className="badge-amber align-middle">재시험</span>}
            </h1>
            <p className="muted">
              <Link href={`/app/vocabulary/${exam.bookId}`} className="hover:underline">
                {exam.book.title}
              </Link>{" "}
              · {days.map((d) => d.label).join(", ")} · {exam.questionCount}문항 · 통과 {exam.passScore}점 · 단어당 {exam.secondsPerItem}초 · <b>{exam.status === "published" ? "발행됨" : exam.status === "draft" ? "초안" : exam.status}</b>
            </p>
          </div>
          <div className="digital">
            {done}/{exam.assignments.length} DONE{overdue ? ` · ${overdue} MISSED` : ""}
            {avg !== null ? ` · AVG ${avg}` : ""}
          </div>
        </div>
      </div>

      {sp.published && (
        <div className="card-dark card-body mb-4 text-[13px]" data-testid="published-banner">
          시험을 발행했습니다{sp.assigned && Number(sp.assigned) > 0 ? ` · ${sp.assigned}명에게 출제했습니다. 학생 화면에 바로 나타납니다.` : ". 응시 대상 단계에서 학생을 추가하세요."}
        </div>
      )}
      {genError && (
        <div className="card-accent card-body mb-4 text-[13px]">
          <b>문항 초안 생성 실패:</b> {genError}
          <div className="mt-2">
            <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn-secondary btn-sm">
              다시 생성
            </ActionButton>
          </div>
        </div>
      )}

      {/* 단계 탭 */}
      <nav className="seg mb-4 w-full" aria-label="시험 상세 단계">
        {STEPS.map(([n, label]) => (
          <Link key={n} href={href(Number(n))} className={`seg-item flex-1 text-center${step === Number(n) ? " on" : ""}`} aria-current={step === Number(n) ? "step" : undefined} data-testid={`exam-step-${n}`}>
            <span className="digital mr-1" style={{ fontSize: 11 }}>
              {n}
            </span>
            {label}
            {n === "2" && ` · ${exam.assignments.length}명`}
          </Link>
        ))}
      </nav>

      {/* ── 1. 단어 목록 점검 */}
      {step === 1 && (
        <section className="card card-body" data-testid="step-items">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="lbl">1 · Items · 단어 목록 점검</div>
              <p className="muted mt-1">문항·보기·정답을 확인합니다. 발행된 버전은 바뀌지 않고, 정답 정정은 아래 미리보기에서 합니다 (관련 응시는 재채점).</p>
            </div>
            <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn-secondary btn-sm">
              {draft ? "초안 다시 생성" : "새 버전 초안 생성"}
            </ActionButton>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {exam.forms.map((f) => (
              <Link key={f.id} href={`/app/tests/${exam.id}?step=1&form=${f.id}`} className={`chip${selectedForm?.id === f.id ? " on" : ""}`}>
                v{f.version} {f.status === "published" ? "✓ 발행" : "초안"}
                <span className="chip-sub">
                  {f.items.length}문항 · {f._count.assignments}명
                </span>
              </Link>
            ))}
            {exam.forms.length === 0 && <span className="muted">버전이 없습니다.</span>}
          </div>
          {selectedForm && (
            <div>
              {parseJSON<string[]>(selectedForm.warnings, []).length > 0 && (
                <div className="card-2 mb-3 rounded-xl p-3 text-[12.5px]">
                  <b>검토 필요 ({parseJSON<string[]>(selectedForm.warnings, []).length})</b>
                  <ul className="mt-1 list-disc pl-4">
                    {parseJSON<string[]>(selectedForm.warnings, [])
                      .slice(0, 8)
                      .map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                  </ul>
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
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
        </section>
      )}

      {/* ── 2. 응시 대상 (현재 상태 + 수정) */}
      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="step-targets">
          <section className="card card-body">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="lbl">2 · Targets · 현재 응시 대상 {exam.assignments.length}명</div>
                <p className="muted mt-1">출제할 때 정한 대상입니다. 잘못 들어간 학생은 <b>제외</b>하고, 빠진 학생은 오른쪽에서 <b>추가</b>하세요. 이미 시작·완료한 학생은 제외할 수 없습니다.</p>
              </div>
            </div>
            {exam.assignments.length === 0 ? (
              <p className="muted">아직 응시 대상이 없습니다. 오른쪽에서 추가하세요.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>반</th>
                    <th>버전</th>
                    <th>상태</th>
                    <th>기한</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="targets-body">
                  {exam.assignments.map((a) => {
                    const latest = a.attempts[0];
                    const expired = a.dueAt && a.dueAt < now && a.status !== "completed";
                    const locked = a.status === "completed" || !!a.mode;
                    return (
                      <tr key={a.id} data-testid="target-row">
                        <td>
                          <Link href={`/app/students/${a.studentId}`} className="font-medium hover:underline">
                            {a.student.name}
                          </Link>
                        </td>
                        <td className="text-xs">{a.student.classRoom?.name ?? "-"}</td>
                        <td className="text-xs">v{a.form.version}</td>
                        <td>
                          <StatusBadge s={expired ? "expired" : latest?.status === "review" ? "review" : a.status} />
                        </td>
                        <td className="text-xs" style={{ color: "var(--ink-3)" }}>
                          {a.dueAt ? fmtDate(a.dueAt) : "-"}
                        </td>
                        <td className="text-right">
                          {locked ? (
                            <span className="muted text-[12px]">{a.status === "completed" ? "완료" : a.mode === "paper" ? "종이 발급됨" : "응시 중"}</span>
                          ) : (
                            <ActionForm action={updateAssignmentAction} className="inline">
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <input type="hidden" name="op" value="remove" />
                              <button className="btn-ghost btn-sm" style={{ color: "var(--accent)" }} data-testid="target-remove">
                                대상에서 제외
                              </button>
                            </ActionForm>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <div>
            {published.length > 0 ? (
              <AssignPanel examId={exam.id} forms={published.map((f) => ({ id: f.id, version: f.version }))} students={students.filter((s) => !exam.assignments.some((a) => a.studentId === s.id)).map((s) => ({ id: s.id, name: s.name, className: s.classRoom?.name ?? null }))} classes={classes.map((c) => ({ id: c.id, name: c.name }))} defaultDue={commonDue} />
            ) : (
              <div className="card card-body text-[13px]">1단계에서 문항을 검토하고 발행하면 대상을 추가할 수 있습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. 출제 · 진행 */}
      {step === 3 && (
        <div className="space-y-4" data-testid="step-run">
          <div className="bento">
            <section className={`${published.length ? "card-dark" : "card-accent"} span-2 card-body`}>
              <div className="lbl" style={{ color: "rgba(236,233,227,0.6)" }}>
                3 · Publish · 출제 상태
              </div>
              <div className="mt-2 text-[18px] font-semibold">{published.length ? `v${published[0].version} 발행됨 · ${exam.assignments.length}명에게 출제` : "아직 발행 전"}</div>
              <p className="mt-1 text-[12.5px]" style={{ color: "rgba(236,233,227,0.75)" }}>
                {published.length ? `${done}명 완료 · ${exam.assignments.length - done}명 남음${overdue ? ` · 기한 경과 ${overdue}명` : ""}` : "1단계에서 검토 완료 · 발행을 누르세요."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {draft && (
                  <ActionButton action={publishFormAction.bind(null, draft.id)} className="btn btn-sm" style={{ background: "#ece9e3", color: "#1b1a18" }}>
                    v{draft.version} 발행
                  </ActionButton>
                )}
                <ActionButton action={releaseAnswersAction.bind(null, exam.id, !exam.answersReleased)} className="btn btn-sm" style={{ background: "rgba(236,233,227,0.18)", color: "#ece9e3" }}>
                  {exam.answersReleased ? "정답 공개 취소" : "정답·오답노트 공개"}
                </ActionButton>
                <Link href={`/app/results?examId=${exam.id}#detail`} className="btn btn-sm" style={{ background: "rgba(236,233,227,0.18)", color: "#ece9e3" }} data-testid="link-results">
                  이 시험 성적 페이지 →
                </Link>
              </div>
            </section>

            <section className="card span-2 card-body" id="due">
              <div className="lbl">Due · 마감기한 변경</div>
              <p className="muted mt-1">{commonDue ? `현재 마감 ${fmtDate(commonDue)}` : dueList.length > 1 ? "학생마다 마감이 다릅니다" : "마감 없음"}</p>
              <ActionForm action={updateExamDueAction} className="mt-3 space-y-2" resetOnSuccess={false}>
                <input type="hidden" name="examId" value={exam.id} />
                <input className="input" type="datetime-local" name="dueAt" defaultValue={toLocal(commonDue)} aria-label="새 마감" data-testid="due-input" />
                <select className="input" name="scope" defaultValue="open" aria-label="적용 범위">
                  <option value="open">안 친 학생 전체 ({exam.assignments.length - done}명)</option>
                  <option value="overdue">기한 경과 학생만 ({overdue}명)</option>
                  <option value="all">모든 학생 (완료 포함)</option>
                </select>
                <button className="btn-primary btn-sm w-full" data-testid="due-apply">
                  마감 변경
                </button>
              </ActionForm>
              <p className="muted mt-2">비워 두고 변경하면 마감이 없어집니다. 기한 경과(MISSED) 학생도 새 마감으로 다시 칠 수 있습니다.</p>
            </section>

            <section className="card span-2 card-body">
              <div className="flex items-center justify-between">
                <div className="lbl">Paper · 종이 시험지</div>
                <span className="digital">{prints} PDF</span>
              </div>
              <p className="muted mt-1">학생마다 QR 이 다른 시험지입니다. 발급 후 아래 표의 <b>PDF</b> 로 한 명씩, 또는 전체를 zip 으로 받으세요.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <PrintBatchForm examId={exam.id} assignments={exam.assignments.map((a) => ({ id: a.id, name: a.student.name, mode: a.mode, status: a.status }))} />
              </div>
              {prints > 0 && (
                <a className="btn-primary btn-sm mt-3 w-full" href={`/api/files/print-zip/${exam.id}`} data-testid="print-zip">
                  전체 학생 PDF zip 받기 ({prints}명)
                </a>
              )}
              {pendingPrints > 0 && <p className="muted mt-2">시험지 생성 중… 잠시 뒤 자동으로 갱신됩니다.</p>}
            </section>
          </div>

          <section className="card card-body">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="lbl">Progress · 응시 현황 · 학생을 누르면 학생 상세, 점수를 누르면 결과</div>
              <span className="muted">최초 응시 평균 {avg ?? "-"}점 · 확정 {graded.length}명</span>
            </div>
            {exam.assignments.length === 0 ? <p className="muted">응시 대상이 없습니다. 2단계에서 추가하세요.</p> : <ProgressTable exam={exam} />}
          </section>
        </div>
      )}

      {/* 이전 / 다음 */}
      <div className="mt-5 flex items-center justify-between">
        <span className="muted">
          {step} / 3 · {STEPS[step - 1][1]}
        </span>
        <div className="flex gap-2">
          {step > 1 && (
            <Link href={href(step - 1)} className="btn-secondary" data-testid="step-prev">
              ← 이전 · {STEPS[step - 2][1]}
            </Link>
          )}
          {step < 3 && (
            <Link href={href(step + 1)} className="btn-primary" data-testid="step-next">
              다음 · {STEPS[step][1]} →
            </Link>
          )}
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

function ProgressTable({ exam }: { exam: { id: string; assignments: AssignmentRow[] } }) {
  const now = new Date();
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>학생</th>
          <th>반</th>
          <th>방식</th>
          <th>상태</th>
          <th>점수</th>
          <th>기한</th>
          <th>시험지</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="progress-body">
        {exam.assignments.map((a) => {
          const latest = a.attempts[0];
          const g = latest?.grades[0];
          const print = latest?.prints[0];
          const expired = a.dueAt && a.dueAt < now && a.status !== "completed";
          return (
            <tr key={a.id} data-testid="progress-row">
              <td>
                <Link href={`/app/students/${a.studentId}`} className="font-medium hover:underline">
                  {a.student.name}
                </Link>
              </td>
              <td className="text-xs">{a.student.classRoom?.name ?? "-"}</td>
              <td className="text-xs">{a.mode === "online" ? "온라인" : a.mode === "paper" ? "종이" : "-"}</td>
              <td>
                <StatusBadge s={expired ? "expired" : latest?.status === "review" ? "review" : a.status} />
              </td>
              <td>
                {g ? (
                  <Link href={`/app/results/${latest.id}`} className="hover:underline">
                    <span className="num-md" style={{ fontSize: 18 }}>
                      {Math.round(g.score)}
                    </span>{" "}
                    {g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}
                  </Link>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td className="text-xs" style={{ color: "var(--ink-3)" }}>
                {a.dueAt ? fmtDate(a.dueAt) : "-"}
              </td>
              <td className="whitespace-nowrap">
                {print ? (
                  <a className="btn-secondary btn-sm" href={`/api/files/print/${print.id}`} target="_blank" data-testid="print-pdf">
                    PDF ↓ ({print.pages.length}p)
                  </a>
                ) : a.mode === "paper" && a.status !== "completed" ? (
                  <span className="muted text-[12px]">생성 중…</span>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td className="whitespace-nowrap text-right text-xs">
                {a.status !== "completed" && a.mode && (
                  <ActionForm action={updateAssignmentAction} className="inline">
                    <input type="hidden" name="assignmentId" value={a.id} />
                    <input type="hidden" name="op" value="reset_mode" />
                    <button className="btn-ghost btn-sm" title="이전 종이 코드·미완료 응시를 무효화합니다">
                      방식 초기화
                    </button>
                  </ActionForm>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
