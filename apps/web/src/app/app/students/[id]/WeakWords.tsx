"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { createWeakWordsExamAction } from "../actions";
import { defaultDueInput } from "../../retakes/RetakeCreate";

/** 반복 오답 목록 → 체크한 n개 + 마감으로 개별 재시험 즉시 출제 (배정 단계 없음, 재시험 화면에 바로 반영) */
export function WeakWords({ studentId, words }: { studentId: string; words: { wordId: string; english: string; meaning: string; day: string; count: number }[] }) {
  const [sel, setSel] = useState<string[]>(words.map((w) => w.wordId));
  const [due, setDue] = useState(defaultDueInput());
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
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="lbl shrink-0 whitespace-nowrap">마감</span>
        <input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} style={{ padding: "6px 10px" }} aria-label="재시험 마감" data-testid="weak-due" />
      </div>
      <button
        type="button"
        className="btn-primary mt-2 w-full"
        disabled={pending || sel.length === 0}
        data-testid="weak-issue"
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("studentId", studentId);
            fd.set("dueAt", due);
            for (const id of sel) fd.append("wordIds", id);
            const r = await createWeakWordsExamAction(fd);
            toast(r.message ?? "", r.ok);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "출제 중…" : `이 ${sel.length}개로 재시험 출제`}
      </button>
    </>
  );
}
