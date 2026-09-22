"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "./actions";

type Mode = "signup" | "login" | "accept" | "wrong_user";

/** 초대 수락 폼: 계정이 없으면 이름·비밀번호만, 있으면 로그인 후 수락 */
export function AcceptForm({ token, email, academyName, mode, currentEmail }: { token: string; email: string | null; academyName: string; mode: Mode; currentEmail: string | null }) {
  const [d, setD] = useState({ name: "", password: "", password2: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = () => {
    setErr(null);
    if (mode === "signup" && (d.name.trim().length < 1 || d.password.length < 6 || d.password !== d.password2)) return setErr("이름과 비밀번호(6자 이상, 확인 일치)를 확인해주세요.");
    const fd = new FormData();
    fd.set("token", token);
    fd.set("name", d.name);
    fd.set("password", d.password);
    start(async () => {
      const r = await acceptInviteAction(fd);
      if (!r.ok) return setErr(r.message ?? "실패했습니다.");
      router.push(r.redirectTo ?? "/app");
    });
  };
  if (mode === "wrong_user")
    return (
      <div className="card card-body">
        <p className="text-[14px]">
          이 초대는 <b>{email}</b> 전용입니다. 지금은 {currentEmail} 로 로그인되어 있습니다.
        </p>
        <form action="/api/auth/logout" method="post" className="mt-4">
          <button className="btn-primary w-full py-3">로그아웃하고 다시 열기</button>
        </form>
      </div>
    );
  if (mode === "login")
    return (
      <div className="card card-body">
        <p className="text-[14px]">
          <b>{email}</b> 계정이 이미 있습니다. 로그인하면 {academyName}에 바로 참여합니다.
        </p>
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="btn-primary mt-4 w-full py-3">
          로그인하고 참여하기
        </Link>
      </div>
    );
  return (
    <div className="card card-body" data-testid="invite-accept">
      {mode === "signup" ? (
        <div className="grid gap-3">
          <label className="block">
            <span className="label">이메일</span>
            <input className="input" value={email ?? ""} disabled />
          </label>
          <label className="block">
            <span className="label">이름</span>
            <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={40} autoFocus data-testid="invite-name" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">새 비밀번호</span>
              <input className="input" type="password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} data-testid="invite-password" />
            </label>
            <label className="block">
              <span className="label">비밀번호 확인</span>
              <input className="input" type="password" value={d.password2} onChange={(e) => setD({ ...d, password2: e.target.value })} data-testid="invite-password2" />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-[14px]">
          <b>{currentEmail}</b> 계정으로 {academyName}에 참여합니다.
        </p>
      )}
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }}>{err}</p>}
      <button type="button" className="btn-primary mt-4 w-full py-3" onClick={go} disabled={pending} data-testid="invite-submit">
        {pending ? "처리 중…" : mode === "signup" ? "가입하고 참여하기" : "초대 수락"}
      </button>
    </div>
  );
}
