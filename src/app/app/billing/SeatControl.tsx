"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeSeatsAction } from "./actions";
import { toast } from "@/components/Toaster";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** − N + 로 선생님 수를 고르면 바뀐 월 요금을 미리 보여주고 [변경] 으로 즉시 반영 */
export function SeatControl({ quantity, minimum, unitPrice }: { quantity: number; minimum: number; unitPrice: number }) {
  const [n, setN] = useState(quantity);
  const [pending, start] = useTransition();
  const router = useRouter();
  const diff = n - quantity;
  const belowMin = n < minimum;
  return (
    <div className="mt-3" data-testid="seat-control">
      <div className="flex items-center gap-5">
        <button type="button" className="btn-secondary h-11 w-11 rounded-full text-[18px]" onClick={() => setN(Math.max(1, n - 1))} aria-label="한 명 줄이기" data-testid="seat-minus">
          −
        </button>
        <div className="text-center">
          <div className="num-lg" data-testid="seat-value">
            {n}
          </div>
          <div className="lbl">명</div>
        </div>
        <button type="button" className="btn-secondary h-11 w-11 rounded-full text-[18px]" onClick={() => setN(Math.min(200, n + 1))} aria-label="한 명 늘리기" data-testid="seat-plus">
          +
        </button>
        <div className="ml-auto text-right">
          <div className="lbl">변경 후</div>
          <div className="num-md" data-testid="seat-preview">
            월 {won(n * unitPrice)}
          </div>
          {diff !== 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              현재 {quantity}명 · 월 {won(quantity * unitPrice)}
            </div>
          )}
        </div>
      </div>
      {belowMin && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--accent)" }}>
          현재 활성 선생님(초대 대기 포함)이 {minimum}명입니다. 선생님을 접근 중지한 후 자리를 줄여주세요.
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-3"
        disabled={pending || diff === 0 || belowMin}
        data-testid="seat-apply"
        onClick={() => {
          const fd = new FormData();
          fd.set("seats", String(n));
          start(async () => {
            const r = await changeSeatsAction(fd);
            toast(r.message ?? (r.ok ? "변경했습니다." : "실패했습니다."), r.ok);
            if (r.ok) router.refresh();
          });
        }}
      >
        {diff > 0 ? `선생님 ${diff}명 추가` : diff < 0 ? `선생님 ${-diff}명 줄이기` : "변경"}
      </button>
    </div>
  );
}
