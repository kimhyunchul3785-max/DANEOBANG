"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartButton({ assignmentId, label, variant, compact }: { assignmentId: string; label: string; variant?: "on-accent"; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const cls = compact ? "btn-primary btn-sm" : variant === "on-accent" ? "btn w-full py-3 text-[13px]" : "btn-primary w-full py-3";
  const style = variant === "on-accent" && !compact ? { background: "var(--accent-ink)", color: "var(--accent)" } : undefined;
  return (
    <div className={compact ? "" : "w-full"}>
      <button
        type="button"
        className={cls}
        style={style}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch(`/api/v1/assignments/${assignmentId}/start`, { method: "POST" });
          const j = await r.json();
          setBusy(false);
          if (!r.ok) {
            setErr(j.error?.message ?? "시작할 수 없습니다.");
            router.refresh();
            return;
          }
          router.push(`/learn/attempts/${j.data.attemptId}`);
        }}
      >
        {busy ? "…" : label}
      </button>
      {err && <p className="mt-1 text-xs" style={{ color: "var(--accent-ink)" }}>{err}</p>}
    </div>
  );
}
