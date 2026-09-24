/**
 * 성적 대시보드 위젯 정의 · 배치(12열 그리드). 배치는 사용자(AcademyMember.dashboardLayout)별 JSON 으로 저장.
 */
export type WidgetType = "avg" | "pass" | "retake" | "missed" | "groups" | "trend" | "distribution" | "heatmap" | "watch" | "recent";
export type LayoutItem = { i: WidgetType; x: number; y: number; w: number; h: number };

export const COLS = 12;
export const ROW_PX = 56;
export const GAP_PX = 12;

export const WIDGETS: Record<WidgetType, { title: string; hint: string; minW: number; minH: number; w: number; h: number }> = {
  avg: { title: "평균 점수", hint: "첫 응시 점수의 평균. 지난 기간과 비교", minW: 2, minH: 2, w: 3, h: 2 },
  pass: { title: "통과율 (첫 응시)", hint: "첫 응시에서 통과 기준을 넘긴 비율", minW: 2, minH: 2, w: 3, h: 2 },
  retake: { title: "재시험", hint: "아직 끝나지 않은 재시험 (출제 전 포함)", minW: 2, minH: 2, w: 3, h: 2 },
  missed: { title: "미응시", hint: "마감이 지났는데 시작하지 않은 시험", minW: 2, minH: 2, w: 3, h: 2 },
  groups: { title: "그룹별 평균", hint: "반·학교·학년별 평균. 막대를 누르면 그 학생들만", minW: 4, minH: 4, w: 6, h: 6 },
  trend: { title: "성적 추이", hint: "주별 평균 점수. 점선이 통과 기준, 빨간 점은 미달", minW: 4, minH: 3, w: 6, h: 6 },
  distribution: { title: "점수 분포", hint: "점수대별 응시 수와 통과·미달·미응시 건수", minW: 3, minH: 4, w: 4, h: 6 },
  heatmap: { title: "누가 언제 봤나", hint: "학생 × 주. 빈 칸은 그 주 응시 없음, 빨강은 60점 미만", minW: 4, minH: 4, w: 4, h: 6 },
  watch: { title: "챙겨야 할 학생", hint: "연속 미달·미응시·급락·평균 60 미만", minW: 3, minH: 3, w: 4, h: 6 },
  recent: { title: "최근 시험", hint: "최근에 낸 시험의 평균과 응시 인원", minW: 3, minH: 3, w: 4, h: 6 },
};

// 기본 배치(v5.5): 숫자 4개 → [추이(넓게) | 챙겨야 할 학생] → [그룹 | 분포 | 히트맵]. 높이 5줄로 낮춰 빈 면적을 줄인다
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "avg", x: 0, y: 0, w: 3, h: 2 },
  { i: "pass", x: 3, y: 0, w: 3, h: 2 },
  { i: "retake", x: 6, y: 0, w: 3, h: 2 },
  { i: "missed", x: 9, y: 0, w: 3, h: 2 },
  { i: "trend", x: 0, y: 2, w: 8, h: 5 },
  { i: "watch", x: 8, y: 2, w: 4, h: 5 },
  { i: "groups", x: 0, y: 7, w: 4, h: 5 },
  { i: "distribution", x: 4, y: 7, w: 4, h: 5 },
  { i: "heatmap", x: 8, y: 7, w: 4, h: 5 },
];

/** 휴대폰(한 열)에서 보이는 순서: 숫자 → 할 일(챙길 학생) → 추이 → 나머지 */
export const MOBILE_ORDER: WidgetType[] = ["avg", "pass", "retake", "missed", "watch", "trend", "recent", "groups", "heatmap", "distribution"];

