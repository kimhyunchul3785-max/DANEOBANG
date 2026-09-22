"use client";
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * 롤링 숫자: 마운트될 때 0 → value 로 감속하며 올라간다 (새 탭·새로고침·화면 전환마다 재생).
 * value 가 null 이면 placeholder 표시. 서버 렌더는 0 으로 시작해 하이드레이션 직후 굴러간다.
 */
export function CountUp({ value, duration = 900, decimals = 0, prefix = "", suffix = "", placeholder = "--", className, style }: { value: number | null | undefined; duration?: number; decimals?: number; prefix?: string; suffix?: string; placeholder?: string; className?: string; style?: React.CSSProperties }) {
  const target = value ?? null;
  const [shown, setShown] = useState<number>(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    if (reduced()) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    const from = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setShown(from + (target - from) * e);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);
  if (target === null) return <span className={className} style={style}>{placeholder}</span>;
  const text = decimals ? shown.toFixed(decimals) : Math.round(shown).toLocaleString();
  return (
    <span className={className} style={style} data-value={target} aria-label={`${prefix}${target}${suffix}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/**
 * 자동 전환 목록: 항목이 pageSize 보다 많으면 interval 마다 다음 묶음으로 넘어간다. 호버 중에는 멈춘다.
 */
export function Rotator<T>({ items, pageSize = 6, interval = 6000, render, empty }: { items: T[]; pageSize?: number; interval?: number; render: (item: T, i: number) => React.ReactNode; empty?: React.ReactNode }) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (pages <= 1 || paused) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), interval);
    return () => clearInterval(t);
  }, [pages, paused, interval]);
  if (items.length === 0) return <>{empty}</>;
  const slice = items.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ul key={page}>
        {slice.map((it, i) => (
          <li key={i} className="anim-slide" style={{ animationDelay: `${i * 40}ms` }}>
            {render(it, page * pageSize + i)}
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1.5" role="tablist" aria-label="페이지">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === page} aria-label={`${i + 1}페이지`} onClick={() => setPage(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === page ? 18 : 6, background: i === page ? "var(--ink)" : "rgba(27,26,24,0.18)" }} />
            ))}
          </div>
          <span className="digital" style={{ color: "var(--ink-3)", fontSize: 12 }}>
            {String(page + 1).padStart(2, "0")}/{String(pages).padStart(2, "0")}
            {paused ? " ▮▮" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 정렬 헤더: 클릭하면 대상 컨테이너의 자식들을 data-<attr> 숫자 기준으로 오름차순 → 다시 클릭하면 내림차순.
 * 서버 렌더된 표/목록에 그대로 붙일 수 있다.
 */
export function SortHeader({ target, attr, children, defaultDir }: { target: string; attr: string; children: React.ReactNode; defaultDir?: "asc" | "desc" }) {
  const [dir, setDir] = useState<"asc" | "desc" | null>(null);
  const sort = () => {
    const next: "asc" | "desc" = dir === null ? (defaultDir ?? "asc") : dir === "asc" ? "desc" : "asc";
    const box = document.querySelector(target);
    if (!box) return;
    const rows = Array.from(box.children).filter((el) => el.hasAttribute(`data-${attr}`));
    const val = (el: Element) => {
      const raw = el.getAttribute(`data-${attr}`);
      const n = raw === null || raw === "" ? NaN : Number(raw);
      return Number.isNaN(n) ? (next === "asc" ? Infinity : -Infinity) : n;
    };
    rows.sort((a, b) => (next === "asc" ? val(a) - val(b) : val(b) - val(a)));
    for (const r of rows) box.appendChild(r);
    rows.forEach((r, i) => {
      r.classList.remove("anim-fade-up");
      void (r as HTMLElement).offsetWidth;
      r.classList.add("anim-fade-up");
      (r as HTMLElement).style.animationDelay = `${Math.min(i, 12) * 22}ms`;
    });
    setDir(next);
  };
  return (
    <button type="button" className={`sort-h${dir ? " on" : ""}`} onClick={sort} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"} title="클릭: 오름차순 · 다시 클릭: 내림차순">
      {children}
      <span className="sort-arrow">{dir === "desc" ? "▼" : "▲"}</span>
    </button>
  );
}
