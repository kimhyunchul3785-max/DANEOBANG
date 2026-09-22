import crypto from "crypto";

export function sha256(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return sha256(token);
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

export const RESERVED_SLUGS = new Set(["app", "admin", "api", "login", "signup", "learn", "workspaces", "join", "static", "_next"]);

/** 시드 기반 결정적 난수 (mulberry32) */
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

export function fmtDate(d: Date | string | null | undefined, withTime = true) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** "9/21" 형식 (Asia/Seoul) */
export function fmtMD(d: Date | string | null | undefined) {
  if (!d) return "-";
  const l = new Date((typeof d === "string" ? new Date(d) : d).getTime() + 9 * 3600e3);
  return `${l.getUTCMonth() + 1}/${l.getUTCDate()}`;
}
/** "9/21 19:00" 형식 (Asia/Seoul) */
export function fmtMDHM(d: Date | string | null | undefined) {
  if (!d) return "-";
  const l = new Date((typeof d === "string" ? new Date(d) : d).getTime() + 9 * 3600e3);
  return `${l.getUTCMonth() + 1}/${l.getUTCDate()} ${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** Asia/Seoul 기준 이번 주 (월 00:00 ~ 다음 월 00:00) */
export function seoulWeekRange(now = new Date()) {
  const offset = 9 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const day = (local.getUTCDay() + 6) % 7; // 월=0
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day) - offset;
  return { start: new Date(start), end: new Date(start + 7 * 24 * 60 * 60 * 1000) };
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

/** datetime-local 입력값(YYYY-MM-DDTHH:mm)을 Asia/Seoul 기준 시각으로 해석 */
export function parseSeoulLocal(v: FormDataEntryValue | null | undefined): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]));
}
