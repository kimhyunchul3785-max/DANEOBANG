"use client";
import { useEffect, useState } from "react";

type Toast = { id: number; ok: boolean; text: string };
let seq = 0;

/** 어디서든 toast(): 서버 액션 결과가 화면 갱신으로 사라지지 않도록 전역으로 띄운다 */
export function toast(text: string, ok = true) {
  if (typeof window === "undefined" || !text) return;
  window.dispatchEvent(new CustomEvent("db:toast", { detail: { id: ++seq, ok, text } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.ok ? 4000 : 7000);
    };
    window.addEventListener("db:toast", on);
    return () => window.removeEventListener("db:toast", on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-md whitespace-pre-line rounded-lg px-4 py-2 text-sm shadow-lg ${t.ok ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
