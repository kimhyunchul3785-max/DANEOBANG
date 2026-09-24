"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

export type RailItem = { key: string; label: string; sub?: string | number; href: string };

/** 항목 칩 한 줄 · 양옆 ‹ › 로 한 화면 폭씩 넘긴다. 고른 칩은 처음에 보이는 자리로 스크롤 */
export function ChipRail({ items, current }: { items: RailItem[]; current: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>(".chip.on");
    if (on) {
      const r = on.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      el.scrollLeft = Math.max(0, el.scrollLeft + r.left - box.left - el.clientWidth / 2 + r.width / 2);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current, items.length]);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(120, ref.current.clientWidth - 60), behavior: "smooth" });
  return (
    <div className="chip-rail" data-testid="chip-rail">
      <button type="button" className="icon-btn" onClick={() => page(-1)} disabled={!edge.l} aria-label="이전 항목" data-testid="rail-prev">
        <Icon name="left" />
      </button>
      <div ref={ref} className="chip-rail-track" onScroll={measure} role="tablist">
        {items.map((it) => {
          const on = (current ?? "") === it.key;
          return (
            <Link key={it.key || "_all"} href={it.href} className={`chip${on ? " on" : ""}`} role="tab" aria-selected={on} data-testid="rail-chip" data-key={it.key} scroll={false}>
              {it.label}
              {it.sub !== undefined && <span className="chip-sub">{it.sub}</span>}
            </Link>
          );
        })}
      </div>
      <button type="button" className="icon-btn" onClick={() => page(1)} disabled={!edge.r} aria-label="다음 항목" data-testid="rail-next">
        <Icon name="right" />
      </button>
    </div>
  );
}

/** 단어장 기준 선택 — 바꾸면 ?book= 만 바꿔 같은 화면을 다시 연다 */
export function BookSelect({ books, value }: { books: { id: string; title: string; merged: boolean }[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className="book-select" data-testid="book-select">
      <Icon name="words" size={15} />
      <select
        value={value ?? ""}
        aria-label="단어장"
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          if (e.target.value) p.set("book", e.target.value);
          else p.delete("book");
          router.push(`${pathname}?${p.toString()}`);
        }}
      >
        <option value="">단어장 전체</option>
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
            {b.merged ? " (병합)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
