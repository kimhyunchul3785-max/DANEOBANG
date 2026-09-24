"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartButton({ assignmentId, label, variant, compact }: { assignmentId: string; label: string; variant?: "on-accent"; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const cls = compact ? "btn-primary btn-sm" : variant === "on-accent" ? "btn w-full text-[15px]" : "btn-primary w-full";
  const style = variant === "on-accent" && !compact ? { background: "#fff", color: "var(--accent)", minHeight: 48 } : compact ? undefined : { minHeight: 48 };
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
