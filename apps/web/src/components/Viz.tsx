/**
 * 단어방 데이터 시각화 (v5.8) — 잉크 한 색 + 위험에만 강조색. 의존성 없음, 서버·클라이언트 어디서나 렌더.
 *
 *   TrendChart      상세 추이 (학생·반 화면). y 라벨 · 통과 기준선 · 끝 값 · hover 툴팁
 *   MicroTrend      카드·표 안의 보조 추이. 축·면·중간 점 없음, 마지막 점만
 *   RankBars        반·선생님 비교. 이름과 값이 한 줄, 막대는 그 아래 (좁은 폭에서는 막대 없이)
 *   Distribution    점수 구간 분포 (5구간). 세로 막대
 *   CompositionBar  통과 · 미달 · 미응시 같은 구성비. 100% 가로 누적 막대 (도넛 대체)
 *   Heatmap         학생 × 주. 구간 색 4단계 + 미응시 빈 칸
 *   Meter · Ring    진행률
 *
 * 선 차트는 선(path)만 SVG 로 늘리고(non-scaling-stroke), 점·라벨·툴팁은 HTML 로 % 위치에 둔다.
 * → 컨테이너 폭이 바뀌어도 점이 타원으로 찌그러지지 않고, 선 굵기는 2px 그대로다.
 * 강조색(--accent)은 '미달 · 위험' 에만 쓴다. 일반 데이터는 잉크.
 */
import type { CSSProperties, ReactNode } from "react";

const INK = "var(--ink)";
const TRACK = "rgba(27,26,24,0.10)";
const ACCENT = "var(--accent)";

// ───────────────── 선 차트 공통 ─────────────────

type Pt = [number, number];

