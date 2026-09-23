"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadScansAction } from "@/app/app/scans/actions";

/**
 * 사진 찍어 제출 (카메라 직접 실행) → 채점 중 표시. QR 페이지·학생 앱 공용.
 * autoOpen: QR 로 들어온 본인 학생이면 카메라를 바로 연다 (브라우저가 막으면 버튼으로).
 */
export function SubmitPhoto({ token, compact, autoOpen }: { token?: string; compact?: boolean; autoOpen?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => {
      try {
        input.current?.click();
      } catch {
        /* 사용자 동작 없이는 열리지 않는 브라우저 */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [autoOpen]);
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    if (token) fd.set("token", token);
    try {
      const r = await fetch("/api/v1/learn/scans", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "제출 실패");
      const results = j.data.results as { ok: boolean; message?: string; pageNo?: number; pages?: number }[];
      const okN = results.filter((x) => x.ok).length;
      const fails = results.filter((x) => !x.ok).map((x) => x.message).join(" / ");
      setMsg(okN ? `${okN}장 제출 · 채점 중입니다${fails ? ` (${fails})` : ""}` : fails || "제출 실패");
      try {
        navigator.vibrate?.(30);
      } catch {}
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className={compact ? "" : "space-y-2"}>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => send(e.target.files)} />
      <button type="button" className={compact ? "btn-primary btn-sm" : "btn-accent w-full py-4 text-[14px]"} disabled={busy} onClick={() => input.current?.click()} data-testid="submit-photo">
        {busy ? "올리는 중…" : compact ? "사진 제출" : "📷 시험지 사진 찍어 제출"}
      </button>
      {!compact && <p className="muted text-center text-[12px]">네 모서리와 QR이 다 나오게 정면에서. 찍으면 바로 채점됩니다.</p>}
      {msg && (
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/** 담당 선생님이 QR 을 찍었을 때: 학생 대신 사진을 올려 채점 (사진 채점 큐와 같은 경로) */
export function TeacherSubmit() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = e.target.files;
          if (!files?.length) return;
          const fd = new FormData();
          for (const f of Array.from(files)) fd.append("files", f);
          start(async () => {
            const r = await uploadScansAction(fd);
            setMsg(r.message ?? (r.ok ? "올렸습니다" : "실패"));
            if (input.current) input.current.value = "";
            setTimeout(() => router.refresh(), 4000);
          });
        }}
      />
      <button type="button" className="btn-accent w-full py-4 text-[14px]" disabled={pending} onClick={() => input.current?.click()} data-testid="teacher-submit-photo">
        {pending ? "올리는 중…" : "📷 학생 시험지 찍어 채점"}
      </button>
      {msg && (
        <p className="text-[13px] whitespace-pre-line" style={{ color: "var(--ink-2)" }} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
