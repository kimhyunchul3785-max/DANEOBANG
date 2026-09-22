"use client";
import { useState, useTransition } from "react";
import { wizardInviteAction, finishWizardAction } from "./actions";
import type { SeatUsage } from "@/lib/seats";

/** ⑥ 선생님 초대 — 남은 자리만큼 이메일 입력. 초대 링크로 비밀번호만 설정하면 참여 완료 */
export function InviteStep({ academyName, usage, mailOn }: { academyName: string; usage: SeatUsage; mailOn: boolean }) {
  const n = Math.max(0, usage.available);
  const [emails, setEmails] = useState<string[]>(Array.from({ length: Math.min(n, 5) }, () => ""));
  const [sent, setSent] = useState<{ email: string; devLink?: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filled = emails.filter((e) => e.trim());
  const submit = () => {
    setErr(null);
    const fd = new FormData();
    for (const e of filled) fd.append("email", e);
    start(async () => {
      const r = await wizardInviteAction(fd);
      if (!r.ok) return setErr(r.message ?? "초대하지 못했습니다.");
      setSent(r.sent ?? []);
    });
  };
  return (
    <section className="card card-body anim-fade-up" data-testid="invite-step">
      <div className="flex items-center justify-between">
        <div className="lbl">06 · Invite</div>
        <span className="digital" data-testid="seat-usage">
          {usage.used + usage.pending} / {usage.quantity} SEATS
        </span>
      </div>
      <h1 className="h1 mt-1">{academyName}이(가) 준비되었습니다</h1>
      <p className="muted mt-1">
        선생님 {usage.quantity}명 플랜 · 월 {usage.monthly.toLocaleString("ko-KR")}원 · 현재 {usage.used} / {usage.quantity} 사용 중{usage.pending ? ` · 초대 대기 ${usage.pending}` : ""}
      </p>

      {sent ? (
        <div className="mt-4" data-testid="invite-sent">
          <div className="lbl">초대 {sent.length}명</div>
          <ul className="mt-1">
            {sent.map((s) => (
              <li key={s.email} className="row">
                <span className="text-[14px]">{s.email}</span>
                {s.devLink ? (
                  <a href={s.devLink} className="lbl-ink" target="_blank" rel="noreferrer">
                    개발 모드 · 초대 링크
                  </a>
                ) : (
                  <span className="badge-green">메일 발송</span>
                )}
              </li>
            ))}
          </ul>
          {!mailOn && <p className="muted mt-2">메일 서버가 없어 링크를 직접 전달해야 합니다 (log/mail.log 에도 기록됨).</p>}
        </div>
      ) : n === 0 ? (
        <div className="card-sm card-body mt-4 text-[13px]">
          {usage.quantity === 1 && usage.used === 1 ? "1인 학원 플랜입니다. 원장님 계정 하나로 바로 사용하세요. 선생님이 늘면 요금제에서 자리를 추가할 수 있습니다." : "남은 선생님 자리가 없습니다. 요금제에서 선생님 수를 늘리면 초대할 수 있습니다."}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          <div className="lbl">함께 사용할 선생님을 초대해주세요 · 남은 자리 {n}</div>
          {emails.map((e, i) => (
            <input key={i} className="input" type="email" placeholder="선생님 이메일" value={e} onChange={(ev) => setEmails(emails.map((x, j) => (j === i ? ev.target.value : x)))} data-testid={`invite-email-${i}`} />
          ))}
          {emails.length < n && (
            <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={() => setEmails([...emails, ""])}>
              + 한 명 더
            </button>
          )}
          {err && <p className="text-[13px]" style={{ color: "var(--accent)" }}>{err}</p>}
          <button type="button" className="btn-primary mt-2 w-full py-3" disabled={pending || filled.length === 0} onClick={submit} data-testid="send-invites">
            {pending ? "초대 중…" : `${filled.length || ""}명 초대하기`}
          </button>
        </div>
      )}

      <form action={finishWizardAction} className="mt-4">
        <button className={`${sent ? "btn-primary" : "btn-secondary"} w-full py-3`} data-testid="finish">
          {sent ? "대시보드로 가기" : "나중에 하기 · 대시보드로"}
        </button>
      </form>
    </section>
  );
}
