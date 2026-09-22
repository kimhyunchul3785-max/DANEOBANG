"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { createWeakWordsExamAction } from "../actions";

/** 반복 오답 목록 + "이 n개로 재시험 만들기" (선택 해제 가능) */
export function WeakWords({ studentId, words }: { studentId: string; words: { wordId: string; english: string; meaning: string; day: string; count: number }[] }) {
  const [sel, setSel] = useState<string[]>(words.map((w) => w.wordId));
  const [pending, start] = useTransition();
  const router = useRouter();
  if (words.length === 0) return <p className="muted mt-3">채점된 오답이 없습니다.</p>;
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      <ul className="mt-1 flex-1">
        {words.map((w) => (
          <li key={w.wordId} className="row">
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={sel.includes(w.wordId)} onChange={() => toggle(w.wordId)} aria-label={`${w.english} 선택`} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{w.english}</span>
                <span className="muted block truncate text-[12px]">
                  {w.meaning} · {w.day}
                </span>
              </span>
            </label>
            <span className="digital" style={{ color: "var(--accent)" }}>
              {w.count}×
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-accent mt-3 w-full"
        disabled={pending || sel.length === 0}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("studentId", studentId);
            for (const id of sel) fd.append("wordIds", id);
            const r = await createWeakWordsExamAction(fd);
            toast(r.message ?? "", r.ok);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "만드는 중…" : `이 ${sel.length}개로 재시험 만들기`}
      </button>
    </>
  );
}
