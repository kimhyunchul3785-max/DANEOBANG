"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { CountUp } from "@/components/Motion";
import { Icon } from "@/components/Icon";
import { TrendChart, RankBars, Distribution, CompositionBar, Heatmap, type HeatCell } from "@/components/Viz";
import { toast } from "@/components/Toaster";
import { WIDGETS, DEFAULT_LAYOUT, MOBILE_ORDER, KPI_WIDGETS, COLS, ROW_PX, GAP_PX, compact, place, fitCols, type LayoutItem, type WidgetType } from "./widgets";
import { saveDashboardLayoutAction } from "./layout-actions";

/** 대시보드 데이터 (서버에서 계산해 직렬화) */
export type DashboardData = {
  rangeLabel: string;
  groupLabel: string;
  weeks: string[];
  passLine: number;
  warnLine: number;
  students: number;
  kpi: { avg: number | null; avgPrev: number | null; pass: number | null; passPrev: number | null; graded: number; retake: number; retakeNotIssued: number; missed: number };
  groups: { key: string; label: string; avg: number | null; count: number; delta: number | null; href: string }[];
  weekRows: { label: string; value: number | null; count: number }[];
  isWeekGroup: boolean;
  trend: (number | null)[];
  bins: { label: string; value: number }[];
  donut: { pass: number; fail: number; missed: number };
  heat: { id: string; name: string; cells: HeatCell[] }[];
  watch: { id: string; name: string; className: string | null; reason: string; avg: number | null; retake: number }[];
  recent: { examId: string; title: string; avg: number | null; n: number; passRate: number | null; at: string; isRetake: boolean }[];
};

const isKpi = (i: WidgetType) => KPI_WIDGETS.includes(i);

/**
 * 성적 요약 보드.
 * - 보기(기본): 완성된 대시보드처럼 — 숫자 위젯은 한 표면의 띠로 합치고, 카드 높이는 내용에 맞춘다(같은 줄끼리는 높이를 맞춘다).
 * - 레이아웃 편집(⋯ 메뉴): 12열 그리드가 드러나고 머리를 끌어 옮기기 · 모서리로 크기 조절 · ✕ 빼기 · 넣기.
 */
