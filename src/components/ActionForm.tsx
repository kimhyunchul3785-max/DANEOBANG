"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toaster";

export type ActionResult = { ok: boolean; message?: string; data?: unknown };

/** 서버 액션(FormData) 을 감싸는 폼. 결과 메시지를 인라인 표시하고 성공 시 refresh. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  onSuccess,
  id,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  id?: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      id={id}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const fd = new FormData(formEl);
        start(async () => {
          const r = await action(fd);
          setMsg(r.message ? { ok: r.ok, text: r.message } : r.ok ? null : { ok: false, text: "실패했습니다." });
          toast(r.message ?? (r.ok ? "" : "실패했습니다."), r.ok);
          if (r.ok) {
            if (resetOnSuccess) formEl.reset();
            onSuccess?.(r);
            router.refresh();
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {msg && !msg.ok && <p className="mt-2 text-xs text-red-600">{msg.text}</p>}
    </form>
  );
}

/** 인자 없는/고정 인자 서버 액션을 실행하는 버튼 */
export function ActionButton({
  action,
  children,
  className = "btn-secondary btn-sm",
  confirm: confirmText,
  onDone,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => {
            const r = await action();
            setMsg(r.message ?? (r.ok ? null : "실패했습니다."));
            toast(r.message ?? (r.ok ? "" : "실패했습니다."), r.ok);
            onDone?.(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? "처리 중..." : children}
      </button>
      {msg && <span className="sr-only">{msg}</span>}
    </span>
  );
}
