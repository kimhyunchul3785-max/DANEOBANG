"use client";
import { useState, useTransition } from "react";
import { createAcademyAction } from "../actions";

export function NewAcademyForm({ billing }: { billing: boolean }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="card card-body"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData();
        fd.set("name", name);
        start(async () => {
          const r = await createAcademyAction(fd);
          if (r && !r.ok) setErr(r.message ?? "학원을 만들지 못했습니다.");
        });
      }}
      data-testid="new-academy"
    >
      <input className="input py-3 text-[16px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 대치영어학원" maxLength={40} autoFocus data-testid="academyName" />
      {err && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--accent)" }}>
          {err}
        </p>
      )}
      <button className="btn-primary mt-3 w-full py-3" disabled={pending || name.trim().length < 2} data-testid="create-academy">
        {pending ? "만드는 중…" : "시작하기"}
      </button>
      <p className="muted mt-3 text-center">{billing ? "만든 뒤 결제 화면으로 이동합니다 (선생님 1명 · 월 9,900원)" : "학생 무료 · 결제는 나중에"}</p>
    </form>
  );
}
