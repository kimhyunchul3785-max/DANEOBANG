"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { renameClassAction, setClassTeacherAction } from "./actions";

/** 반 한 줄: 이름(클릭해 수정) · 학생 수 · 담당 선생님(학원장은 선택) · 보관/삭제 버튼 */
export function ClassRow({ cls, teachers, children }: { cls: { id: string; name: string; archived: boolean; count: number; teacherMemberId: string | null }; teachers: { id: string; name: string }[] | null; children: React.ReactNode }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const teacherName = teachers?.find((t) => t.id === cls.teacherMemberId)?.name ?? null;
  return (
    <li className={`row flex-wrap gap-y-1 ${cls.archived ? "opacity-50" : ""}`} data-testid="class-row">
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
          <span className="flex shrink-0 items-center gap-1">
            {teachers ? (
              <select className="input w-[120px]" style={{ padding: "5px 26px 5px 10px", fontSize: 12.5 }} value={cls.teacherMemberId ?? ""} disabled={pending} aria-label={`${cls.name} 담당 선생님`} title="반 담당 — 반 코드로 들어온 학생의 담당이 됩니다" onChange={(e) => start(async () => { const r = await setClassTeacherAction(cls.id, e.target.value || null); toast(r.message ?? "", r.ok); router.refresh(); })} data-testid="class-teacher">
                <option value="">담당 없음</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              teacherName && <span className="muted text-[12px]">담당 {teacherName}</span>
            )}
            {children}
          </span>
        </>
      )}
    </li>
  );
}
