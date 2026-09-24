"use client";
import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 단어장 목록의 병합 선택 — 카드마다 체크박스, 2개 이상 고르면 화면 아래 검은 바에 [병합] 이 뜬다.
 * 서버 컴포넌트(카드)는 그대로 두고, 체크박스와 바만 클라이언트로.
 */
const Ctx = createContext<{ sel: string[]; toggle: (id: string) => void; clear: () => void } | null>(null);

export function MergeProvider({ children }: { children: React.ReactNode }) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return <Ctx.Provider value={{ sel, toggle, clear: () => setSel([]) }}>{children}</Ctx.Provider>;
}

export function MergeCheck({ id, title }: { id: string; title: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const on = ctx.sel.includes(id);
  return (
    <label className={`chip${on ? " on" : ""}`} style={{ padding: "5px 10px", fontSize: 12, whiteSpace: "nowrap" }} title="병합에 추가 — 2개 이상 고르면 아래에 [병합] 이 나타나요">
      <input type="checkbox" className="sr-only" checked={on} onChange={() => ctx.toggle(id)} aria-label={`${title} 병합 선택`} data-testid="merge-check" />
      <span aria-hidden style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${on ? "var(--surface-2)" : "var(--ink-3)"}`, background: on ? "var(--surface-2)" : "transparent", marginRight: 5, verticalAlign: -1 }} />
      {on ? `병합 ${ctx.sel.indexOf(id) + 1}` : "병합"}
    </label>
  );
}

export function MergeBar() {
  const ctx = useContext(Ctx);
  const router = useRouter();
  if (!ctx || ctx.sel.length === 0) return null;
  const n = ctx.sel.length;
  return (
    <div className="action-bar" data-testid="merge-bar-select">
      <span className="action-bar-note">병합할 단어장 {n}개 선택{n < 2 ? " · 하나 더 고르세요 (고른 순서가 우선순위)" : " · 고른 순서대로 합쳐지고 겹치는 단어는 앞 것만 남아요"}</span>
      <div className="action-bar-actions">
        <button type="button" className="btn-ghost" onClick={ctx.clear}>
          선택 해제
        </button>
        <button type="button" className="btn-primary" disabled={n < 2} onClick={() => router.push(`/app/vocabulary/merge?ids=${ctx.sel.join(",")}`)} data-testid="merge-go">
          병합 · {n}개 →
        </button>
      </div>
    </div>
  );
}
