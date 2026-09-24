import Link from "next/link";
import type { LoadedExam } from "./load";
import { Icon } from "@/components/Icon";
import { ActionButton } from "@/components/ActionForm";
import { trashExamAction, restoreExamAction } from "../actions";

/**
 * 세 페이지(진행 · 문항·정답 · 응시 대상) 공통 머리:
 *   ← 부모 · 제목 + 상태 배지 · 메타 한 줄 · 밑줄 탭(같은 시험의 하위 화면)
 * 탭이 곧 부모→자식 구조: 버튼 묶음이 아니라 한 시험 안의 보기 전환으로 읽힌다.
 */
export function ExamHeader({ data, parent, sub }: { data: LoadedExam; parent?: { href: string; label: string }; sub?: string }) {
  const { exam, days } = data;
  const p = parent ?? { href: "/app/tests", label: "시험" };
  // 출제 여부가 한눈에: 발행했어도 대상이 없으면 '출제 전'
  const status =
    exam.status === "archived" ? ["휴지통", "badge-gray"] : exam.status === "draft" ? ["초안", "badge-amber"] : exam.assignments.length === 0 ? ["출제 전", "badge-amber"] : [`출제됨 · ${exam.assignments.length}명`, "badge-green"];
  const form = exam.forms[0];
  const run = !sub;
  const tab = (href: string, label: React.ReactNode, on: boolean, testId?: string) => (
    <Link href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined} data-testid={run ? testId : undefined}>
      {label}
    </Link>
  );
  return (
    <div className="mb-5">
      <Link href={p.href} className="sec-link inline-flex items-center gap-1" data-testid="exam-back">
        ← {p.label}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* 제목은 자르지 않고 줄바꿈. 부제에는 시험 이름을 되풀이하지 않고 메타만 */}
        <h1 className="h1" style={{ wordBreak: "keep-all", overflowWrap: "anywhere" }}>
          {exam.title}
        </h1>
        <span className={status[1]} data-testid="exam-status">
          {status[0]}
        </span>
        <span className="ml-auto">
          {exam.status === "archived" ? (
            <ActionButton action={restoreExamAction.bind(null, exam.id)} className="btn-secondary btn-sm" testId="exam-restore">
              <Icon name="restore" size={15} /> 복원
            </ActionButton>
          ) : (
            <ActionButton action={trashExamAction.bind(null, exam.id)} className="icon-btn danger" title="휴지통으로" confirm={`"${exam.title}"을 휴지통으로 옮길까요? 학생 화면에서 바로 사라져요.`} testId="exam-trash">
              <Icon name="trash" />
            </ActionButton>
          )}
        </span>
        {exam.isRetake && !exam.title.includes("재시험") && <span className="badge-amber">재시험</span>}
      </div>
      <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
        {exam.title.startsWith(exam.book.title) ? "" : `${exam.book.title} · `}
        {days.map((d) => d.label.split(" · ")[0]).join(", ")} · {exam.questionCount}문항 · 통과 {exam.passScore}점 · 단어당 {exam.secondsPerItem}초
      </p>
      <nav className="tabs mt-4" aria-label="시험 하위 화면" data-testid={run ? "exam-children" : "exam-tabs"}>
        {tab(`/app/tests/${exam.id}`, "진행", run)}
        {tab(`/app/tests/${exam.id}/items`, <>문항 · 정답 {form ? <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>v{form.version}{form.status === "draft" ? " 초안" : ""}</span> : null}</>, sub === "문항 · 정답", "link-items")}
        {tab(`/app/tests/${exam.id}/targets`, <>응시 대상 <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>{exam.assignments.length}명</span></>, sub === "응시 대상", "link-targets")}
        {tab(`/app/results?examId=${exam.id}#detail`, "성적 ↗", false, "link-results")}
      </nav>
    </div>
  );
}
