"use client";
import { useState, useTransition } from "react";
import { resendVerifyAction, restartWizardAction } from "./actions";

/** ④ 이메일 인증 대기. 메일 서버가 없으면(개발 모드) 인증 링크를 화면에 바로 보여준다 */
export function VerifyStep({ email, academyName, mailOn, devLink, note }: { email: string; academyName: string; mailOn: boolean; devLink?: string; note?: string }) {
  const [link, setLink] = useState<string | undefined>(devLink);
  const [msg, setMsg] = useState<string | undefined>(note);
  const [pending, start] = useTransition();
  return (
    <section className="card card-body anim-fade-up" data-testid="verify-step">
      <div className="lbl">04 · Verify</div>
      <h1 className="h1 mt-1">이메일을 확인해주세요</h1>
      <p className="mt-2 text-[14px]">
        <b>{email}</b>으로 인증 메일을 보냈습니다. 메일의 링크를 열면 {academyName} 학원이 만들어지고 결제 단계로 이어집니다.
      </p>
      {msg && <p className="muted mt-2">{msg}</p>}
      {!mailOn && (
        <div className="card-sm card-body mt-4 text-[13px]" data-testid="dev-verify">
          <div className="lbl" style={{ color: "var(--accent)" }}>
            개발 모드 · 메일 서버 미설정
          </div>
          <p className="mt-1">
            <code>.env</code>에 <code>SMTP_URL</code>(또는 SMTP_HOST/PORT/USER/PASS)을 설정하면 실제 메일이 발송됩니다. 지금은 인증 링크가 <code>log/mail.log</code>에 기록되며 아래에서 바로 열 수 있습니다.
          </p>
          {link ? (
            <a href={link} className="btn-primary mt-3 w-full py-3" data-testid="dev-verify-link">
              인증 링크 열기
            </a>
          ) : (
            <p className="muted mt-2">링크를 다시 받으려면 아래 "인증 메일 다시 보내기"를 누르세요.</p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resendVerifyAction();
              setMsg(r.message);
              if (r.devLink) setLink(r.devLink);
            })
          }
        >
          인증 메일 다시 보내기
        </button>
        <form action={restartWizardAction}>
          <button className="btn-ghost btn-sm">처음부터 다시</button>
        </form>
      </div>
    </section>
  );
}