/** 단조 3차 보간 (Steffen · d3 curveMonotoneX 와 같은 식) — 값이 없는 곳에서 튀어 오르지 않는 완만한 곡선. 축 배율에 불변이라 늘려도 모양이 같다 */
function monotonePath(p: Pt[]): string {
  const n = p.length;
  const f = (v: number) => +v.toFixed(2);
  if (n === 0) return "";
  if (n === 1) return `M${f(p[0][0])},${f(p[0][1])}`;
  if (n === 2) return `M${f(p[0][0])},${f(p[0][1])}L${f(p[1][0])},${f(p[1][1])}`;
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = p[i + 1][0] - p[i][0];
    s[i] = h[i] ? (p[i + 1][1] - p[i][1]) / h[i] : 0;
  }
  const sign = (x: number) => (x < 0 ? -1 : 1);
  const t: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const q = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    t[i] = (sign(s[i - 1]) + sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(q)) || 0;
  }
  t[0] = h[0] ? (3 * s[0] - t[1]) / 2 : t[1];
  t[n - 1] = h[n - 2] ? (3 * s[n - 2] - t[n - 2]) / 2 : t[n - 2];
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = h[i] / 3;
    d += `C${f(p[i][0] + dx)},${f(p[i][1] + t[i] * dx)},${f(p[i + 1][0] - dx)},${f(p[i + 1][1] - t[i + 1] * dx)},${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return d;
}

/** 값 없는 지점(null)에서 끊은 구간들 */
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  const out: { pts: Pt[]; idx: number[] }[] = [];
  let cur: { pts: Pt[]; idx: number[] } = { pts: [], idx: [] };
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.pts.length) out.push(cur);
      cur = { pts: [], idx: [] };
    } else {
      cur.pts.push([x(i), y(v)]);
      cur.idx.push(i);
    }
  });
  if (cur.pts.length) out.push(cur);
  return out;
}

/**
 * 점수 축: 데이터와 기준선을 담는 10 단위 범위. 위는 100, 아래는 여유 8점 —
 * 단, 최소 40점 폭을 둔다 (90 ↔ 100 한 번 오간 것이 절벽처럼 보이지 않게)
 */
function scoreDomain(vals: number[], line?: number): [number, number] {
  const all = line !== undefined ? [...vals, line] : vals;
  if (!all.length) return [0, 100];
  const lo = Math.max(0, Math.floor((Math.min(...all) - 8) / 10) * 10);
  const hi = Math.max(100, Math.ceil(Math.max(...all) / 10) * 10);
  return [Math.max(0, Math.min(lo, hi - 40)), hi];
}

/** 보조 추이용 좁은 범위 — 모양만 보되, 작은 흔들림이 급변처럼 보이지 않게 최소 16점 폭 */
function tightDomain(vals: number[], line?: number): [number, number] {
  const all = line !== undefined ? [...vals, line] : vals;
  if (!all.length) return [0, 100];
  let lo = Math.min(...all) - 4;
  let hi = Math.max(...all) + 4;
  if (hi - lo < 16) {
    const c = (hi + lo) / 2;
    lo = c - 8;
    hi = c + 8;
  }
  return [Math.max(0, lo), Math.min(100, hi)];
}

function lineGeom(values: (number | null)[], domain: [number, number]) {
  const n = values.length;
  const [lo, hi] = domain;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * 100;
  return { n, x, y, segs: segments(values, x, y) };
}

const pct = (v: number) => `${+v.toFixed(3)}%`;

/** 선 + (선택) 옅은 면. viewBox 0–100 을 영역에 맞춰 늘리되 선 굵기는 화면 기준 */
function LineLayer({ segs, color, area, strokeWidth }: { segs: { pts: Pt[] }[]; color: string; area: boolean; strokeWidth: number }) {
  return (
    <svg className="viz-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {area &&
        segs
          .filter((s) => s.pts.length > 1)
          .map((s, i) => <path key={`a${i}`} d={`${monotonePath(s.pts)}L${s.pts[s.pts.length - 1][0]},100L${s.pts[0][0]},100Z`} fill="var(--ink)" fillOpacity={0.03} stroke="none" />)}
      {segs
        .filter((s) => s.pts.length > 1)
        .map((s, i) => (
          <path key={i} d={monotonePath(s.pts)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
    </svg>
  );
}

/** hover·포커스 열: 가장 가까운 x 에 세로 헤어라인 + 점 + 툴팁 */
function HoverCols({ values, labels, x, y, unit, tips, focusable, warnBelow }: { values: (number | null)[]; labels?: string[]; x: (i: number) => number; y: (v: number) => number; unit: string; tips: boolean; focusable: boolean; warnBelow?: number }) {
  const n = values.length;
  const w = n <= 1 ? 100 : 100 / (n - 1);
  return (
    <>
      {values.map((v, i) => {
        const text = `${labels?.[i] ?? i + 1} · ${v === null ? "응시 없음" : `${Math.round(v)}${unit}`}`;
        const edge = n > 2 && i < n / 4 ? "l" : n > 2 && i > (3 * n) / 4 ? "r" : "c";
        return (
          <span key={i} className="viz-col" data-edge={edge} style={{ left: pct(x(i) - w / 2), width: pct(w) }} tabIndex={focusable ? 0 : undefined} aria-label={focusable ? text : undefined} title={tips ? undefined : text}>
            <i className="viz-x" />
            {v !== null && <i className={`viz-hdot${warnBelow !== undefined && v < warnBelow ? " warn" : ""}`} style={{ top: pct(y(v)) }} />}
            {tips && (
              <span className="viz-tip" role="tooltip">
                <b>{v === null ? "–" : Math.round(v)}</b>
                {v !== null && unit}
                <em>{labels?.[i] ?? ""}</em>
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/** 끝·위험 점: 기본은 마지막 점 하나. 기준 미달 점은 드물 때(3개 이하)만 찍는다 — 대부분이 미달이면 기준선이 이미 말해 준다 */
function Dots({ values, x, y, warnBelow, segs }: { values: (number | null)[]; x: (i: number) => number; y: (v: number) => number; warnBelow?: number; segs: { idx: number[] }[] }) {
  const lastIdx = values.reduce<number>((m, v, i) => (v !== null ? i : m), -1);
  const below = warnBelow === undefined ? [] : values.map((v, i) => (v !== null && v < warnBelow ? i : -1)).filter((i) => i >= 0);
  const show = new Set<number>(below.length <= 3 ? below : []);
  if (lastIdx >= 0) show.add(lastIdx);
  // 앞뒤가 비어 선이 안 그려지는 외딴 점도 보이게
  for (const s of segs) if (s.idx.length === 1) show.add(s.idx[0]);
  return (
    <>
      {[...show].map((i) => {
        const v = values[i]!;
        const warn = warnBelow !== undefined && v < warnBelow;
        return <i key={i} className={`viz-dot${warn ? " warn" : ""}${i === lastIdx ? " last" : " sm"}`} style={{ left: pct(x(i)), top: pct(y(v)) }} />;
      })}
    </>
  );
}

/**
 * 상세 추이 — 학생·반·그룹 화면의 주인공 차트. height="fill" 이면 부모(flex 열)의 남는 높이를 채운다(최소 minHeight).
 * y 는 데이터에 맞춘 10 단위 범위(100 · 기준 · 바닥만 라벨), x 는 처음 · 중간 · 끝 라벨, 끝 값은 선 오른쪽에 직접 표기.
 */
export function TrendChart({ values, labels, passLine, height = 180, minHeight = 160, domain, unit = "점", lastLabel, ariaLabel = "점수 추이" }: { values: (number | null)[]; labels?: string[]; passLine?: number; height?: number | "fill"; minHeight?: number; domain?: [number, number]; unit?: string; lastLabel?: string; ariaLabel?: string }) {
  const fill = height === "fill";
  const vals = values.filter((v): v is number => v !== null);
  const dom = domain ?? scoreDomain(vals, passLine);
  const { n, x, y, segs } = lineGeom(values, dom);
  const lastIdx = values.reduce<number>((m, v, i) => (v !== null ? i : m), -1);
  const last = lastIdx >= 0 ? values[lastIdx]! : null;
  const lastWarn = last !== null && passLine !== undefined && last < passLine;
  const ticks = [dom[1], ...(passLine !== undefined && passLine > dom[0] && passLine < dom[1] ? [passLine] : []), dom[0]];
  // x 라벨: 처음 · 중간(들) · 끝 — 폭이 좁아도 겹치지 않게 최대 5개
  const xl = labels && labels.length ? pickTicks(labels.length, labels.length > 8 ? 5 : 3) : [];
  const summary = `${ariaLabel}: ${vals.length ? `${Math.round(vals[0])}${unit}에서 ${Math.round(vals[vals.length - 1])}${unit}` : "기록 없음"}${passLine !== undefined ? `, 통과 기준 ${passLine}` : ""}`;
  return (
    <figure className={`viz-trend${fill ? " fill" : ""}`} role="group" aria-label={summary}>
      <div className="viz-plot" style={fill ? { minHeight } : { height }}>
        <div className="viz-area">
          {ticks.map((t) => (
            <span key={t} className={`viz-ylab${t === passLine ? " pass" : ""}`} style={{ top: pct(y(t)) }}>
              {t}
            </span>
          ))}
          <i className="viz-grid" style={{ top: "0%" }} />
          <i className="viz-grid base" style={{ top: "100%" }} />
          {passLine !== undefined && passLine > dom[0] && passLine < dom[1] && <i className="viz-pass" style={{ top: pct(y(passLine)) }} />}
          <LineLayer segs={segs} color={INK} area strokeWidth={2} />
          <Dots values={values} x={x} y={y} warnBelow={passLine} segs={segs} />
          {last !== null && (
            <span className="viz-end" style={{ left: pct(x(lastIdx)), top: pct(y(last)), color: lastWarn ? ACCENT : undefined }}>
              {Math.round(last)}
            </span>
          )}
          <HoverCols values={values} labels={labels} x={x} y={y} unit={unit} tips focusable warnBelow={passLine} />
        </div>
      </div>
      {xl.length > 0 && (
        <div className="viz-xaxis">
          {xl.map((i, j) => (
            <span key={i} style={{ left: pct(x(i)) }} data-edge={i === 0 ? "l" : i === n - 1 ? "r" : "c"} className={j % 2 ? "opt" : undefined}>
              {i === n - 1 && lastLabel ? lastLabel : labels![i]}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

function pickTicks(n: number, k: number): number[] {
  if (n <= k) return Array.from({ length: n }, (_, i) => i);
  return Array.from(new Set(Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1)))));
}

/**
 * 보조 추이 — 카드·표 안에서 방향만 보여 준다. 축 · 면 · 중간 점 없음, 마지막 점만.
 * 같은 표 안의 여러 줄을 비교하려면 domain 을 같이 넘긴다.
 */
export function MicroTrend({ values, labels, height = 36, baseline, domain, warn, unit = "점", tips = false, ariaLabel = "추이" }: { values: (number | null)[]; labels?: string[]; height?: number; baseline?: number; domain?: [number, number]; warn?: boolean; unit?: string; tips?: boolean; ariaLabel?: string }) {
  const vals = values.filter((v): v is number => v !== null);
  const dom = domain ?? tightDomain(vals, baseline);
  const { x, y, segs } = lineGeom(values, dom);
  const color = warn ? ACCENT : INK;
  const lastIdx = values.reduce<number>((m, v, i) => (v !== null ? i : m), -1);
  return (
    <figure className="viz-trend micro" role="img" aria-label={`${ariaLabel}: ${vals.map((v) => Math.round(v)).join(", ") || "기록 없음"}`}>
      <div className="viz-plot" style={{ height }}>
        <div className="viz-area">
          {baseline !== undefined && baseline > dom[0] && baseline < dom[1] && <i className="viz-pass faint" style={{ top: pct(y(baseline)) }} />}
          <LineLayer segs={segs} color={color} area={false} strokeWidth={1.75} />
          {lastIdx >= 0 && <i className={`viz-dot micro${warn ? " warn" : ""}`} style={{ left: pct(x(lastIdx)), top: pct(y(values[lastIdx]!)) }} />}
          {segs
            .filter((s) => s.idx.length === 1 && s.idx[0] !== lastIdx)
            .map((s) => (
              <i key={s.idx[0]} className={`viz-dot micro${warn ? " warn" : ""}`} style={{ left: pct(x(s.idx[0])), top: pct(y(values[s.idx[0]]!)) }} />
            ))}
          <HoverCols values={values} labels={labels} x={x} y={y} unit={unit} tips={tips} focusable={false} />
        </div>
      </div>
    </figure>
  );
}

// ───────────────── 막대 ─────────────────

export type RankRow = { key: string; label: string; value: number | null; sub?: string; href?: string; delta?: number | null };

/**
 * 비교 막대 — 이름 · 값이 한 줄(값은 끝에 크게), 막대는 그 아래 6px. 행 높이 약 44px.
 * 좁은 컨테이너(< 320px, 휴대폰)에서는 막대를 빼고 이름 · 값만.
 */
export function RankBars({ rows, max = 100, warnBelow, limit, moreHref }: { rows: RankRow[]; max?: number; warnBelow?: number; limit?: number; moreHref?: string }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="@container">
      <ul className="viz-rank">
        {shown.map((r, idx) => {
          const warn = warnBelow !== undefined && r.value !== null && r.value < warnBelow;
          const inner = (
            <>
              <span className="viz-rank-head">
                <span className="viz-rank-label" title={r.label}>
                  {r.label}
                  {r.sub && <small>{r.sub}</small>}
                </span>
                <span className="viz-rank-val">
                  {r.delta !== undefined && r.delta !== null && r.delta !== 0 && (
                    <em style={{ color: r.delta < 0 ? ACCENT : undefined }}>
                      {r.delta > 0 ? "▲" : "▼"}
                      {Math.abs(r.delta)}
                    </em>
                  )}
                  <b style={{ color: warn ? ACCENT : undefined }}>{r.value ?? "–"}</b>
                </span>
              </span>
              <span className="viz-rank-bar hidden @xs:block" aria-hidden>
                {r.value !== null && <i className="anim-grow-x" style={{ width: pct(Math.max(0, Math.min(100, (r.value / max) * 100))), background: warn ? ACCENT : INK, animationDelay: `${idx * 50}ms` }} />}
              </span>
            </>
          );
          return <li key={r.key}>{r.href ? <a href={r.href}>{inner}</a> : <div>{inner}</div>}</li>;
        })}
      </ul>
      {limit && rows.length > limit && (
        <div className="muted mt-1 text-[12.5px]">
          {moreHref ? (
            <a href={moreHref} className="hover:underline">
              외 {rows.length - limit}개 →
            </a>
          ) : (
            `외 ${rows.length - limit}개`
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 점수 구간 분포 — 세로 막대(최대 24px 폭, 끝 4px 둥글게, 바닥은 각지게), 개수는 막대 위, 구간 라벨 12px.
 * warnBins: 앞에서부터 몇 구간을 '위험' 으로 칠할지 (기본 1 = 60점 미만)
 */
export function Distribution({ bins, height = 120, warnBins = 1, unit = "건" }: { bins: { label: string; value: number }[]; height?: number; warnBins?: number; unit?: string }) {
  const max = Math.max(1, ...bins.map((b) => b.value));
  const total = bins.reduce((s, b) => s + b.value, 0);
  const plot = height - 20; // 막대 위 숫자 줄
  return (
    <figure className="viz-dist" role="img" aria-label={bins.map((b) => `${b.label} ${b.value}${unit}`).join(", ")}>
      <div className="viz-dist-plot" style={{ height }}>
        {bins.map((b, i) => (
          <span key={b.label} className="viz-dist-col" title={`${b.label}: ${b.value}${unit}${total ? ` (${Math.round((b.value / total) * 100)}%)` : ""}`}>
            {b.value > 0 && <span className="viz-dist-n">{b.value}</span>}
            <i className="anim-grow-y" style={{ height: b.value ? Math.max(3, (b.value / max) * plot) : 0, background: i < warnBins ? ACCENT : INK, animationDelay: `${i * 40}ms` }} />
          </span>
        ))}
      </div>
      <div className="viz-dist-x">
        {bins.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
    </figure>
  );
}

export type CompositionPart = { label: string; value: number; tone: "ink" | "accent" | "muted"; href?: string };
const TONE: Record<CompositionPart["tone"], string> = { ink: INK, accent: ACCENT, muted: "#d6d3cd" };

/**
 * 구성비 — 100% 가로 누적 막대(10px, 조각 사이 2px 표면 틈) + 아래 범례(색 조각 · 이름 · 개수).
 * 원형 차트 대신: 비율과 개수를 한 줄로 빨리 읽는다.
 */
export function CompositionBar({ parts, unit = "", height = 10 }: { parts: CompositionPart[]; unit?: string; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="viz-comp">
      <div className="viz-comp-bar" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}${unit}`).join(", ")}>
        {total === 0 ? (
          <i style={{ flex: 1, background: TRACK }} />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => <i key={p.label} className="anim-fade" style={{ flex: `${p.value} 1 0`, background: TONE[p.tone] }} title={`${p.label} ${p.value}${unit} (${Math.round((p.value / total) * 100)}%)`} />)
        )}
      </div>
      <ul className="viz-comp-legend">
        {parts.map((p) => {
          const body = (
            <>
              <i style={{ background: TONE[p.tone] }} />
              {p.label}
              <b>
                {p.value}
                {unit && <small>{unit}</small>}
              </b>
            </>
          );
          return <li key={p.label}>{p.href ? <a href={p.href}>{body}</a> : body}</li>;
        })}
      </ul>
    </div>
  );
}

