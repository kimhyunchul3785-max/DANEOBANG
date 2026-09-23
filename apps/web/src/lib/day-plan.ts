/**
 * DAY 나누기.
 *  - doc     : 문서에 적힌 DAY 표기를 그대로 사용 (표기 없는 행은 직전 DAY 로)
 *  - days    : 일수 n 으로 균등 분할 (기본 7일)
 *  - perDay  : 하루 n 단어씩
 *  - section : 지문(PASSAGE)·단원 구획마다 하루
 *  - custom  : 사용자가 DAY 별 단어 수를 직접 지정 (예: 40,40,30 — 마지막은 남은 단어 전부)
 */
export type SplitMode = "doc" | "days" | "perDay" | "section" | "custom";

/** "40, 40, 30" 같은 문자열 → 양의 정수 배열 */
export function parseSizes(s: string): number[] {
  return s
    .split(/[\s,;·]+/)
    .map((x) => Math.floor(Number(x)))
    .filter((x) => Number.isFinite(x) && x > 0);
}
export const DEFAULT_SPLIT_DAYS = 7;

export type PlanItem = { dayNo: number | null; section: string | null };
export type PlannedDay = { dayNo: number; label: string };

export function planDays(items: PlanItem[], mode: SplitMode, n: number, offset = 0, sizes?: number[]): PlannedDay[] {
  const total = items.length;
  if (total === 0) return [];
  if (mode === "custom") {
    // 지정한 크기대로 차례로 채우고, 크기가 모자라면 마지막 DAY 가 남은 단어를 전부 가진다
    const sz = (sizes ?? []).filter((x) => x > 0);
    if (!sz.length) return planDays(items, "days", n, offset);
    const bounds: number[] = [];
    let acc = 0;
    for (const s of sz) {
      acc += s;
      bounds.push(acc);
    }
    return items.map((_, i) => {
      let d = bounds.findIndex((b) => i < b);
      if (d === -1) d = bounds.length - 1;
      const dayNo = d + 1 + offset;
      return { dayNo, label: `DAY ${dayNo}` };
    });
  }
  if (mode === "doc") {
    let last = 0;
    return items.map((it) => {
      if (it.dayNo && it.dayNo > 0) last = it.dayNo;
      const dayNo = last || 1;
      return { dayNo, label: `DAY ${dayNo}` };
    });
  }
  if (mode === "section") {
    const order: string[] = [];
    return items.map((it) => {
      const key = it.section ?? (order.length ? order[order.length - 1] : "기타");
      if (!order.includes(key)) order.push(key);
      const dayNo = order.indexOf(key) + 1 + offset;
      return { dayNo, label: `DAY ${dayNo} · ${key}` };
    });
  }
  if (mode === "perDay") {
    const per = Math.max(1, Math.floor(n));
    return items.map((_, i) => {
      const dayNo = Math.floor(i / per) + 1 + offset;
      return { dayNo, label: `DAY ${dayNo}` };
    });
  }
  // days: n 일로 균등 (앞쪽 DAY 가 1개 더 많을 수 있음)
  const days = Math.max(1, Math.min(Math.floor(n), total));
  return items.map((_, i) => {
    const dayNo = Math.floor((i * days) / total) + 1 + offset;
    return { dayNo, label: `DAY ${dayNo}` };
  });
}

/** 분할 미리보기용 분포 (dayNo → 단어 수) */
export function distribution(plan: PlannedDay[]): { dayNo: number; label: string; count: number }[] {
  const m = new Map<number, { label: string; count: number }>();
  for (const p of plan) {
    const e = m.get(p.dayNo) ?? { label: p.label, count: 0 };
    e.count++;
    m.set(p.dayNo, e);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([dayNo, e]) => ({ dayNo, ...e }));
}

