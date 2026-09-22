/**
 * 최소 데이터 시각화 — 한 색(잉크) + 강조색(주의) 만 쓰는 기하 도형.
 * 모든 값은 도형 옆에 직접 표기하고, 마크에 <title> 툴팁을 둔다.
 */
const INK = "var(--ink)";
const TRACK = "rgba(27,26,24,0.10)";
const ACCENT = "var(--accent)";

export function Ring({ value, size = 96, stroke = 5, color = INK, track = TRACK, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${Math.round(v)}%`}>
        <title>{`${Math.round(v)}%`}</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="tick anim-ring" style={{ ["--c" as string]: c }} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function PulseBars({ values, labels, height = 40, color = INK, dim = "rgba(27,26,24,0.15)" }: { values: number[]; labels?: string[]; height?: number; color?: string; dim?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1" title={`${labels?.[i] ?? i + 1}: ${v}`}>
          <div className="w-[5px] rounded-full tick anim-grow-y" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: v > 0 ? color : dim, minHeight: 4, animationDelay: `${i * 45}ms` }} />
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, color = INK, track = TRACK, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  return (
    <div className="w-full rounded-full" style={{ background: track, height }}>
      <div className="h-full rounded-full tick anim-grow-x" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/** 추이 선: 면적 채움 + 점, 통과 기준선(옵션). 값이 없는 지점은 건너뛴다. */
export function Sparkline({ values, width = 320, height = 72, color = INK, fill = "rgba(27,26,24,0.10)", baseline, accentBelow, min = 0, max = 100, labels, showDots = true, strokeWidth = 2 }: { values: (number | null)[]; width?: number; height?: number; color?: string; fill?: string; baseline?: number; accentBelow?: number; min?: number; max?: number; labels?: string[]; showDots?: boolean; strokeWidth?: number }) {
  const n = values.length;
  const padX = 6;
  const padY = 6;
  const xs = (i: number) => (n <= 1 ? width / 2 : padX + (i * (width - padX * 2)) / (n - 1));
  const ys = (v: number) => padY + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (height - padY * 2);
  const pts = values.map((v, i) => (v === null ? null : [xs(i), ys(v)] as [number, number]));
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  const path = (s: [number, number][]) => s.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = (s: [number, number][]) => `${path(s)} L${s[s.length - 1][0].toFixed(1)},${height - padY} L${s[0][0].toFixed(1)},${height - padY} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="점수 추이">
      {baseline !== undefined && <line x1={padX} x2={width - padX} y1={ys(baseline)} y2={ys(baseline)} stroke="rgba(27,26,24,0.25)" strokeWidth={1} strokeDasharray="3 4" />}
      {segs.map((s, i) => (
        <g key={i}>
          {s.length > 1 && <path d={area(s)} fill={fill} className="anim-fade" style={{ animationDelay: "500ms" }} />}
          {s.length > 1 && <path d={path(s)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="anim-draw" />}
        </g>
      ))}
      {showDots &&
        pts.map((p, i) =>
          p ? (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={3.2} fill={accentBelow !== undefined && values[i]! < accentBelow ? ACCENT : color} stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="anim-pop" style={{ animationDelay: `${200 + (i / Math.max(1, n - 1)) * 900}ms` }}>
                <title>{`${labels?.[i] ?? i + 1}: ${values[i]}`}</title>
              </circle>
            </g>
          ) : null,
        )}
    </svg>
  );
}

/** 가로 막대 목록: 항목명 · 막대 · 값 (그룹 비교) */
export function HBars({ rows, max = 100, accentBelow, hrefFor }: { rows: { key: string; label: string; value: number | null; sub?: string }[]; max?: number; accentBelow?: number; hrefFor?: (key: string) => string }) {
  return (
    <ul className="space-y-2">
      {rows.map((r, idx) => {
        const v = r.value ?? 0;
        const warn = accentBelow !== undefined && r.value !== null && r.value < accentBelow;
        const inner = (
          <>
            <span className="w-[124px] shrink-0 leading-tight" title={r.label}>
              <span className="block truncate text-[13.5px]">{r.label}</span>
              {r.sub && <span className="muted block text-[11px]">{r.sub}</span>}
            </span>
            <span className="h-[8px] flex-1 rounded-full" style={{ background: TRACK }} title={`${r.label}: ${r.value ?? "-"}`}>
              <span className="block h-full rounded-full tick anim-grow-x" style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: warn ? ACCENT : INK, animationDelay: `${idx * 60}ms` }} />
            </span>
            <span className="num-md w-[44px] shrink-0 text-right" style={{ fontSize: 20, color: warn ? ACCENT : undefined }}>
              {r.value ?? "–"}
            </span>
          </>
        );
        return (
          <li key={r.key} className="flex items-center gap-3">
            {hrefFor ? (
              <a href={hrefFor(r.key)} className="flex w-full items-center gap-3 rounded-lg hover:bg-[rgba(255,255,255,0.4)]">
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 세로 막대 (점수 분포 등) */
export function Columns({ bins, height = 96, accentIndexBelow }: { bins: { label: string; value: number }[]; height?: number; accentIndexBelow?: number }) {
  const max = Math.max(1, ...bins.map((b) => b.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bins.map((b, i) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1" title={`${b.label}: ${b.value}`}>
          <span className="digital" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {b.value || ""}
          </span>
          <div className="w-full max-w-[22px] rounded-full tick anim-grow-y" style={{ height: Math.max(4, (b.value / max) * (height - 34)), background: accentIndexBelow !== undefined && i < accentIndexBelow ? ACCENT : INK, animationDelay: `${i * 50}ms` }} />
          <span className="lbl" style={{ fontSize: 9.5 }}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 도넛: 통과 / 재시험 / 미응시 등 상태 비율 (상태색: 잉크·강조·트랙) */
export function Donut({ parts, size = 108, stroke = 14 }: { parts: { label: string; value: number; color: string }[]; size?: number; stroke?: number }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
        {parts.map((p) => {
          const len = (p.value / total) * c;
          const gap = parts.length > 1 ? 2 : 0;
          const el = (
            <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`} strokeDashoffset={-acc} className="tick anim-donut" style={{ ["--c" as string]: c }}>
              <title>{`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
      </svg>
      <ul className="space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span style={{ color: "var(--ink-2)" }}>{p.label}</span>
            <span className="num-md" style={{ fontSize: 18 }}>
              {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 히트맵 셀: 값(null = 미응시) + 눌렀을 때 이동할 링크(해당 시험 결과) */
export type HeatCell = { v: number | null; href?: string; title?: string };

/** 히트맵: 행(학생) × 열(주) — 빈 칸 = 미응시, 진하기 = 점수 (단일 색 순차). 셀을 누르면 그 시험 결과로 이동 */
export function Heatmap({ rows, cols, cell = 14, gap = 3, hrefFor }: { rows: { key: string; label: string; cells: HeatCell[] }[]; cols: string[]; cell?: number; gap?: number; hrefFor?: (key: string) => string }) {
  const shade = (v: number | null) => {
    if (v === null) return "rgba(27,26,24,0.06)";
    if (v < 60) return "rgba(232,67,26,0.85)";
    const t = Math.min(1, Math.max(0, (v - 60) / 40));
    return `rgba(27,26,24,${(0.25 + t * 0.7).toFixed(2)})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: `${gap}px` }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="lbl text-center" style={{ fontSize: 9, minWidth: cell }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.key}>
              <td className="pr-2 text-[12px] whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                {hrefFor ? (
                  <a href={hrefFor(r.key)} className="hover:underline">
                    {r.label}
                  </a>
                ) : (
                  r.label
                )}
              </td>
              {r.cells.map((c, i) => {
                const title = c.title ?? `${r.label} · ${cols[i]}: ${c.v === null ? "미응시" : c.v}`;
                const style = { width: cell, height: cell, borderRadius: 3, background: shade(c.v), animationDelay: `${Math.min(600, (ri * cols.length + i) * 12)}ms` };
                return (
                  <td key={i} style={{ padding: 0 }}>
                    {c.href ? (
                      <a href={c.href} title={`${title} · 결과 보기`} aria-label={`${title} 결과 보기`} className="anim-fade block transition-transform hover:scale-125" style={style} />
                    ) : (
                      <div title={title} className="anim-fade" style={style} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
