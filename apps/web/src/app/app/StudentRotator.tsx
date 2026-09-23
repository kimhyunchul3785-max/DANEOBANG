"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { id: string; name: string; className: string | null; a: number | null; delta: number | null; last: number | null };

/**
 * 담당 학생 요약 목록: pageSize 명씩 보여주고, 학생이 많으면 interval 마다 다음 묶음으로 자동 전환.
 * 호버 중에는 멈추고 점을 눌러 직접 넘길 수 있다.
 */
export function StudentRotator({ rows, pageSize = 6, interval = 6000 }: { rows: Row[]; pageSize?: number; interval?: number }) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (pages <= 1 || paused) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), interval);
    return () => clearInterval(t);
  }, [pages, paused, interval]);
  if (rows.length === 0) return <p className="muted">담당 학생이 없습니다. 학원장이 담당을 지정하면 여기에 보입니다.</p>;
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-testid="student-rotator">
      <ul key={page}>
        {slice.map((r, i) => (
          <li key={r.id} className="row anim-slide" style={{ animationDelay: `${i * 45}ms` }}>
            <Link href={`/app/students/${r.id}`} className="min-w-0 truncate text-[14px] hover:underline">
              {r.name} <span className="muted">· {r.className ?? "반 없음"}</span>
            </Link>
            <span className="flex items-center gap-3">
              <span className="digital" style={{ color: r.delta !== null && r.delta < 0 ? "var(--accent)" : "var(--ink-3)" }}>
                {r.delta === null ? "··" : r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : "="}
              </span>
              <span className="num-md" style={{ fontSize: 20, color: r.a !== null && r.a < 70 ? "var(--accent)" : undefined }}>
                {r.a ?? "–"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1.5" role="tablist" aria-label="학생 목록 페이지">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === page} aria-label={`${i + 1}페이지`} onClick={() => setPage(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === page ? 18 : 6, background: i === page ? "var(--ink)" : "rgba(27,26,24,0.18)" }} />
            ))}
          </div>
          <span className="digital" style={{ color: "var(--ink-3)", fontSize: 12 }}>
            {String(page * pageSize + 1).padStart(2, "0")}–{String(Math.min(rows.length, (page + 1) * pageSize)).padStart(2, "0")} / {rows.length}
            {paused ? " ▮▮" : " ▶"}
          </span>
        </div>
      )}
    </div>
  );
}
