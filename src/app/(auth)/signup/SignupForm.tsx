"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "../actions";

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label">이름</label>
        <input className="input" name="name" required maxLength={40} />
      </div>
      <div>
        <label className="label">이메일</label>
        <input className="input" name="email" type="email" required />
      </div>
      <div>
        <label className="label">비밀번호 (6자 이상)</label>
        <input className="input" name="password" type="password" required minLength={6} />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "생성 중..." : "가입하기"}
      </button>
      <p className="text-center text-xs text-slate-500">
        이미 계정이 있나요?{" "}
        <Link className="text-blue-600 underline" href="/login">
          로그인
        </Link>
      </p>
      <p className="text-[11px] text-slate-400">
        가입 시 고른 역할은 권한이 아닙니다. 학원 개설 시 소유자가 되고, 선생님·학생 권한은 초대 링크로 부여됩니다.
      </p>
    </form>
  );
}
