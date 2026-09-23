/**
 * 공급사 로그인 → 공급사 access token → POST /auth/oauth → 단어방 JWT.
 * 공급사 토큰은 저장하지 않는다. Google 은 expo-auth-session 의 Google provider 가 SDK 문서에서 deprecated 라
 * 권장 라이브러리(@react-native-google-signin, Development Build 필요)를 쓰고, Kakao 는 expo-auth-session 표준 코드 흐름을 쓴다.
 */
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
export const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ?? "";

export const googleConfigured = () => !!GOOGLE_WEB_CLIENT_ID;
export const kakaoConfigured = () => !!KAKAO_REST_API_KEY;

/** Google: 네이티브 시트 → access token. 취소하면 null */
export async function googleAccessToken(): Promise<string | null> {
  if (!googleConfigured()) throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 가 비어 있어요.");
  const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID || undefined, scopes: ["profile", "email"] });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res.type !== "success") return null;
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken || null;
}

export const kakaoDiscovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
  tokenEndpoint: "https://kauth.kakao.com/oauth/token",
};
/** Kakao Developers → 플랫폼/Redirect URI 에 이 값을 등록한다: daneobang://oauth/kakao */
export const kakaoRedirectUri = AuthSession.makeRedirectUri({ scheme: "daneobang", path: "oauth/kakao" });

/** Kakao: 인증 코드 → 토큰 교환 → access token */
export async function kakaoExchange(code: string): Promise<string> {
  const token = await AuthSession.exchangeCodeAsync({ clientId: KAKAO_REST_API_KEY, code, redirectUri: kakaoRedirectUri }, kakaoDiscovery);
  return token.accessToken;
}