export function normalizeLayout(raw: unknown): LayoutItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const it of raw as Partial<LayoutItem>[]) {
    if (!it || typeof it.i !== "string" || !(it.i in WIDGETS) || seen.has(it.i)) continue;
    const def = WIDGETS[it.i as WidgetType];
    const w = Math.max(def.minW, Math.min(COLS, Math.round(Number(it.w) || def.w)));
    const h = Math.max(def.minH, Math.min(20, Math.round(Number(it.h) || def.h)));
    const x = Math.max(0, Math.min(COLS - w, Math.round(Number(it.x) || 0)));
    const y = Math.max(0, Math.min(200, Math.round(Number(it.y) || 0)));
    seen.add(it.i);
    out.push({ i: it.i as WidgetType, x, y, w, h });
  }
  return out.length ? out : DEFAULT_LAYOUT;
}

export function collides(a: LayoutItem, b: LayoutItem) {
  return a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
const hits = (placed: LayoutItem[], it: LayoutItem) => placed.some((p) => collides(p, it));

/** 위로 끌어올려 빈틈 없이 (react-grid-layout 의 vertical compact) */
export function compact(layout: LayoutItem[]): LayoutItem[] {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: LayoutItem[] = [];
  for (const item of sorted) {
    const it = { ...item };
    while (it.y > 0 && !hits(out, { ...it, y: it.y - 1 })) it.y--;
    while (hits(out, it)) it.y++;
    out.push(it);
  }
  return out;
}

/** 옮기거나 크기를 바꾼 위젯은 그 자리에 두고, 겹치는 다른 위젯을 아래로 밀어낸 뒤 전체를 끌어올린다 */
export function place(layout: LayoutItem[], moved: LayoutItem, cols = COLS): LayoutItem[] {
  const m = { ...moved, x: Math.max(0, Math.min(cols - moved.w, moved.x)), y: Math.max(0, moved.y) };
  const others = layout.filter((l) => l.i !== m.i).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: LayoutItem[] = [m];
  for (const o of others) {
    const it = { ...o };
    while (hits(out, it)) it.y++;
    while (it.y > 0 && !hits(out, { ...it, y: it.y - 1 })) it.y--;
    out.push(it);
  }
  return out;
}

/** 열 수가 줄어든 화면(태블릿 6열)용 배치: 반 폭(3) 또는 전체 폭(6)으로 줄이고, 읽는 순서대로 빈자리에 차례로 채운다 */
export function fitCols(layout: LayoutItem[], cols: number): LayoutItem[] {
  if (cols >= COLS) return layout;
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: LayoutItem[] = [];
  for (const l of sorted) {
    const w = l.w >= 9 ? cols : Math.min(cols, Math.max(Math.ceil(cols / 2), Math.round((l.w * cols) / COLS)));
    const it: LayoutItem = { ...l, w, x: 0, y: 0 };
    // 첫 빈자리(위에서 아래, 왼쪽에서 오른쪽)
    outer: for (let y = 0; y < 400; y++) {
      for (let x = 0; x + w <= cols; x++) {
        it.x = x;
        it.y = y;
        if (!hits(out, it)) break outer;
      }
    }
    out.push({ ...it });
  }
  return fillRows(out, cols);
}

/**
 * 줄마다 오른쪽 빈 칸이 남지 않게: 같은 줄(y 겹침)의 마지막 위젯을 남은 폭만큼 늘린다.
 * (QA: 태블릿 폭에서 오른쪽 90px 이 비고 가운데 빈 칸이 생기던 것)
 */
export function fillRows(layout: LayoutItem[], cols = COLS): LayoutItem[] {
  const out = layout.map((l) => ({ ...l }));
  for (const it of out) {
    const rightEdge = it.x + it.w;
    if (rightEdge >= cols) continue;
    // 이 위젯의 오른쪽에 같은 세로 구간에서 겹치는 위젯이 없으면 끝까지 늘린다
    const blocked = out.some((o) => o !== it && o.x >= rightEdge && o.y < it.y + it.h && o.y + o.h > it.y);
    if (!blocked) it.w = cols - it.x;
  }
  return out;
}
