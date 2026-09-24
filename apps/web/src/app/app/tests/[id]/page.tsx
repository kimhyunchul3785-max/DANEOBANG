import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, fmtMDHM, parseJSON } from "@/lib/util";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { regenerateFormAction, publishFormAction, releaseAnswersAction, genErrorMessage, updateAssignmentAction, updateExamDueAction } from "../actions";
import { PrintBatchForm } from "./PrintBatchForm";
import { loadExam, loadPickGroups, toLocal, type LoadedExam } from "./load";
import { TargetPicker } from "./TargetPicker";
import { ExamHeader } from "./ExamHeader";

/**
 * 시험 상세 = 진행 화면. 이미 출제된 시험이므로 여기서는
 *   요약(대상 · 완료 · 평균 · 통과율 · 기한 경과) · 마감 변경 · 종이 시험지 · 정답 공개 · 학생별 표
 * 만 다룬다. 문항·정답은 자식 /items, 응시 대상 추가·제외는 자식 /targets. 초안이면 "검토 후 발행" 카드 하나.
 */
export default async function ExamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ genError?: string; published?: string; assigned?: string; step?: string; form?: string; issued?: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const sp = await searchParams;
  // 옛 3단계 주소 → 자식 페이지
  if (sp.step === "1") redirect(`/app/tests/${id}/items${sp.form ? `?form=${sp.form}` : ""}`);
  if (sp.step === "2") redirect(`/app/tests/${id}/targets`);
  const data = await loadExam(ctx, id);
  if (!data) notFound();
  const { exam, published, draft, done, overdue, avg, passRate, graded, prints, openOnes, dueList, commonDue, commonStart, startPending, startMixed } = data;
  const pendingPrints = await prisma.job.count({ where: { type: "render_print", status: { in: ["queued", "running"] }, academyId: ctx.member.academyId } });
  const genError = sp.genError ? await genErrorMessage(sp.genError) : null;
  const warnings = draft ? parseJSON<string[]>(draft.warnings, []).length : 0;
  const missed = graded.filter((g) => !g.passed).length;
  // 발행했지만 아직 아무에게도 안 낸 시험: 진행 화면 자리에 대상 고르기 → [출제하기]
  const pickGroups = published.length && exam.assignments.length === 0 && exam.status !== "archived" ? await loadPickGroups(ctx, []) : null;

  return (
    <div className="mx-auto max-w-6xl" data-width="wide" data-testid="exam-detail" data-view={published.length ? "run" : "draft"}>
      {pendingPrints > 0 && <AutoRefresh ms={2500} />}
      <ExamHeader data={data} />

      {(sp.published || sp.issued) && (
        <div className="card card-body mb-4 flex items-center gap-2.5 text-[14px] font-semibold" style={{ boxShadow: "0 0 0 1px rgba(31,122,77,0.35)" }} data-testid="published-banner">
          <span className="dot green" />
          {sp.issued ? `✓ ${sp.issued}명에게 출제했어요` : sp.assigned && Number(sp.assigned) > 0 ? `✓ 발행하고 ${sp.assigned}명에게 출제했어요` : "✓ 발행했어요 · 아직 출제 전이에요"}
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

      {!published.length ? (
        /* 초안: 여기서 할 일은 하나 — 검토하고 발행 */
        <section className="card-accent card-body" data-testid="draft-card">
          <div className="lbl-on">초안</div>
          <div className="mt-2 text-[20px] font-semibold">아직 발행 전이에요</div>
          <p className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
            {draft ? `v${draft.version} 초안 ${draft.items.length}문항${warnings ? ` · 검토 필요 ${warnings}건` : ""}`: "문항 초안이 없습니다."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/app/tests/${exam.id}/items`} className="btn" style={{ background: "#fff4f0", color: "var(--accent)" }} data-testid="draft-review">
              문항 검토 →
            </Link>
            {draft && (
              <ActionButton action={publishFormAction.bind(null, draft.id)} className="btn" style={{ background: "rgba(255,244,240,0.18)", color: "#fff4f0" }} testId="draft-publish">
                검토 없이 v{draft.version} 발행
              </ActionButton>
            )}
            {!draft && (
              <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn" style={{ background: "rgba(255,244,240,0.18)", color: "#fff4f0" }}>
                초안 생성
              </ActionButton>
            )}
          </div>
        </section>
      ) : pickGroups ? (
        <TargetPicker examId={exam.id} forms={published.map((f) => ({ id: f.id, version: f.version }))} groups={pickGroups} defaultDue={null} first backTo={`/app/tests/${exam.id}`} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]" data-testid="step-run">
          <div className="min-w-0 space-y-4">
            {/* 요약 한 줄: 완료 · 평균 · 통과율 · 미달 — 한 표면을 칸막이로 */}
            <section className="kpis" style={{ ["--n" as string]: 4 }} data-testid="run-summary">
              <div>
                <span className="lbl">완료</span>
                <span className="kpi-v">
                  {done}
                  <small>/ {exam.assignments.length}명</small>
                </span>
                <div className="meter" aria-hidden>
                  <i style={{ width: `${exam.assignments.length ? (done / exam.assignments.length) * 100 : 0}%` }} />
                </div>
                {overdue > 0 && (
                  <span className="kpi-s" style={{ color: "var(--accent)" }}>
                    기한 경과 {overdue}명
                  </span>
                )}
              </div>
              <div className="contents" data-testid="run-scores">
                <div>
                  <span className="lbl">평균</span>
                  <span className="kpi-v">{avg ?? "—"}</span>
                  <span className="kpi-s">첫 응시 · 확정 {graded.length}명</span>
                </div>
                <div>
                  <span className="lbl">통과율</span>
                  <span className="kpi-v">{passRate === null ? "—" : `${passRate}%`}</span>
                  <span className="kpi-s">기준 {exam.passScore}점</span>
                </div>
                <div>
                  <span className="lbl">미달</span>
                  <span className="kpi-v" style={missed ? { color: "var(--accent)" } : undefined}>
                    {graded.length ? missed : "—"}
                  </span>
                  <span className="kpi-s">{missed ? "재시험 탭에서 출제" : "재시험 대상 없음"}</span>
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="sec-h px-5 pb-2 pt-4">
                <h2 className="sec-t">학생별 응시</h2>
                <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {exam.assignments.length}명
                </span>
              </div>
              {exam.assignments.length === 0 ? (
                <p className="muted px-5 pb-5">
                  응시 대상이 없어요.{" "}
                  <Link href={`/app/tests/${exam.id}/targets`} className="underline">
                    응시 대상 →
                  </Link>
                </p>
              ) : (
                <div className="px-3 pb-2">
                  <ProgressTable data={data} />
                </div>
              )}
            </section>
          </div>

          {/* 오른쪽: 이 시험의 설정 — 기간·공개 · 마감 변경 · 인쇄 */}
          <aside className="grid items-start gap-4 md:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
            <section className="card card-body" id="due">
              <h2 className="sec-t">기간 · 공개</h2>
              {exam.assignments.length > 0 && (
                <p className="mt-1.5 text-[13px]" style={{ color: "var(--ink-2)" }} data-testid="period-line">
                  {startPending ? `시작 ${fmtDate(commonStart)} 예약` : startMixed ? "시작 시각이 학생마다 다름 (일부 예약)" : commonStart ? `시작 ${fmtDate(commonStart)}` : "시작 즉시"} · {commonDue ? `마감 ${fmtDate(commonDue)}` : dueList.length > 1 ? "마감이 학생마다 다름" : "마감 없음"}
                </p>
              )}
              {/* 공개 정책 · 현재 상태 — 점수/정답 각각 "제출 직후" 인지 "선생님 공개" 인지, 공개했는지 */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="release-state" data-released={exam.answersReleased ? "1" : "0"}>
                <span className="badge-gray" style={{ fontWeight: 500 }}>
                  점수 · {exam.scoreVisibility === "immediate" ? "제출 직후" : exam.answersReleased ? "공개함" : "공개 전"}
                </span>
                <span className="badge-gray" style={{ fontWeight: 500 }}>
                  정답·오답노트 · {exam.answerVisibility === "immediate" ? "제출 직후" : exam.answersReleased ? "공개함" : "공개 전"}
                </span>
                {(exam.scoreVisibility === "after_release" || exam.answerVisibility === "after_release") && (
                  <ActionButton action={releaseAnswersAction.bind(null, exam.id, !exam.answersReleased)} className={`${exam.answersReleased ? "btn-secondary" : "btn-primary"} btn-sm mt-1 w-full`} testId="release-answers">
                    {exam.answersReleased ? "공개 취소" : `학생에게 ${exam.scoreVisibility === "after_release" ? "점수·정답" : "정답·오답노트"} 공개`}
                  </ActionButton>
                )}
              </div>
              <div className="my-4 h-px" style={{ background: "var(--line)" }} />
              <div className="text-[13px] font-semibold">마감 변경</div>
              <p className="muted mt-0.5 text-[12.5px]">{commonDue ? `현재 마감 ${fmtDate(commonDue)}${openOnes.length === 0 && exam.assignments.length > 0 ? " · 모두 완료" : ""}` : dueList.length > 1 ? "학생마다 마감이 다릅니다" : "마감 없음"}</p>
              <ActionForm action={updateExamDueAction} className="mt-2.5 space-y-2" resetOnSuccess={false}>
                <input type="hidden" name="examId" value={exam.id} />
                <input className="input" type="datetime-local" name="dueAt" defaultValue={toLocal(commonDue)} aria-label="새 마감" data-testid="due-input" />
                <select className="input" name="scope" defaultValue="open" aria-label="적용 범위">
                  <option value="open">안 친 학생 전체 ({exam.assignments.length - done}명)</option>
                  <option value="overdue">기한 경과 학생만 ({overdue}명)</option>
                  <option value="all">모든 학생 (완료 포함)</option>
                </select>
                <button className="btn-secondary btn-sm w-full" data-testid="due-apply">
                  마감 변경
                </button>
              </ActionForm>
            </section>

            <section className="card card-body" data-testid="paper-card">
              <div className="sec-h">
                <h2 className="sec-t">인쇄 · PDF</h2>
                {prints > 0 && <span className="badge-gray">시험지 {prints}</span>}
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                학생마다 QR이 달라 찍으면 바로 제출·채점됩니다.
              </p>
              <div className="mt-3 space-y-2">
                <PrintBatchForm examId={exam.id} assignments={exam.assignments.map((a) => ({ id: a.id, name: a.student.name, mode: a.mode, status: a.status }))} />
                {prints > 0 && (
                  <a className="btn-secondary btn-sm w-full" href={`/api/files/print-zip/${exam.id}`} data-testid="print-zip">
                    전체 학생 PDF zip ({prints}명)
                  </a>
                )}
                <a className="btn-ghost btn-sm w-full" href={`/api/files/answer-key/${published[0].id}`} target="_blank" style={{ justifyContent: "flex-start" }}>
                  교사용 정답지 PDF · v{published[0].version} ↗
                </a>
              </div>
              {pendingPrints > 0 && <p className="muted mt-2">시험지 생성 중… 잠시 뒤 자동으로 갱신됩니다.</p>}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function ProgressTable({ data }: { data: LoadedExam }) {
  const { exam, now } = data;
  return (
    <table className="tbl tbl-cards">
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
              <td className="font-medium" data-label="_title">
                <span>
                  {a.student.name} <span className="text-xs font-normal sm:hidden" style={{ color: "var(--ink-3)" }}>{a.student.classRoom?.name ?? ""}</span>
                </span>
              </td>
              <td className="hidden text-xs sm:table-cell">{a.student.classRoom?.name ?? "-"}</td>
              <td className="text-xs" data-label="방식">{a.mode === "online" ? "온라인" : a.mode === "paper" ? "종이" : "-"}</td>
              <td data-label="상태">
                <StatusBadge s={expired ? "expired" : latest?.status === "review" ? "review" : a.status} />
              </td>
              <td data-label="점수">
                {g ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums">{Math.round(g.score)}</span>
                    {g.passed ? <span className="badge-green">통과</span> : <span className="badge-red">미달</span>}
                    <span className="muted text-[12px]">
                      {g.correctCount}/{g.totalCount}
                    </span>
                  </span>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td className="text-xs" data-label="기한" style={{ color: "var(--ink-3)" }}>
                {a.dueAt ? fmtMDHM(a.dueAt) : "-"}
              </td>
              <td className="whitespace-nowrap" data-label="시험지">
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
