"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinByClassCodeAction, linkByPhoneCodeAction } from "../actions";

type Tab = "code" | "sms";

/** [반 코드로 참여하기] [문자 인증번호 입력] — 하나만 펼쳐 보인다 */
export function StudentJoinForms({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [sms, setSms] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; redirectTo?: string } | void>) => {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r) return;
      if (!r.ok) return setErr(r.message ?? "연결하지 못했습니다.");
      setDone(r.message ?? "연결했습니다.");
      router.push(r.redirectTo ?? "/learn");
    });
  };
  const tile = (key: Tab, title: string, sub: string, testId: string) => (
    <button type="button" className={`tile w-full rounded-[20px] px-5 py-4 text-left${tab === key ? " pressed" : ""}`} style={tab === key ? { background: "var(--ink)", color: "var(--surface-2)" } : { background: "var(--surface)" }} onClick={() => setTab(tab === key ? null : key)} aria-expanded={tab === key} data-testid={testId}>
      <div className="text-[17px] font-semibold tracking-tight">{title}</div>
      <div className="mt-0.5 text-[12.5px]" style={{ opacity: 0.75 }}>
        {sub}
      </div>
    </button>
  );
  if (done)
    return (
      <div className="card card-body text-center" data-testid="join-done">
        <div className="text-[15px] font-semibold">{done}</div>
        <p className="muted mt-1">시험 화면으로 이동합니다…</p>
      </div>
    );
  return (
    <div className="grid gap-3">
      {tile("code", "반 코드로 참여하기", "선생님이 알려준 6자리 코드", "join-tab-code")}
      {tab === "code" && (
        <form
          className="card card-body"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => joinByClassCodeAction(code, name));
          }}
          data-testid="join-code-form"
        >
          <label className="block">
            <span className="label">반 코드</span>
            <input className="input digital" inputMode="numeric" maxLength={6} placeholder="000000" style={{ letterSpacing: "0.3em", fontSize: 22 }} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus data-testid="join-code" />
          </label>
          <label className="mt-3 block">
            <span className="label">이름 (학원에 등록된 이름)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} data-testid="join-name" />
          </label>
          {err && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--accent)" }} data-testid="join-error">
              {err}
            </p>
          )}
          <button className="btn-primary mt-4 w-full py-3" disabled={pending || code.length !== 6 || !name.trim()} data-testid="join-submit">
            {pending ? "연결 중…" : "참여하기"}
          </button>
        </form>
      )}
      {tile("sms", "문자 인증번호 입력", "학원에서 보낸 문자의 6자리 번호", "join-tab-sms")}
      {tab === "sms" && (
        <form
          className="card card-body"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => linkByPhoneCodeAction(phone, sms));
          }}
          data-testid="join-sms-form"
        >
          <label className="block">
            <span className="label">휴대폰 번호</span>
            <input className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus data-testid="join-phone" />
          </label>
          <label className="mt-3 block">
            <span className="label">인증번호</span>
            <input className="input digital" inputMode="numeric" maxLength={6} placeholder="000000" style={{ letterSpacing: "0.3em", fontSize: 22 }} value={sms} onChange={(e) => setSms(e.target.value.replace(/\D/g, ""))} data-testid="join-sms" />
          </label>
          {err && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--accent)" }} data-testid="join-error">
              {err}
            </p>
          )}
          <button className="btn-primary mt-4 w-full py-3" disabled={pending || sms.length !== 6 || phone.replace(/\D/g, "").length < 10} data-testid="join-sms-submit">
            {pending ? "연결 중…" : "연결하기"}
          </button>
        </form>
      )}
    </div>
  );
}
