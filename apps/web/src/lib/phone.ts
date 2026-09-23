/** 휴대폰 번호 유틸 (클라이언트에서도 사용 — 서버 전용 모듈을 import 하지 않는다) */
export function normalizePhone(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.startsWith("82") && d.length >= 11 ? "0" + d.slice(2) : d;
}
export function fmtPhone(v: string | null | undefined) {
  const d = normalizePhone(v);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v ?? "";
}
export function isPhone(v: string) {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(v));
}
