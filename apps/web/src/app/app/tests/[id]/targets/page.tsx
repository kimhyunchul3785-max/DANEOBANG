import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAcademy } from "@/lib/auth";
import { fmtMDHM } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { StepHead } from "@/components/ActionBar";
import { StatusBadge } from "@/components/StatusBadge";
import { removeAssignmentAction } from "../../actions";
import { TargetPicker } from "../TargetPicker";
import { loadExam, loadPickGroups } from "../load";
import { ExamHeader } from "../ExamHeader";

/**
 * 응시 대상 — 시험 상세의 자식. 지금 배정된 학생(현재 상태) + 추가(반 전체·개별, 시작 지금/예약·마감) · 제외.
 */
export default async function ExamTargetsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const sp = await searchParams;
  const data = await loadExam(ctx, id);
  if (!data) notFound();
  const { exam, published, now, commonDue } = data;
  const groups = await loadPickGroups(ctx, exam.assignments.map((a) => a.studentId));

  return (
    <div className="mx-auto max-w-6xl" data-testid="exam-targets">
      <ExamHeader data={data} parent={{ href: `/app/tests/${exam.id}`, label: exam.title }} sub="응시 대상" />
      {sp.issued && (
        <div className="card card-body mb-4 flex items-center gap-2.5 text-[14px] font-semibold" style={{ boxShadow: "0 0 0 1px rgba(31,122,77,0.35)" }} data-testid="issued-banner">
          <span className="dot green" />✓ {sp.issued}명에게 출제했어요
        </div>
      )}
      <div className="grid gap-4" data-testid="step-targets">
        <section className="card card-body">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <StepHead n="T" title={`응시 대상 · ${exam.assignments.length}명`} />
          </div>
          {exam.assignments.length === 0 ? (
            <p className="muted mt-3">아직 출제 전이에요.</p>
          ) : (
            <table className="tbl tbl-cards">
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
                      <td className="font-medium" data-label="_title">
                        <span>
                          {a.student.name} <span className="text-xs font-normal sm:hidden" style={{ color: "var(--ink-3)" }}>{a.student.classRoom?.name ?? ""}</span>
                        </span>
                      </td>
                      <td className="hidden text-xs sm:table-cell">{a.student.classRoom?.name ?? "-"}</td>
                      <td className="text-xs" data-label="버전">v{a.form.version}</td>
                      <td data-label="상태">
                        <StatusBadge s={expired ? "expired" : latest?.status === "review" ? "review" : a.status} />
                      </td>
                      <td className="text-xs" data-label="기한" style={{ color: "var(--ink-3)" }}>
                        {a.dueAt ? fmtMDHM(a.dueAt) : "-"}
                      </td>
                      <td className="text-right">
                        {locked ? (
                          <span className="muted text-[12px]">{a.status === "completed" ? "완료" : a.mode === "paper" ? "종이 발급됨" : "응시 중"}</span>
                        ) : (
                          <ActionButton action={removeAssignmentAction.bind(null, a.id)} className="btn-ghost btn-sm" style={{ color: "var(--accent)" }} confirm={`${a.student.name} 학생을 이 시험 대상에서 뺄까요?`} testId="target-remove">
                            대상에서 제외
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        {published.length > 0 ? (
          <TargetPicker examId={exam.id} forms={published.map((f) => ({ id: f.id, version: f.version }))} groups={groups} defaultDue={commonDue} first={exam.assignments.length === 0} backTo={`/app/tests/${exam.id}/targets`} />
        ) : (
          <div className="card card-body text-[13px]">
            <Link href={`/app/tests/${exam.id}/items`} className="underline">
              문항 · 정답
            </Link>
            <span className="ml-1 badge-gray">초안</span>
          </div>
        )}
      </div>
    </div>
  );
}
