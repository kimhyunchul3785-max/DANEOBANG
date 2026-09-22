"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { createInvitationAction } from "./actions";

export function InviteBox() {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div>
      <ActionForm action={createInvitationAction} className="flex gap-2" onSuccess={(r) => setUrl((r.data as { url?: string })?.url ?? null)}>
        <input className="input" name="email" type="email" placeholder="선생님 이메일 (선택: 지정 시 그 계정만 사용 가능)" />
        <button className="btn-primary whitespace-nowrap">링크 발급</button>
      </ActionForm>
      {url && (
        <div className="mt-2 rounded bg-slate-50 p-2">
          <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => navigator.clipboard?.writeText(url)}>
            복사
          </button>
        </div>
      )}
    </div>
  );
}
