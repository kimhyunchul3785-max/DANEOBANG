"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { renameClassAction } from "./actions";

/** 반 한 줄: 이름(클릭해 수정) · 학생 수 · 보관/삭제 버튼 */
export function ClassRow({ cls, children }: { cls: { id: string; name: string; archived: boolean; count: number }; children: React.ReactNode }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className={`row ${cls.archived ? "opacity-50" : ""}`} data-testid="class-row">
      {edit ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await renameClassAction(fd);
              toast(r.message ?? "", r.ok);
              if (r.ok) {
                setEdit(false);
                router.refresh();
              }
            });
          }}
        >
          <input type="hidden" name="classId" value={cls.id} />
          <input className="input" name="name" defaultValue={cls.name} maxLength={30} required autoFocus style={{ padding: "6px 10px" }} />
          <button className="btn-primary btn-sm" disabled={pending}>
            저장
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(false)}>
            취소
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="min-w-0 flex-1 truncate text-left text-[14px] font-medium hover:underline" onClick={() => setEdit(true)} title="이름 바꾸기">
            {cls.name}
            <span className="muted ml-2">{cls.count}명</span>
            {cls.archived && <span className="badge-gray ml-2">보관</span>}
          </button>
          <span className="flex shrink-0 gap-1">{children}</span>
        </>
      )}
    </li>
  );
}
