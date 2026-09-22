"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateStudentAction } from "./actions";

/** 학생 계정 설정: 로그인 이메일 + 비밀번호만. 이미 로그인한 상태면 그 계정에 바로 연결 */
export function ActivateForm({ token, studentName, presetEmail, current }: { token: string; studentName: string; presetEmail: string | null; current: { name: string; email: string } | null }) {
  const [d, setD] = useState({ email: presetEmail ?? "", password: "", password2: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (useCurrent: boolean) => {
    setErr(null);
    if (!useCurrent && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) || d.password.length < 6 || d.password !== d.password2)) return setErr("이메일 형식과 비밀번호(6자 이상, 확인 일치)를 확인해주세요.");
    const fd = new FormData();
    fd.set("token", token);
    fd.set("useCurrent", useCurrent ? "1" : "0");
    fd.set("email", d.email);
    fd.set("password", d.password);
    start(async () => {
      const r = await activateStudentAction(fd);
      if (!r.ok) return setErr(r.message ?? "실패했습니다.");
      router.push(r.redirectTo ?? "/learn");
    });
  };
  return (
    <div className="card card-body" data-testid="student-activate">
      {current && (
        <div className="card-sm card-body mb-3 text-[13px]">
          지금 <b>{current.email}</b> 로 로그인되어 있습니다.
          <button type="button" className="btn-primary btn-sm ml-2" onClick={() => go(true)} disabled={pending} data-testid="activate-current">
            이 계정으로 연결
          </button>
        </div>
      )}
      <div className="lbl">계정 설정</div>
      <p className="muted mt-1">{studentName} 학생의 로그인 정보만 정하면 끝납니다. 학교·학년·반은 학원에서 이미 등록했습니다.</p>
      <div className="mt-3 grid gap-3">
        <label className="block">
          <span className="label">로그인 이메일</span>
          <input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="example@naver.com" data-testid="activate-email" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">비밀번호</span>
            <input className="input" type="password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} data-testid="activate-password" />
          </label>
          <label className="block">
            <span className="label">비밀번호 확인</span>
            <input className="input" type="password" value={d.password2} onChange={(e) => setD({ ...d, password2: e.target.value })} data-testid="activate-password2" />
          </label>
        </div>
      </div>
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }}>{err}</p>}
      <button type="button" className="btn-primary mt-4 w-full py-3" onClick={() => go(false)} disabled={pending} data-testid="activate-submit">
        {pending ? "처리 중…" : "시작하기"}
      </button>
    </div>
  );
}
