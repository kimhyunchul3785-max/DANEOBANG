"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm({ next, showDemo }: { next?: string; showDemo?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label">이메일 또는 휴대폰 번호</label>
        <input className="input" name="email" type="text" required autoComplete="username" placeholder="example@naver.com · 010-1234-5678" />
      </div>
      <div>
        <label className="label">비밀번호</label>
        <input className="input" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "확인 중..." : "로그인"}
      </button>
      {showDemo && (
        <p className="card-2 p-3 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          데모 (비밀번호 <b>password</b>): owner@ · teacher@ · student@ · admin@daneobang.dev
          <br />
          테스터 (비밀번호 <b>test1234</b>): tester.owner@ · tester.t1@ · tester.s01@daneobang.dev
        </p>
      )}
    </form>
  );
}
