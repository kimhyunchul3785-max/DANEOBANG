/**
 * 단어방 Bearer 토큰 — SecureStore 에만 저장한다. AsyncStorage · 로그 · 분석 · 오류 리포트에 절대 쓰지 않는다.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "daneobang.accessToken";
let cache: string | null | undefined; // 요청마다 SecureStore 를 읽지 않도록 메모리 캐시

export const tokenStore = {
  async get(): Promise<string | null> {
    if (cache !== undefined) return cache;
    try {
      cache = (await SecureStore.getItemAsync(KEY)) ?? null;
    } catch {
      cache = null;
    }
    return cache;
  },
  async set(token: string) {
    cache = token;
    await SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
  async clear() {
    cache = null;
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* 이미 없음 */
    }
  },
};
