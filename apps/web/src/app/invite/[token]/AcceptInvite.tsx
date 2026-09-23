"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptInviteAction } from "./actions";

/** "OO학원에 참여하시겠어요?" [참여] */
export function AcceptInvite({ token, academyName, userName }: { token: string; academyName: string; userName: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card card-body anim-fade-up" style={{ animationDelay: "60ms" }} data-testid="invite-accept">
      <p className="text-[15px] font-semibold">{academyName}에 참여하시겠어요?</p>
      <p className="muted mt-1">{userName} 계정으로 선생님이 됩니다. 다른 학원의 역할은 그대로 유지됩니다.</p>
      {err && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }}>
          {err}
        </p>
      )}
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <Link href="/switch" className="btn-secondary py-3">
          나중에
        </Link>
        <button
          type="button"
          className="btn-primary py-3"
          disabled={pending}
          data-testid="invite-submit"
          onClick={() =>
            start(async () => {
              const r = await acceptInviteAction(token);
              if (r && !r.ok) setErr(r.message ?? "참여하지 못했습니다.");
            })
          }
        >
          {pending ? "참여 중…" : "참여"}
        </button>
      </div>
    </div>
  );
}
