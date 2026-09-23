/**
 * 흐름의 "다음" 동작 바. 출제 화면·시험 상세 3단계에서 같은 자리(내용 영역 하단, 화면에 붙음)에 같은 크기로 나온다.
 *  - 왼쪽: 지금 어디인지 한 줄 (예: "2 / 3 · 응시 대상")
 *  - 오른쪽: 보조(이전·초안) 다음에 주 동작(다음·출제). 주 동작은 항상 맨 오른쪽, 폭 고정.
 */
export function ActionBar({ note, children, testId }: { note?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <div className="action-bar" data-testid={testId}>
      <span className="action-bar-note">{note}</span>
      <div className="action-bar-actions">{children}</div>
    </div>
  );
}

/** 섹션 머리: 번호 동그라미 + 제목 + 한 줄 힌트 (+ 오른쪽 카운터) */
export function StepHead({ n, title, hint, right, testId }: { n: string | number; title: string; hint?: string; right?: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-3" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className="step-no">{n}</span>
        <div>
          <div className="text-[15px] font-semibold leading-tight">{title}</div>
          {hint && <div className="muted mt-0.5 text-[12.5px]">{hint}</div>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
