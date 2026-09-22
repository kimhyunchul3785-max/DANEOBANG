"use client";
import { useActionState } from "react";
import { createAcademyAction } from "../actions";

export function NewAcademyForm() {
  const [state, action, pending] = useActionState(createAcademyAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">학원 이름</label>
        <input className="input" name="name" required minLength={2} maxLength={40} placeholder="예: 한빛영어학원" />
      </div>
      <div>
        <label className="label">주소 슬러그 (선택, 영문/숫자/하이픈)</label>
        <input className="input" name="slug" maxLength={40} placeholder="hanbit-english" />
      </div>
      <div>
        <label className="label">소개 (선택)</label>
        <textarea className="input" name="intro" rows={3} maxLength={500} />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "생성 중..." : "학원 개설"}
      </button>
    </form>
  );
}