export function WidgetBoard({ data, initialLayout, header }: { data: DashboardData; initialLayout: LayoutItem[]; header?: ReactNode }) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => compact(initialLayout));
  const [edit, setEdit] = useState(false);
  const [menu, setMenu] = useState(false);
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [menu]);

  // 보드 폭 기준 열 수: 휴대폰 1열 · 태블릿 6열 · 데스크톱(보드 900px 이상) 12열
  const cols = width === 0 ? COLS : width < 560 ? 1 : width < 900 ? 6 : COLS;
  const colW = cols === 1 ? width : (width - GAP_PX * (cols - 1)) / cols;
  const canEdit = cols === COLS;
  const editing = edit && canEdit;

  const persist = useCallback((next: LayoutItem[] | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDashboardLayoutAction(next ? JSON.stringify(next) : null).then((r) => {
        if (!r.ok) toast("배치를 저장하지 못했습니다.", false);
      });
    }, 500);
  }, []);
  const commit = (next: LayoutItem[]) => {
    const c = compact(next);
    setLayout(c);
    persist(c);
  };

  // ── 드래그 / 리사이즈 (포인터 이벤트, 편집 모드에서만)
  const drag = useRef<{ id: WidgetType; kind: "move" | "resize"; startX: number; startY: number; orig: LayoutItem; startLayout: LayoutItem[] } | null>(null);
  const [active, setActive] = useState<WidgetType | null>(null);
  const onPointerDown = (e: React.PointerEvent, item: LayoutItem, kind: "move" | "resize") => {
    if (!editing) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: item.i, kind, startX: e.clientX, startY: e.clientY, orig: item, startLayout: layout };
    setActive(item.i);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / (colW + GAP_PX);
    const dy = (e.clientY - d.startY) / (ROW_PX + GAP_PX);
    const def = WIDGETS[d.id];
    let moved: LayoutItem;
    if (d.kind === "move") moved = { ...d.orig, x: Math.round(d.orig.x + dx), y: Math.round(d.orig.y + dy) };
    else moved = { ...d.orig, w: Math.max(def.minW, Math.min(COLS - d.orig.x, Math.round(d.orig.w + dx))), h: Math.max(def.minH, Math.min(20, Math.round(d.orig.h + dy))) };
    const cur = layout.find((l) => l.i === d.id);
    if (cur && cur.x === moved.x && cur.y === moved.y && cur.w === moved.w && cur.h === moved.h) return;
    setLayout(place(d.startLayout, moved));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setActive(null);
    commit(layout);
  };

  const remove = (id: WidgetType) => commit(layout.filter((l) => l.i !== id));
  const add = (id: WidgetType) => {
    const def = WIDGETS[id];
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    commit([...layout, { i: id, x: 0, y: maxY, w: def.w, h: def.h }]);
  };
  const reset = () => {
    setLayout(compact(DEFAULT_LAYOUT));
    persist(null);
  };
  const missing = (Object.keys(WIDGETS) as WidgetType[]).filter((k) => !layout.some((l) => l.i === k));

  // 보기 모드 배치: 태블릿은 6열로 다시 맞추고, 휴대폰은 한 줄로 쌓는다
  const viewLayout = useMemo(() => {
    if (cols === COLS) return layout;
    if (cols !== 1) return fitCols(layout, cols);
    let y = 0;
    return [...layout].sort((a, b) => MOBILE_ORDER.indexOf(a.i) - MOBILE_ORDER.indexOf(b.i)).map((l) => ({ ...l, x: 0, w: 1, y: y++, h: 1 }));
  }, [layout, cols]);
  const units = useMemo(() => viewUnits(viewLayout, cols), [viewLayout, cols]);
  const totalRows = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);

  return (
    <div data-testid="widget-board" data-edit={editing ? "1" : "0"} data-cols={cols}>
      <div className="relative">
        <Fragment key="header">{header}</Fragment>
        {/* 레이아웃 편집은 ⋯ 뒤로 — 넓은 화면에서만 */}
        {canEdit && !editing && (
          <div ref={menuRef} className="absolute right-0 top-0 z-20">
            <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="대시보드 메뉴" onClick={() => setMenu(!menu)} data-testid="board-menu">
              <Icon name="more" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-1 w-48 rounded-xl p-1.5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-[var(--fill)]"
                  onClick={() => {
                    setMenu(false);
                    setEdit(true);
                  }}
                  data-testid="widgets-edit"
                >
                  <Icon name="pencil" size={15} />
                  레이아웃 편집
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-[var(--fill)]"
                  onClick={() => {
                    setMenu(false);
                    reset();
                  }}
                  data-testid="widgets-reset-menu"
                >
                  <Icon name="restore" size={15} />
                  기본 배치로
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="card-sm mb-3 flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid="widget-editbar">
          <span className="text-[13.5px] font-semibold">레이아웃 편집</span>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={reset} data-testid="widgets-reset">
              기본 배치로
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setEdit(false)} data-testid="widgets-done">
              완료
            </button>
          </span>
        </div>
      )}

      <div
        ref={ref}
        className="relative"
        style={
          editing
            ? { height: totalRows * (ROW_PX + GAP_PX) - GAP_PX }
            : cols === 1
              ? { display: "flex", flexDirection: "column", gap: GAP_PX }
              : { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: GAP_PX, rowGap: 0, gridAutoRows: "auto", visibility: width === 0 ? "hidden" : undefined }
        }
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {editing
          ? layout.map((item) => {
              const def = WIDGETS[item.i];
              const style: CSSProperties = {
                position: "absolute",
                left: item.x * (colW + GAP_PX),
                top: item.y * (ROW_PX + GAP_PX),
                width: item.w * colW + (item.w - 1) * GAP_PX,
                height: item.h * (ROW_PX + GAP_PX) - GAP_PX,
                transition: active !== item.i ? "left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease" : "none",
                zIndex: active === item.i ? 5 : 1,
                boxShadow: active === item.i ? "0 12px 32px rgba(27,26,24,0.18)" : undefined,
                outline: "1.5px dashed rgba(27,26,24,0.25)",
              };
              return (
                <section key={item.i} className="card flex flex-col overflow-hidden" style={style} data-testid={`widget-${item.i}`} data-w={item.w} data-h={item.h} data-x={item.x} data-y={item.y}>
                  <header className="flex cursor-grab select-none items-start justify-between gap-2 px-5 pt-4 active:cursor-grabbing" onPointerDown={(e) => onPointerDown(e, item, "move")} data-testid="widget-handle">
                    <div className="min-w-0 text-[13.5px] font-semibold leading-5" title={def.hint}>
                      {def.title}
                    </div>
                    <button type="button" className="btn-ghost btn-sm shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(item.i)} aria-label={`${def.title} 빼기`} data-testid="widget-remove">
                      ✕
                    </button>
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-2">
                    <Widget type={item.i} data={data} item={item} edit />
                  </div>
                  <div className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-[4px]" style={{ background: "linear-gradient(135deg, transparent 50%, rgba(27,26,24,0.45) 50%)" }} onPointerDown={(e) => onPointerDown(e, item, "resize")} aria-label="크기 조절" data-testid="widget-resize" />
                </section>
              );
            })
          : units.map((u) => {
              const pos: CSSProperties = cols === 1 ? {} : { gridColumn: `${u.x + 1} / span ${u.w}`, gridRow: `${u.y + 1} / span ${u.h}`, marginTop: u.y > 0 ? GAP_PX : 0 };
              if (u.kind === "kpis") return <KpiStrip key={`k${u.items[0].i}`} items={u.items} data={data} style={pos} />;
              const item = u.item;
              const def = WIDGETS[item.i];
              return (
                <section key={item.i} className="card flex min-w-0 flex-col" style={pos} data-testid={`widget-${item.i}`} data-w={item.w} data-h={item.h} data-x={item.x} data-y={item.y}>
                  <header className="flex items-baseline justify-between gap-2 px-5 pt-4">
                    <h2 className="sec-t" title={def.hint}>
                      {def.title}
                    </h2>
                    <WidgetAside type={item.i} data={data} />
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3">
                    <Widget type={item.i} data={data} item={item} edit={false} />
                  </div>
                </section>
              );
            })}
      </div>

      {editing && (
        <div className="card-sm card-body mt-3 flex flex-wrap items-center gap-2" data-testid="widget-palette">
          <span className="lbl mr-1">넣기</span>
          {missing.length === 0 && <span className="muted text-[12.5px]">모든 위젯이 보드에 있습니다.</span>}
          {missing.map((k) => (
            <button key={k} type="button" className="chip" onClick={() => add(k)} data-testid={`widget-add-${k}`}>
              + {WIDGETS[k].title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Unit = { kind: "kpis"; items: LayoutItem[]; x: number; y: number; w: number; h: number } | { kind: "w"; item: LayoutItem; x: number; y: number; w: number; h: number };

/**
 * 보기 모드의 렌더 단위. 숫자 위젯이 모두 다른 위젯보다 위에 있으면 한 줄 띠 하나로,
 * 아니면 같은 줄에 붙어 있는 것끼리만 띠로 합친다.
 */
function viewUnits(layout: LayoutItem[], cols: number): Unit[] {
  const kpis = layout.filter((l) => isKpi(l.i)).sort((a, b) => a.y - b.y || a.x - b.x);
  const rest = layout.filter((l) => !isKpi(l.i)).sort((a, b) => a.y - b.y || a.x - b.x);
  const unitOf = (item: LayoutItem): Unit => ({ kind: "w", item, x: item.x, y: item.y, w: item.w, h: item.h });
  if (!kpis.length) return rest.map(unitOf);
  const kBottom = Math.max(...kpis.map((k) => k.y + k.h));
  const kTop = Math.min(...kpis.map((k) => k.y));
  if (kTop === 0 && (!rest.length || Math.min(...rest.map((r) => r.y)) >= kBottom)) return [{ kind: "kpis", items: kpis, x: 0, y: 0, w: cols, h: kBottom }, ...rest.map(unitOf)];
  const out: Unit[] = [];
  let run: LayoutItem[] = [];
  const flush = () => {
    if (!run.length) return;
    const a = run[0];
    const b = run[run.length - 1];
    out.push({ kind: "kpis", items: run, x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h });
    run = [];
  };
  for (const k of kpis) {
    const prev = run[run.length - 1];
    if (prev && !(k.y === prev.y && k.h === prev.h && k.x === prev.x + prev.w)) flush();
    run.push(k);
  }
  flush();
  return [...out, ...rest.map(unitOf)].sort((a, b) => a.y - b.y || a.x - b.x);
}

// ───────────────── 위젯 내용 ─────────────────

function Delta({ now, prev, suffix = "" }: { now: number | null; prev: number | null; suffix?: string }) {
  if (now === null || prev === null) return null;
  const d = now - prev;
  return (
    <span style={{ color: d < 0 ? "var(--accent)" : "var(--ink-2)" }}>
      {d > 0 ? `▲ ${d}${suffix}` : d < 0 ? `▼ ${-d}${suffix}` : "="} <span style={{ color: "var(--ink-3)" }}>지난 기간 {prev}{suffix}</span>
    </span>
  );
}

/** 숫자 위젯 내용: [라벨, 값, 단위, 강조, 보조 줄, 링크] */
function kpiOf(type: WidgetType, data: DashboardData): { value: number | null; suffix?: string; accent?: boolean; sub: ReactNode; href?: string } {
  const { kpi } = data;
  switch (type) {
    case "avg":
      return { value: kpi.avg, sub: <Delta now={kpi.avg} prev={kpi.avgPrev} /> };
    case "pass":
      return {
        value: kpi.pass,
        suffix: "%",
        sub: (
          <>
            첫 응시 {kpi.graded}건{kpi.pass !== null && kpi.passPrev !== null ? " · " : ""}
            <Delta now={kpi.pass} prev={kpi.passPrev} suffix="%" />
          </>
        ),
      };
    case "retake":
      return { value: kpi.retake, sub: kpi.retakeNotIssued ? `출제 전 ${kpi.retakeNotIssued}` : "진행 중", href: "/app/retakes" };
    default:
      return { value: kpi.missed, accent: kpi.missed > 0, sub: "마감 지남", href: "/app/results?filter=overdue" };
  }
}

/** 보기 모드: 숫자 위젯을 한 표면의 띠로 (카드 4장 대신) */
function KpiStrip({ items, data, style }: { items: LayoutItem[]; data: DashboardData; style: CSSProperties }) {
  return (
    <div className="kpis" style={{ ...style, ["--n" as string]: items.length }} data-testid="widget-kpis">
      {items.map((item) => {
        const k = kpiOf(item.i, data);
        const body = (
          <>
            <span className="lbl" title={WIDGETS[item.i].hint}>
              {WIDGETS[item.i].title}
            </span>
            <span className="kpi-v" style={k.accent ? { color: "var(--accent)" } : undefined}>
              <CountUp value={k.value} suffix={k.suffix} placeholder="–" />
            </span>
            <span className="kpi-s truncate">{k.sub}</span>
          </>
        );
        const attrs = { "data-testid": `widget-${item.i}`, "data-w": item.w, "data-h": item.h, "data-x": item.x, "data-y": item.y };
        return k.href ? (
          <Link key={item.i} href={k.href} {...attrs}>
            {body}
          </Link>
        ) : (
          <div key={item.i} {...attrs}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** 카드 머리 오른쪽의 짧은 요약·링크 */
function WidgetAside({ type, data }: { type: WidgetType; data: DashboardData }) {
  const cls = "text-[12.5px] tabular-nums";
  switch (type) {
    case "trend": {
      const vals = data.trend.filter((v): v is number => v !== null);
      if (vals.length < 2) return null;
      const d = vals[vals.length - 1] - vals[vals.length - 2];
      return (
        <span className={cls} style={{ color: "var(--ink-3)" }}>
          지난주 대비{" "}
          <b className="font-semibold" style={{ color: d < 0 ? "var(--accent)" : "var(--ink)" }}>
            {d > 0 ? `+${d}` : d === 0 ? "±0" : d}
          </b>
        </span>
      );
    }
    case "watch":
      return data.watch.length ? (
        <span className={cls} style={{ color: "var(--ink-3)" }}>
          {data.watch.length}명
        </span>
      ) : null;
    case "groups":
      return (
        <span className={cls} style={{ color: "var(--ink-3)" }}>
          {data.rangeLabel}
        </span>
      );
    case "distribution": {
      const total = data.donut.pass + data.donut.fail;
      return (
        <span className={cls} style={{ color: "var(--ink-3)" }}>
          응시 {total}건
        </span>
      );
    }
    case "recent":
      return (
        <Link href="/app/results?tab=exams" className="sec-link">
          전체 →
        </Link>
      );
    default:
      return null;
  }
}

function Stat({ value, suffix, sub, accent }: { value: number | null; suffix?: string; sub: ReactNode; accent?: boolean }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <div className="num-lg" style={accent ? { color: "var(--accent)" } : undefined}>
        <CountUp value={value} suffix={suffix} placeholder="–" />
      </div>
      <div className="mt-1.5 truncate text-[12px]">{sub}</div>
    </div>
  );
}

function Widget({ type, data, item, edit }: { type: WidgetType; data: DashboardData; item: LayoutItem; edit: boolean }) {
  if (isKpi(type)) {
    const k = kpiOf(type, data);
    return <Stat value={k.value} suffix={k.suffix} sub={k.sub} accent={k.accent} />;
  }
  switch (type) {
    case "groups": {
      const rows = data.isWeekGroup
        ? data.weekRows.map((r, i) => ({ key: `w${i}`, label: `${r.label} 주`, value: r.value, sub: `${r.count}건` }))
        : data.groups.map((g) => ({ key: g.key, label: g.label, value: g.avg, sub: `${g.count}명`, href: g.href, delta: g.delta }));
      return rows.length === 0 ? <p className="muted">학생이 없습니다.</p> : <RankBars rows={rows} warnBelow={data.warnLine} limit={8} moreHref="/app/results?tab=class" />;
    }
    case "trend":
      return <TrendChart values={data.trend} labels={data.weeks} passLine={data.passLine} height="fill" minHeight={edit ? 60 : Math.max(170, Math.min(440, item.h * ROW_PX - 110))} lastLabel="이번 주" ariaLabel="주별 평균" />;
    case "distribution":
      return (
        <div className="flex flex-col gap-5">
          <Distribution bins={data.bins} height={edit ? 72 : 112} />
          <CompositionBar
            parts={[
              { label: "통과", value: data.donut.pass, tone: "ink" },
              { label: "미달", value: data.donut.fail, tone: "accent" },
              { label: "미응시", value: data.donut.missed, tone: "muted", href: "/app/results?filter=overdue" },
            ]}
          />
        </div>
      );
    case "heatmap":
      return data.heat.length === 0 ? (
        <p className="muted">학생이 없습니다.</p>
      ) : (
        <div className="min-h-0 overflow-auto">
          <Heatmap rows={data.heat.map((p) => ({ key: p.id, label: p.name, cells: p.cells }))} cols={data.weeks} hrefFor={(id) => `/app/students/${id}`} />
        </div>
      );
    case "watch": {
      const max = edit ? 20 : Math.max(4, Math.min(8, item.h));
      return data.watch.length === 0 ? (
        <p className="muted text-[13.5px]">지금은 없어요</p>
      ) : (
        <div className={edit ? "min-h-0 overflow-y-auto" : ""}>
          <ul className="list-rows">
            {data.watch.slice(0, max).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/app/students?q=${encodeURIComponent(p.name)}`} className="text-[14px] font-semibold hover:underline" title="→ 학생 탭">
                    {p.name}
                  </Link>
                  {p.className && <span className="muted ml-1.5 text-[12.5px]">{p.className}</span>}
                  <div className="truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    {p.reason}
                    {p.retake ? ` · 재시험 ${p.retake}` : ""}
                  </div>
                </div>
                <span className="text-[18px] font-bold tabular-nums" style={{ color: p.avg !== null && p.avg < data.warnLine ? "var(--accent)" : undefined }}>
                  {p.avg ?? "–"}
                </span>
              </li>
            ))}
          </ul>
          {data.watch.length > max && (
            <Link href="/app/results?tab=students" className="sec-link mt-2 inline-block">
              외 {data.watch.length - max}명 →
            </Link>
          )}
        </div>
      );
    }
    case "recent": {
      const max = edit ? 20 : Math.max(4, Math.min(8, item.h));
      return data.recent.length === 0 ? (
        <p className="muted text-[13.5px]">채점된 시험이 없습니다.</p>
      ) : (
        <ul className={`list-rows${edit ? " min-h-0 overflow-y-auto" : ""}`}>
          {data.recent.slice(0, max).map((e) => (
            <li key={e.examId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/app/tests?q=${encodeURIComponent(e.title)}`} className="block truncate text-[13.5px] font-medium hover:underline" title="→ 시험 탭">
                  {e.title}
                </Link>
                <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {e.at} · {e.n}명 · 통과 {e.passRate ?? "–"}%{e.isRetake ? " · 재시험" : ""}
                </div>
              </div>
              <span className="text-[18px] font-bold tabular-nums" style={{ color: e.avg !== null && e.avg < data.warnLine ? "var(--accent)" : undefined }}>
                {e.avg ?? "–"}
              </span>
            </li>
          ))}
        </ul>
      );
    }
  }
  return null;
}
