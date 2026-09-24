"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWordAction } from "../actions";

export function WordEditor({
  index,
  word,
  children,
}: {
  index: number;
  word: { id: string; english: string; pos: string | null; meaning: string; synonyms: string | null; section: string | null; excluded: boolean; revision: number };
  children: React.ReactNode;
}) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (!edit) {
    return (
      <tr className={word.excluded ? "opacity-50" : ""}>
        <td className="text-slate-400" data-label="_check">{index}</td>
        <td className="font-medium" data-label="_title">
          <span>
            {word.english}
            {word.pos && <span className="ml-1.5 text-[12px] font-normal text-slate-500 sm:hidden">{word.pos}</span>}
            {word.excluded && <span className="badge-gray ml-1">제외</span>}
            {word.revision > 1 && <span className="ml-1 text-[10px] text-slate-400">r{word.revision}</span>}
          </span>
        </td>
        <td className="hidden text-slate-500 sm:table-cell">{word.pos ?? ""}</td>
        <td data-label="뜻">{word.meaning}</td>
        <td className="text-xs text-slate-500" data-label="유의어">{word.synonyms ?? ""}</td>
        <td className="text-xs text-slate-400" data-label="원문">{word.section ?? ""}</td>
        <td className="whitespace-nowrap text-right">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(true)}>
            수정
          </button>
          {children}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="text-slate-400">{index}</td>
      <td colSpan={6}>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await updateWordAction(fd);
              setMsg(r.message ?? null);
              if (r.ok) {
                setEdit(false);
                router.refresh();
              }
            });
          }}
        >
          <input type="hidden" name="wordId" value={word.id} />
          <input className="input w-40" name="english" defaultValue={word.english} required />
          <input className="input w-16" name="pos" defaultValue={word.pos ?? ""} placeholder="품사" />
          <input className="input w-64" name="meaning" defaultValue={word.meaning} required />
          <input className="input w-40" name="synonyms" defaultValue={word.synonyms ?? ""} placeholder="동의어 (콤마)" />
          <button className="btn-primary btn-sm" disabled={pending}>
            저장
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(false)}>
            취소
          </button>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </form>
      </td>
    </tr>
  );
}
