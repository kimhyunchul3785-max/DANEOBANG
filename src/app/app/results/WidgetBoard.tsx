"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/components/Motion";
import { Sparkline, HBars, Columns, Donut, Heatmap, type HeatCell } from "@/components/Viz";
import { toast } from "@/components/Toaster";
import { WIDGETS, DEFAULT_LAYOUT, COLS, ROW_PX, GAP_PX, compact, place, fitCols, type LayoutItem, type WidgetType } from "./widgets";
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

/** 위젯 보드: 12열 그리드. 편집 모드에서 머리 부분을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 키우고, ✕ 로 빼고, 팔레트에서 다시 넣는다. */
export function WidgetBoard({ data, initialLayout }: { data: DashboardData; initialLayout: LayoutItem[] }) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => compact(initialLayout));
  const [edit, setEdit] = useState(false);
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 보드 폭 기준 열 수: 휴대폰 1열(세로 쌓기) · 태블릿 6열 · 데스크톱(보드 900px 이상) 12열
  const cols = width === 0 ? COLS : width < 560 ? 1 : width < 900 ? 6 : COLS;
  const colW = cols === 1 ? width : (width - GAP_PX * (cols - 1)) / cols;
  const shown = useMemo(() => (cols === COLS ? layout : cols === 1 ? layout : fitCols(layout, cols)), [layout, cols]);
  const canEdit = cols === COLS;

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

  // ── 드래그 / 리사이즈 (포인터 이벤트)
  const drag = useRef<{ id: WidgetType; kind: "move" | "resize"; startX: number; startY: number; orig: LayoutItem; startLayout: LayoutItem[] } | null>(null);
  const [active, setActive] = useState<WidgetType | null>(null);
  const onPointerDown = (e: React.PointerEvent, item: LayoutItem, kind: "move" | "resize") => {
    if (!edit || !canEdit) return;
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
  const totalRows = shown.reduce((m, l) => Math.max(m, l.y + l.h), 0);

  return (
    <div data-testid="widget-board" data-edit={edit ? "1" : "0"} data-cols={cols}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="muted text-[12.5px]">
          {edit ? "제목 부분을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾸세요. ✕ 로 빼고 아래 팔레트에서 다시 넣을 수 있습니다." : "위젯은 편집에서 옮기고·키우고·빼고·넣을 수 있습니다."}
        </p>
        <div className="flex items-center gap-2">
          {edit && (
            <button type="button" className="btn-ghost btn-sm" onClick={reset} data-testid="widgets-reset">
              기본 배치로
            </button>
          )}
          <button type="button" className={`${edit ? "btn-primary" : "btn-secondary"} btn-sm`} onClick={() => setEdit(!edit)} disabled={!canEdit && !edit} title={!canEdit ? "넓은 화면에서 편집할 수 있습니다" : undefined} data-testid="widgets-edit">
            {edit ? "편집 완료" : "위젯 편집"}
          </button>
        </div>
      </div>

      <div ref={ref} className="relative" style={cols === 1 ? undefined : { height: totalRows * (ROW_PX + GAP_PX) - GAP_PX }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {(cols === 1 ? [...shown].sort((a, b) => a.y - b.y || a.x - b.x) : shown).map((item) => {
          const def = WIDGETS[item.i];
          const style: React.CSSProperties =
            cols === 1
              ? { position: "relative", marginBottom: GAP_PX, minHeight: Math.min(item.h, 4) * (ROW_PX + GAP_PX) - GAP_PX }
              : {
                  position: "absolute",
                  left: item.x * (colW + GAP_PX),
                  top: item.y * (ROW_PX + GAP_PX),
                  width: item.w * colW + (item.w - 1) * GAP_PX,
                  height: item.h * (ROW_PX + GAP_PX) - GAP_PX,
                  transition: active === item.i ? "none" : "left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease",
                  zIndex: active === item.i ? 5 : 1,
                };
          const bodyPx = cols === 1 ? Math.max(120, Math.min(item.h, 5) * (ROW_PX + GAP_PX) - GAP_PX - 62) : item.h * (ROW_PX + GAP_PX) - GAP_PX - 62;
          return (
            <section key={item.i} className="card flex flex-col overflow-hidden" style={{ ...style, boxShadow: active === item.i ? "0 12px 32px rgba(27,26,24,0.18)" : undefined, outline: edit ? "1.5px dashed rgba(27,26,24,0.25)" : undefined }} data-testid={`widget-${item.i}`} data-w={item.w} data-h={item.h} data-x={item.x} data-y={item.y}>
              <header className={`flex items-start justify-between gap-2 px-4 pt-3 ${edit ? "cursor-grab select-none active:cursor-grabbing" : ""}`} onPointerDown={(e) => onPointerDown(e, item, "move")} data-testid="widget-handle">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{def.title}</div>
                  <div className="muted truncate text-[11.5px]">{def.hint}</div>
                </div>
                {edit && (
                  <button type="button" className="btn-ghost btn-sm shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(item.i)} aria-label={`${def.title} 빼기`} data-testid="widget-remove">
                    ✕
                  </button>
                )}
              </header>
              <div className="min-h-0 flex-1 px-4 pb-3 pt-2">
                <Widget type={item.i} data={data} bodyPx={bodyPx} w={item.w} />
              </div>
              {edit && canEdit && <div className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-[4px]" style={{ background: "linear-gradient(135deg, transparent 50%, rgba(27,26,24,0.45) 50%)" }} onPointerDown={(e) => onPointerDown(e, item, "resize")} aria-label="크기 조절" data-testid="widget-resize" />}
            </section>
          );
        })}
      </div>

      {edit && (
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

// ───────────────── 위젯 내용 ─────────────────

function Delta({ now, prev, suffix = "" }: { now: number | null; prev: number | null; suffix?: string }) {
  if (now === null || prev === null) return <span className="muted text-[12px]">비교할 지난 기간 없음</span>;
  const d = now - prev;
  return (
    <span className="text-[12px]" style={{ color: d < 0 ? "var(--accent)" : "var(--ink-2)" }}>
      {d > 0 ? `▲ ${d}${suffix}` : d < 0 ? `▼ ${-d}${suffix}` : "="} 지난 기간 {prev}
      {suffix}
    </span>
  );
}

function Stat({ value, suffix, sub, accent }: { value: number | null; suffix?: string; sub: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <div className="num-lg leading-none" style={accent ? { color: "var(--accent)" } : undefined}>
        <CountUp value={value} suffix={suffix} placeholder="–" />
      </div>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

function Widget({ type, data, bodyPx, w }: { type: WidgetType; data: DashboardData; bodyPx: number; w: number }) {
  const { kpi } = data;
  switch (type) {
    case "avg":
      return <Stat value={kpi.avg} sub={<Delta now={kpi.avg} prev={kpi.avgPrev} />} />;
    case "pass":
      return <Stat value={kpi.pass} suffix="%" sub={<Delta now={kpi.pass} prev={kpi.passPrev} suffix="%" />} />;
    case "retake":
      return (
        <Stat
          value={kpi.retake}
          accent={kpi.retake > 0}
          sub={
            <Link href="/app/retakes" className="text-[12px] hover:underline" style={{ color: "var(--ink-2)" }}>
              {kpi.retakeNotIssued ? `출제 전 ${kpi.retakeNotIssued} · ` : ""}재시험 화면 →
            </Link>
          }
        />
      );
    case "missed":
      return (
        <Stat
          value={kpi.missed}
          sub={
            <Link href="/app/results?filter=overdue" className="text-[12px] hover:underline" style={{ color: "var(--ink-2)" }}>
              마감 지남 · 목록 →
            </Link>
          }
        />
      );
    case "groups": {
      const rows = data.isWeekGroup ? data.weekRows.map((r, i) => ({ key: `w${i}`, label: `${r.label} 주`, value: r.value, sub: `${r.count}건` })) : data.groups.map((g) => ({ key: g.key, label: g.label, value: g.avg, sub: `${g.count}명` }));
      const hrefs = new Map(data.groups.map((g) => [g.key, g.href]));
      return (
        <div className="h-full overflow-y-auto">
          <div className="lbl mb-2">
            {data.groupLabel} · 최근 {data.rangeLabel} · {data.students}명
          </div>
          {rows.length === 0 ? <p className="muted">학생이 없습니다.</p> : <HBars rows={rows} accentBelow={data.warnLine} hrefFor={data.isWeekGroup ? undefined : (k) => hrefs.get(k) ?? "#"} />}
          <p className="muted mt-2 text-[11.5px]">빨간 막대 = 평균 {data.warnLine} 미만 (통과 기준 {data.passLine})</p>
        </div>
      );
    }
    case "trend": {
      const listH = w >= 6 && data.groups.length ? Math.min(4, data.groups.length) * 24 + 8 : 0;
      const h = Math.max(60, bodyPx - 22 - listH);
      const last = data.trend.filter((v): v is number => v !== null);
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between">
            <span className="lbl">
              {data.weeks.length}주 · 통과 기준 {data.passLine}
            </span>
            {last.length >= 2 && (
              <span className="digital" style={{ color: last[last.length - 1] < last[last.length - 2] ? "var(--accent)" : "var(--ink-2)" }}>
                {last[last.length - 2]} → {last[last.length - 1]}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <Sparkline values={data.trend} baseline={data.passLine} accentBelow={data.passLine} labels={data.weeks} height={h} />
          </div>
          <div className="flex justify-between">
            {data.weeks.map((l, i) => (
              <span key={i} className="lbl" style={{ fontSize: 9 }}>
                {data.weeks.length > 8 && i % 2 ? "" : l}
              </span>
            ))}
          </div>
          {listH > 0 && (
            <ul className="mt-1">
              {data.groups.slice(0, 4).map((g) => (
                <li key={g.key} className="flex items-center justify-between text-[12.5px]" style={{ height: 24 }}>
                  <span className="truncate">{g.label}</span>
                  <span className="digital" style={{ color: g.delta !== null && g.delta < 0 ? "var(--accent)" : "var(--ink-2)" }}>
                    {g.delta === null ? "··" : g.delta > 0 ? `▲ ${g.delta}` : g.delta < 0 ? `▼ ${-g.delta}` : "="}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "distribution": {
      const total = data.donut.pass + data.donut.fail;
      return (
        <div className="flex h-full flex-col">
          <div className="lbl">
            응시 {total}건 · 통과 {total ? Math.round((data.donut.pass / total) * 100) : 0}%
          </div>
          <div className="mt-2">
            <Columns bins={data.bins} accentIndexBelow={3} height={Math.max(56, Math.min(120, bodyPx - 130))} />
          </div>
          <div className="mt-3 flex-1">
            <Donut
              parts={[
                { label: "통과", value: data.donut.pass, color: "var(--ink)" },
                { label: "미달", value: data.donut.fail, color: "var(--accent)" },
                { label: "미응시", value: data.donut.missed, color: "rgba(27,26,24,0.25)" },
              ]}
              size={72}
              stroke={11}
            />
          </div>
        </div>
      );
    }
    case "heatmap":
      return (
        <div className="h-full overflow-auto">
          {data.heat.length === 0 ? <p className="muted">학생이 없습니다.</p> : <Heatmap rows={data.heat.map((p) => ({ key: p.id, label: p.name, cells: p.cells }))} cols={data.weeks} hrefFor={(id) => `/app/students/${id}`} />}
        </div>
      );
    case "watch":
      return data.watch.length === 0 ? (
        <p className="muted">지금은 없습니다. 연속 미달·미응시·급락이 생기면 여기에 나타납니다.</p>
      ) : (
        <ul className="h-full overflow-y-auto">
          {data.watch.map((p) => (
            <li key={p.id} className="row">
              <div className="min-w-0">
                <Link href={`/app/students/${p.id}`} className="card-title hover:underline">
                  {p.name}
                </Link>
                <span className="muted ml-1">{p.className}</span>
                <div className="muted truncate text-[12px]">
                  {p.reason}
                  {p.retake ? ` · 재시험 ${p.retake}` : ""}
                </div>
              </div>
              <span className="num-md" style={{ color: "var(--accent)" }}>
                {p.avg ?? "–"}
              </span>
            </li>
          ))}
        </ul>
      );
    case "recent":
      return data.recent.length === 0 ? (
        <p className="muted">이 기간에 채점된 시험이 없습니다.</p>
      ) : (
        <ul className="h-full overflow-y-auto">
          {data.recent.map((e) => (
            <li key={e.examId} className="row">
              <div className="min-w-0">
                <Link href={`/app/tests/${e.examId}?step=3`} className="block truncate text-[13.5px] font-medium hover:underline">
                  {e.title}
                </Link>
                <div className="muted text-[12px]">
                  {e.at} · {e.n}명 응시 · 통과 {e.passRate ?? "–"}%{e.isRetake ? " · 재시험" : ""}
                </div>
              </div>
              <span className="num-md" style={{ color: e.avg !== null && e.avg < data.warnLine ? "var(--accent)" : undefined }}>
                {e.avg ?? "–"}
              </span>
            </li>
          ))}
        </ul>
      );
  }
}
