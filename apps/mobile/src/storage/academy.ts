/**
 * 선택한 학원 id (x-academy-id) — 민감정보가 아니므로 AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "daneobang.academyId";
let cache: string | null | undefined;

export const academyStore = {
  async get(): Promise<string | null> {
    if (cache !== undefined) return cache;
    try {
      cache = (await AsyncStorage.getItem(KEY)) ?? null;
    } catch {
      cache = null;
    }
    return cache;
  },
  async set(id: string) {
    cache = id;
    await AsyncStorage.setItem(KEY, id);
  },
  async clear() {
    cache = null;
    await AsyncStorage.removeItem(KEY).catch(() => {});
  },
};
