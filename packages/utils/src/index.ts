/**
 * 순수 TS 공용 함수 — Node/DOM 의존 없음 (웹 서버 · 브라우저 · React Native 어디서나).
 * 시각은 전부 Asia/Seoul(UTC+9) 기준으로 다룬다.
 */
const SEOUL_OFFSET_MS = 9 * 3600e3;

type DateLike = Date | string | number | null | undefined;
const toDate = (d: DateLike): Date | null => {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
};

/** "2026. 09. 23. PM 03:32" (ko-KR · Asia/Seoul). withTime=false 면 날짜만 */
export function fmtDate(d: DateLike, withTime = true) {
  const date = toDate(d);
  if (!date) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** "9/21" (Asia/Seoul) */
export function fmtMD(d: DateLike) {
  const date = toDate(d);
  if (!date) return "-";
  const l = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return `${l.getUTCMonth() + 1}/${l.getUTCDate()}`;
}
/** "9/21 19:00" (Asia/Seoul) */
export function fmtMDHM(d: DateLike) {
  const date = toDate(d);
  if (!date) return "-";
  const l = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return `${l.getUTCMonth() + 1}/${l.getUTCDate()} ${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** Asia/Seoul 기준 이번 주 (월 00:00 ~ 다음 월 00:00) */
export function seoulWeekRange(now: Date = new Date()) {
  const local = new Date(now.getTime() + SEOUL_OFFSET_MS);
  const day = (local.getUTCDay() + 6) % 7; // 월=0
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day) - SEOUL_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + 7 * 24 * 60 * 60 * 1000) };
}

/** 마감까지 남은 날 (Asia/Seoul 날짜 기준). 지났으면 음수 */
export function daysUntil(d: DateLike, now: Date = new Date()) {
  const date = toDate(d);
  if (!date) return null;
  const day = (t: number) => Math.floor((t + SEOUL_OFFSET_MS) / 86400e3);
  return day(date.getTime()) - day(now.getTime());
}
/** "D-5" · "D-DAY" · "D+2" */
export function dDay(d: DateLike, now: Date = new Date()) {
  const n = daysUntil(d, now);
  if (n === null) return "";
  return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 'YYYY-MM-DDTHH:mm'(Asia/Seoul 로컬, datetime-local 입력값) → Date. 다른 문자열은 Date 파서에 맡긴다 */
export function parseSeoulLocal(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]));
}
/** Date → 'YYYY-MM-DDTHH:mm' (Asia/Seoul 로컬) */
export function toSeoulLocalInput(d: DateLike = new Date()) {
  const date = toDate(d);
  if (!date) return "";
  return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 16);
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function normalizeMeaning(s: string) {
  return s.replace(/\s+/g, " ").replace(/[.,;:·]/g, "").trim().toLowerCase();
}

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return base || "academy";
}

/** 시드 기반 결정적 난수 (mulberry32) — 같은 시드면 같은 문항 순서 */
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 두 자리 카운터 "01/20" 용 */
export const pad2 = (n: number) => String(n).padStart(2, "0");
