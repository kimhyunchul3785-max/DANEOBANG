"use client";
import { useState, useTransition } from "react";
import { joinByCodeAction } from "./actions";

export function CodeJoinForm() {
  const [d, setD] = useState({ phone: "", code: "", password: "", password2: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => {
    setErr(null);
    if (d.phone.replace(/\D/g, "").length < 10) return setErr("휴대폰 번호를 확인해주세요.");
    if (!/^\d{6}$/.test(d.code.trim())) return setErr("인증번호는 숫자 6자리입니다.");
    if (d.password.length < 6 || d.password !== d.password2) return setErr("비밀번호(6자 이상)와 확인이 일치해야 합니다.");
    const fd = new FormData();
    fd.set("phone", d.phone);
    fd.set("code", d.code.trim());
    fd.set("password", d.password);
    start(async () => {
      const r = await joinByCodeAction(fd);
      if (r && !r.ok) setErr(r.message ?? "가입하지 못했습니다.");
    });
  };
  return (
    <div className="card card-body" data-testid="code-join">
      <div className="grid gap-3">
        <label className="block">
          <span className="label">휴대폰 번호</span>
          <input className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} data-testid="join-phone" autoFocus />
        </label>
        <label className="block">
          <span className="label">인증번호 (6자리)</span>
          <input className="input digital" inputMode="numeric" maxLength={6} placeholder="000000" style={{ letterSpacing: "0.3em", fontSize: 20 }} value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.replace(/\D/g, "") })} data-testid="join-code" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">비밀번호</span>
            <input className="input" type="password" autoComplete="new-password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} data-testid="join-password" />
          </label>
          <label className="block">
            <span className="label">비밀번호 확인</span>
            <input className="input" type="password" autoComplete="new-password" value={d.password2} onChange={(e) => setD({ ...d, password2: e.target.value })} data-testid="join-password2" />
          </label>
        </div>
      </div>
      {err && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }} data-testid="join-error">
          {err}
        </p>
      )}
      <button type="button" className="btn-primary mt-4 w-full py-3" onClick={go} disabled={pending} data-testid="join-submit">
        {pending ? "처리 중…" : "가입하고 시작하기"}
      </button>
      <p className="muted mt-3">이후 로그인은 휴대폰 번호 + 비밀번호로 합니다. 인증번호를 못 받았거나 만료됐으면 선생님에게 다시 요청하세요.</p>
    </div>
  );
}
