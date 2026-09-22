"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { verifyQrPasswordAction } from "./actions";

export function PasswordGate({ token, studentName }: { token: string; studentName: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) => {
    const r = await verifyQrPasswordAction(token, prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, undefined);
  return (
    <form action={action} className="card card-body anim-fade-up">
      <div className="lbl">Password · 본인 확인</div>
      <div className="mt-2 text-[18px] font-semibold">{studentName} 학생의 시험지입니다</div>
      <p className="muted mt-1">단어방 계정 비밀번호를 입력하면 채점 결과를 볼 수 있습니다.</p>
      <input className="input mt-4 text-center text-[18px] tracking-widest" name="password" type="password" inputMode="text" autoComplete="current-password" placeholder="비밀번호" required autoFocus />
      {state?.error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--accent)" }}>
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-3 w-full py-3" disabled={pending}>
        {pending ? "확인 중…" : "확인"}
      </button>
    </form>
  );
}
