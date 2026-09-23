/**
 * 앱 전역 API 클라이언트 — 공용 @daneobang/api-client 에 SecureStore(토큰)·AsyncStorage(학원) 공급자를 꽂는다.
 * 401 은 authEvents 로 알려 AuthProvider 가 토큰을 지우고 로그인 화면으로 보낸다.
 */
import { createApiClient, DaneobangApiError } from "@daneobang/api-client";
import { tokenStore } from "@/storage/token";
import { academyStore } from "@/storage/academy";

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://10.0.2.2:3000").replace(/\/+$/, "");

type Listener = (err: DaneobangApiError) => void;
const listeners = new Set<Listener>();
export const authEvents = {
  onUnauthorized(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => tokenStore.get(),
  getAcademyId: () => academyStore.get(),
  onUnauthorized: (err) => listeners.forEach((fn) => fn(err)),
});

export { DaneobangApiError };

/** 사용자에게 보여줄 한 줄 오류 문구 */
export function errorMessage(e: unknown): string {
  if (e instanceof DaneobangApiError) {
    if (e.isNetwork) return `서버에 연결할 수 없어요 (${API_BASE_URL}).`;
    if (e.status === 403 && e.code === "no_academy") return "학원을 먼저 선택하세요.";
    if (e.status === 403 && e.code === "email_login_disabled") return "서버에서 이메일 로그인이 꺼져 있어요 (ALLOW_DEV_LOGIN).";
    return e.message || e.code;
  }
  return e instanceof Error ? e.message : String(e);
}
