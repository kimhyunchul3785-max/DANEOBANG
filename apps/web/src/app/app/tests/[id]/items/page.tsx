import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { StepHead } from "@/components/ActionBar";
import { regenerateFormAction, publishFormAction } from "../../actions";
import { FormPreview } from "../FormPreview";
import { loadExam } from "../load";
import { ExamHeader } from "../ExamHeader";

/**
 * 문항 · 정답 — 시험 상세의 자식. 버전 칩 · 검토 경고 · 보기·정답 (발행본은 정답 정정) · 초안 발행 · 교사용 정답지.
 */
export default async function ExamItemsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ form?: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const sp = await searchParams;
  const data = await loadExam(ctx, id);
  if (!data) notFound();
  const { exam, published, draft } = data;
  const selectedForm = sp.form ? exam.forms.find((f) => f.id === sp.form) : draft ?? published[0];
  const warnings = selectedForm ? parseJSON<string[]>(selectedForm.warnings, []) : [];

  return (
    <div className="mx-auto max-w-6xl" data-testid="exam-items">
      <ExamHeader data={data} parent={{ href: `/app/tests/${exam.id}`, label: exam.title }} sub="문항 · 정답" />
      <section className="card card-body" data-testid="step-items">
        <div className="mb-2">
          <StepHead n="Q" title="문항 · 정답" hint="문항·보기·정답을 훑어보세요. 발행본의 정답은 아래에서 바로 고칠 수 있어요 (관련 응시 재채점)" />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {exam.forms.map((f) => (
            <Link key={f.id} href={`/app/tests/${exam.id}/items?form=${f.id}`} className={`chip${selectedForm?.id === f.id ? " on" : ""}`}>
              v{f.version} {f.status === "published" ? "✓ 발행" : "초안"}
              <span className="chip-sub">
                {f.items.length}문항 · {f._count.assignments}명
              </span>
            </Link>
          ))}
          {exam.forms.length === 0 && <span className="muted">버전이 없습니다.</span>}
          <ActionButton action={regenerateFormAction.bind(null, exam.id)} className="btn-ghost btn-sm">
            {draft ? "초안 다시 생성" : "+ 새 버전 초안"}
          </ActionButton>
        </div>
        {selectedForm && (
          <div>
            {warnings.length > 0 && (
              <div className="card-2 mb-3 rounded-xl p-3 text-[12.5px]">
                <b>검토 필요 ({warnings.length})</b>
                <ul className="mt-1 list-disc pl-4">
                  {warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
              <span title={`hash ${selectedForm.hash?.slice(0, 10)}`}>{selectedForm.status === "published" ? `문항 고정됨 (v${selectedForm.version})` : `초안 v${selectedForm.version}`}</span>
              {selectedForm.publishedAt && <span>· 발행 {fmtDate(selectedForm.publishedAt)}</span>}
              {selectedForm.status === "draft" && (
                <ActionButton action={publishFormAction.bind(null, selectedForm.id)} className="btn-primary btn-sm ml-auto" testId="publish-form">
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
    </div>
  );
}
