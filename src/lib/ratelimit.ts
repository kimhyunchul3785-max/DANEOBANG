/**
 * 아주 단순한 프로세스 내 속도 제한 (반 코드·인증번호 대입 방지).
 *   실패 5회 → 5분 잠금, 시간당 시도 20회 → 잠금. 키 = "<용도>:<userId>" (필요하면 IP 도 추가).
 * 서버가 여러 대면 공유 저장소(Redis 등)로 바꿔야 한다 — 지금은 단일 프로세스.
 */
type Entry = { fails: number[]; tries: number[]; lockedUntil: number };
const store = new Map<string, Entry>();
const FAIL_LIMIT = 5;
const FAIL_WINDOW = 5 * 60e3;
const LOCK_MS = 5 * 60e3;
const TRY_LIMIT = 20;
const TRY_WINDOW = 60 * 60e3;

function entry(key: string): Entry {
  const now = Date.now();
  const e = store.get(key) ?? { fails: [], tries: [], lockedUntil: 0 };
  e.fails = e.fails.filter((t) => now - t < FAIL_WINDOW);
  e.tries = e.tries.filter((t) => now - t < TRY_WINDOW);
  store.set(key, e);
  if (store.size > 10000) for (const [k, v] of store) if (v.lockedUntil < now && !v.tries.length) store.delete(k);
  return e;
}

/** 시도 전에 호출. 막혀 있으면 남은 초를 돌려준다 */
export function checkLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const e = entry(key);
  const now = Date.now();
  if (e.lockedUntil > now) return { ok: false, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
  if (e.tries.length >= TRY_LIMIT) {
    e.lockedUntil = now + LOCK_MS;
    return { ok: false, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  e.tries.push(now);
  return { ok: true };
}

export function recordFailure(key: string) {
  const e = entry(key);
  e.fails.push(Date.now());
  if (e.fails.length >= FAIL_LIMIT) {
    e.lockedUntil = Date.now() + LOCK_MS;
    e.fails = [];
  }
}

export function recordSuccess(key: string) {
  store.delete(key);
}

export const limitMessage = (sec: number) => `시도가 너무 많습니다. ${Math.ceil(sec / 60)}분 뒤에 다시 해주세요.`;
