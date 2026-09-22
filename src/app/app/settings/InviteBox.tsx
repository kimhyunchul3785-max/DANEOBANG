"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { createInvitationAction } from "./actions";

/** 선생님 이메일 초대. 여러 명은 줄바꿈·쉼표로. 메일 서버가 없으면 링크를 여기서 바로 보여준다 */
export function InviteBox({ available }: { available: number }) {
  const [sent, setSent] = useState<{ email: string; devLink?: string }[] | null>(null);
  return (
    <div>
      <ActionForm action={createInvitationAction} className="grid gap-2" onSuccess={(r) => setSent(((r.data as { sent?: { email: string; devLink?: string }[] })?.sent) ?? [])}>
        <textarea className="input" name="emails" rows={2} placeholder={available > 0 ? "선생님 이메일 (여러 명은 줄바꿈)" : "빈 자리가 없습니다 — 요금제에서 선생님 수를 늘려주세요"} disabled={available <= 0} data-testid="invite-emails" />
        <button className="btn whitespace-nowrap py-2.5" style={{ background: "#ece9e3", color: "#1b1a18" }} disabled={available <= 0} data-testid="invite-send">
          초대 메일 보내기
        </button>
      </ActionForm>
      {sent && sent.length > 0 && (
        <ul className="mt-2 text-[12px]" style={{ color: "rgba(236,233,227,0.85)" }} data-testid="invite-results">
          {sent.map((s) => (
            <li key={s.email} className="flex items-center justify-between gap-2 py-1">
              <span className="truncate">{s.email}</span>
              {s.devLink ? (
                <button type="button" className="lbl underline" onClick={() => navigator.clipboard?.writeText(s.devLink!)} title={s.devLink} data-testid="invite-devlink" data-link={s.devLink}>
                  링크 복사 (메일 서버 없음)
                </button>
              ) : (
                <span className="badge-green">발송</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
