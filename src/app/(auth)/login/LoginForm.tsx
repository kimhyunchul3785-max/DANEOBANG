"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label">Password</label>
        <input className="input" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "확인 중..." : "로그인"}
      </button>
      <p className="text-center text-xs text-slate-500">
        학원이 아직 없나요?{" "}
        <Link className="text-blue-600 underline" href="/start">
          학원 시작하기
        </Link>
        <span className="mx-1">·</span>선생님·학생은 초대 링크로 참여합니다
      </p>
      <p className="card-2 p-3 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        데모 (비밀번호 <b>password</b>): owner@ · teacher@ · student@ · admin@daneobang.dev
        <br />
        테스터 (비밀번호 <b>test1234</b>): tester.owner@ · tester.t1@ · tester.s01@daneobang.dev
      </p>
    </form>
  );
}
