"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** 초대 링크(또는 토큰)를 붙여 넣으면 /invite/<token> 으로 보낸다 */
export function InviteLinkForm() {
  const [v, setV] = useState("");
  const router = useRouter();
  const go = () => {
    const m = v.trim().match(/\/invite\/([A-Za-z0-9_-]+)/);
    const token = m ? m[1] : v.trim();
    if (token) router.push(`/invite/${token}`);
  };
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input className="input" placeholder="https://…/invite/…" value={v} onChange={(e) => setV(e.target.value)} aria-label="초대 링크" data-testid="invite-link-input" />
      <button className="btn-secondary whitespace-nowrap" disabled={!v.trim()}>
        참여
      </button>
    </form>
  );
}
