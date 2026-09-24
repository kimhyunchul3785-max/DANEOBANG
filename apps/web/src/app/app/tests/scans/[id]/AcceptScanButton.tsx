"use client";
import { useRouter } from "next/navigation";
import { ActionButton, type ActionResult } from "@/components/ActionForm";

/** 확정 후 다음 검수 필요 항목으로 자동 이동 (없으면 목록) */
export function AcceptScanButton({ action }: { action: () => Promise<ActionResult> }) {
  const router = useRouter();
  return (
    <ActionButton
      action={action}
      className="btn-primary"
      onDone={(r) => {
        if (!r.ok) return;
        const next = (r.data as { nextId?: string | null } | undefined)?.nextId;
        router.push(next ? `/app/tests/scans/${next}` : "/app/tests/scans");
      }}
    >
      이 페이지 확정 → 다음
    </ActionButton>
  );
}
