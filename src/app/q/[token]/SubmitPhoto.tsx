"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** 사진 찍어 제출 (카메라 직접 실행) → 채점 중 표시. QR 페이지·학생 앱 공용 */
export function SubmitPhoto({ token, compact }: { token?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
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
      {!compact && <p className="muted text-center text-[12px]">시험지 네 모서리와 QR 이 모두 나오게, 밝은 곳에서 정면으로.</p>}
      {msg && (
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
