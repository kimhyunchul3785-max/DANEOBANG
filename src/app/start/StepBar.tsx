export const STEPS = ["학원 정보", "선생님 수", "원장 사용 여부", "계정", "결제", "선생님 초대"] as const;

/** 가입 단계 표시줄 (①~⑥). 지난 단계는 ✓, 현재 단계는 진하게 */
export function StepBar({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex flex-wrap gap-x-3 gap-y-1" aria-label="가입 단계" data-testid="stepbar" data-step={step}>
      {STEPS.map((label, i) => (
        <li key={label} className="lbl flex items-center gap-1" style={{ color: i + 1 === step ? "var(--ink)" : i + 1 < step ? "var(--ok)" : "var(--ink-3)" }} aria-current={i + 1 === step ? "step" : undefined}>
          <span className="digital" style={{ fontSize: 11 }}>
            {i + 1 < step ? "✓" : String(i + 1).padStart(2, "0")}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
