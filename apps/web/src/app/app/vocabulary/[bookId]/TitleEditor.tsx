"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { renameBookAction } from "../actions";

/** 단어장 제목: 클릭하면 바로 고칠 수 있는 인라인 편집 */
export function TitleEditor({ bookId, title, level }: { bookId: string; title: string; level: string | null }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!edit)
    return (
      <div>
        <h1 className="h1 flex items-center gap-2">
          <span>{title}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(true)} aria-label="제목 수정">
            이름 바꾸기
          </button>
        </h1>
        {level && <div className="muted">{level}</div>}
      </div>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await renameBookAction(fd);
          toast(r.message ?? "", r.ok);
          if (r.ok) {
            setEdit(false);
            router.refresh();
          }
        });
      }}
    >
      <input type="hidden" name="bookId" value={bookId} />
      <input className="input w-72 text-[16px] font-semibold" name="title" defaultValue={title} maxLength={60} required autoFocus />
      <input className="input w-32" name="level" defaultValue={level ?? ""} placeholder="레벨 (선택)" maxLength={20} />
      <button className="btn-primary btn-sm" disabled={pending}>
        저장
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(false)}>
        취소
      </button>
    </form>
  );
}
