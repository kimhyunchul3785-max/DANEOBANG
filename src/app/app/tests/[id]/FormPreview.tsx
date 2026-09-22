"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fixAnswerKeyAction } from "../actions";

type Item = { id: string; position: number; prompt: string; dayLabel: string; options: { id: string; position: number; text: string; isCorrect: boolean }[] };

export function FormPreview({ items, editable }: { items: Item[]; editable: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const list = showAll ? items : items.slice(0, 10);
  return (
    <div>
      <ol className="space-y-2 text-sm">
        {list.map((it) => (
          <li key={it.id} className="rounded border border-slate-100 p-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="mr-2 text-slate-400">{it.position}.</span>
                <b className="text-base">{it.prompt}</b> <span className="text-xs text-slate-400">{it.dayLabel}</span>
              </div>
              {editable && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setFixing(fixing === it.id ? null : it.id)}>
                  정답 정정
                </button>
              )}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {it.options.map((o) => (
                <div key={o.id} className={`rounded px-2 py-0.5 ${o.isCorrect ? "bg-green-50 font-medium text-green-800" : "text-slate-700"}`}>
                  {"①②③④"[o.position - 1]} {o.text}
                </div>
              ))}
            </div>
            {fixing === it.id && (
              <ActionForm action={fixAnswerKeyAction} className="mt-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2" onSuccess={() => setFixing(null)}>
                <input type="hidden" name="itemId" value={it.id} />
                <select className="input w-56" name="optionId" defaultValue={it.options.find((o) => o.isCorrect)?.id}>
                  {it.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {"①②③④"[o.position - 1]} {o.text}
                    </option>
                  ))}
                </select>
                <input className="input w-64" name="reason" placeholder="정정 사유 (필수)" required />
                <button className="btn-danger btn-sm">정답 변경 · 관련 응시 재채점</button>
              </ActionForm>
            )}
          </li>
        ))}
      </ol>
      {items.length > 10 && (
        <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setShowAll(!showAll)}>
          {showAll ? "접기" : `전체 ${items.length}문항 보기`}
        </button>
      )}
    </div>
  );
}
