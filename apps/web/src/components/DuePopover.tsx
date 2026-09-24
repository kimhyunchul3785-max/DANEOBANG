"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toaster";
import type { ActionResult } from "./ActionForm";

/** 서울 시각 "YYYY-MM-DDTHH:mm" (datetime-local 값) */
export const seoulLocal = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16);
/** 오늘부터 n일 뒤 23:59 (서울) */
export const endOfDayLocal = (days: number) => {
  const l = new Date(Date.now() + 9 * 3600e3);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + days, 23, 59)).toISOString().slice(0, 16);
};

/**
 * 날짜를 누르면 바로 달력이 열리는 마감 편집 팝오버.
 * 버튼(현재 마감) → 팝오버: [질문 한 줄] · 날짜·시각 · 빠른 선택(+1·+3·+7일) · [변경]
 * action 은 FormData(dueAt + fields) 를 받는 서버 액션.
 */
export function DuePopover({
  action,
  fields,
  current,
  question,
  submitLabel = "마감 변경",
  children,
  className = "due-trigger",
  testId,
  align = "left",
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  current: Date | null;
  question?: string;
  submitLabel?: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    // 표가 가로 스크롤 컨테이너 안에 있어도 잘리지 않게 화면 기준(fixed)으로 띄운다
    const b = ref.current?.querySelector("button")?.getBoundingClientRect();
    if (b) {
      const w = Math.min(300, window.innerWidth - 24);
      const left = Math.max(12, Math.min(align === "right" ? b.right - w : b.left, window.innerWidth - w - 12));
      const below = b.bottom + 6;
      setPos({ top: below + 230 > window.innerHeight ? Math.max(12, b.top - 236) : below, left });
    }
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const now = Date.now();
    // 지난 마감이면 기본값은 3일 뒤 23:59, 아니면 지금 마감
    setValue(current && current.getTime() > now ? seoulLocal(current) : endOfDayLocal(3));
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", on);
    document.addEventListener("keydown", esc);
    // 달력을 바로 연다 (지원하는 브라우저)
    const t = setTimeout(() => {
      input.current?.focus();
      try {
        input.current?.showPicker?.();
      } catch {
        /* 사용자 제스처 밖이면 무시 */
      }
    }, 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", on);
      document.removeEventListener("keydown", esc);
    };
  }, [open, current, align]);
  const submit = () =>
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      fd.set("dueAt", value);
      const r = await action(fd);
      toast(r.message ?? (r.ok ? "" : "실패했습니다."), r.ok);
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} data-testid={testId}>
        {children}
      </button>
      {open && (
        <div role="dialog" aria-label={question ?? submitLabel} className="popover" style={pos ? { position: "fixed", top: pos.top, left: pos.left } : { visibility: "hidden" }} data-testid="due-popover">
          {question && <div className="mb-2 text-[14px] font-semibold">{question}</div>}
          <input
            ref={input}
            className="input"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
            aria-label="새 마감"
            data-testid="due-popover-input"
          />
          <div className="mt-2 flex gap-1">
            {[1, 3, 7].map((d) => (
              <button key={d} type="button" className="chip" onClick={() => setValue(endOfDayLocal(d))}>
                +{d}일
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              취소
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={pending || !value} onClick={submit} data-testid="due-popover-apply">
              {pending ? "…" : submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