// ───────────────── 히트맵 ─────────────────

/** 히트맵 셀: 값(null = 미응시) + 눌렀을 때 이동할 링크(해당 시험 결과) */
export type HeatCell = { v: number | null; href?: string; title?: string };

/** 구간 색 (연속 농도 대신 4단계 — 비슷한 점수가 구별되게). 60 미만만 강조색 */
export const HEAT_BANDS: { label: string; color: string; test: (v: number) => boolean }[] = [
  { label: "60 미만", color: "var(--accent)", test: (v) => v < 60 },
  { label: "60–79", color: "#b3aea5", test: (v) => v >= 60 && v < 80 },
  { label: "80–89", color: "#7a766e", test: (v) => v >= 80 && v < 90 },
  { label: "90+", color: "#2b2a27", test: (v) => v >= 90 },
];
const heatColor = (v: number | null) => (v === null ? null : (HEAT_BANDS.find((b) => b.test(v)) ?? HEAT_BANDS[3]).color);

/** 히트맵: 행(학생) × 열(주). 셀 18px · 틈 4px · 모서리 4px. 빈 칸 = 미응시. 셀을 누르면 그 시험 결과로 */
export function Heatmap({ rows, cols, cell = 18, gap = 4, hrefFor, legend = true }: { rows: { key: string; label: string; cells: HeatCell[] }[]; cols: string[]; cell?: number; gap?: number; hrefFor?: (key: string) => string; legend?: boolean }) {
  const every = Math.max(1, Math.ceil(30 / (cell + gap))); // 라벨 폭 약 30px 마다 하나
  return (
    <div className="viz-heat">
      <div className="overflow-x-auto">
        <table style={{ borderSpacing: `${gap}px`, borderCollapse: "separate", ["--cell" as string]: `${cell}px` }}>
          <thead>
            <tr>
              <th />
              {cols.map((c, i) => (
                <th key={i} style={{ minWidth: cell }}>
                  <span>{(cols.length - 1 - i) % every === 0 ? c : ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="viz-heat-name">{hrefFor ? <a href={hrefFor(r.key)}>{r.label}</a> : r.label}</td>
                {r.cells.map((c, i) => {
                  const title = c.title ?? `${r.label} · ${cols[i]}: ${c.v === null ? "미응시" : Math.round(c.v)}`;
                  const bg = heatColor(c.v);
                  const style: CSSProperties = { width: cell, height: cell, background: bg ?? undefined };
                  const cls = `viz-cell${bg ? "" : " empty"}`;
                  return (
                    <td key={i} style={{ padding: 0 }}>
                      {c.href ? <a href={c.href} title={`${title} · 결과 보기`} aria-label={`${title} 결과 보기`} className={cls} style={style} /> : <span title={title} className={cls} style={style} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend && (
        <div className="viz-heat-legend">
          <span>
            <i className="viz-cell empty" />
            미응시
          </span>
          {HEAT_BANDS.map((b) => (
            <span key={b.label}>
              <i className="viz-cell" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────── 진행률 ─────────────────

export function Meter({ value, color = INK, track = TRACK, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  return (
    <div className="w-full rounded-full" style={{ background: track, height }}>
      <div className="h-full rounded-full tick anim-grow-x" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/** 원형 진행률 — 종이 시험 QR 결과 화면에서만 쓴다 (대시보드에는 쓰지 않는다) */
export function Ring({ value, size = 96, stroke = 5, color = INK, track = TRACK, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
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
