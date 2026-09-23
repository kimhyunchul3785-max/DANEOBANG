/**
 * Expo Push Token 등록 기반 (v0.1: 발송 없음). 로그인 직후 한 번 시도하며 실패해도 앱 흐름을 막지 않는다.
 *  - Expo Go(Android) 에서는 원격 푸시가 안 되므로 조용히 건너뛴다. Development Build 에서 동작.
 *  - projectId(app.json extra.eas.projectId) 가 없으면 건너뛴다.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { api } from "@/api/client";

export async function registerPushToken(): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
    await api.devices.register({ token, platform });
    return true;
  } catch {
    return false; // 푸시는 부가 기능. 토큰·오류를 로그에 남기지 않는다
  }
}
