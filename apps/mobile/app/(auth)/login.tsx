/**
 * 로그인 — Google / Kakao 로 계속하기. 운영 앱에는 이메일 로그인 UI 가 없다.
 * DEV LOGIN 은 개발 빌드(__DEV__)에서만 보이고, 서버가 ALLOW_DEV_LOGIN=false 면 서버가 403 으로 막는다.
 */
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AuthSession from "expo-auth-session";
import { api, API_BASE_URL, errorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { googleAccessToken, googleConfigured, kakaoConfigured, kakaoDiscovery, kakaoExchange, kakaoRedirectUri, KAKAO_REST_API_KEY } from "@/auth/providers";
import { Button, Label } from "@/components/ui";
import { colors, radius, spacing, text } from "@/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithToken, error: bootError } = useAuth();
  const [busy, setBusy] = useState<"google" | "kakao" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Kakao: 표준 인증 코드 흐름 (PKCE 없이 · client secret 없음 — Kakao 콘솔 "사용 안함")
  const [kakaoRequest, kakaoResponse, kakaoPrompt] = AuthSession.useAuthRequest(
    { clientId: KAKAO_REST_API_KEY || "unset", redirectUri: kakaoRedirectUri, responseType: AuthSession.ResponseType.Code, usePKCE: false, scopes: [] },
    kakaoDiscovery,
  );

  useEffect(() => {
    if (!kakaoResponse) return;
    if (kakaoResponse.type === "success") {
      (async () => {
        try {
          const providerToken = await kakaoExchange(kakaoResponse.params.code);
          const { token } = await api.auth.oauth({ provider: "kakao", accessToken: providerToken });
          await signInWithToken(token);
        } catch (e) {
          setErr(errorMessage(e));
        } finally {
          setBusy(null);
        }
      })();
    } else {
      setBusy(null);
      if (kakaoResponse.type === "error") setErr(kakaoResponse.error?.message ?? "카카오 로그인에 실패했어요.");
    }
  }, [kakaoResponse, signInWithToken]);

  const onGoogle = async () => {
    setErr(null);
    setBusy("google");
    try {
      const providerToken = await googleAccessToken();
      if (!providerToken) return; // 취소
      const { token } = await api.auth.oauth({ provider: "google", accessToken: providerToken });
      await signInWithToken(token);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const onKakao = async () => {
    setErr(null);
    if (!kakaoConfigured()) {
      setErr("EXPO_PUBLIC_KAKAO_REST_API_KEY 가 비어 있어요.");
      return;
    }
    setBusy("kakao");
    await kakaoPrompt();
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.md }}>
        <Label>학원 단어 시험</Label>
        <Text style={styles.wordmark}>단어방</Text>
        <Text style={[text.title, { marginTop: 4 }]}>단어 테스트를{"\n"}더 간단하게.</Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {(err || bootError) && (
          <Text style={[text.caption, text.accent, { fontWeight: "600" }]} accessibilityRole="alert">
            {err ?? bootError}
          </Text>
        )}
        <Pressable onPress={onGoogle} disabled={!!busy} style={({ pressed }) => [styles.provider, styles.google, pressed && { opacity: 0.85 }, !!busy && busy !== "google" && { opacity: 0.5 }]} accessibilityRole="button">
          <Text style={[styles.providerText, { color: colors.ink }]}>{busy === "google" ? "확인 중…" : "Google로 계속하기"}</Text>
        </Pressable>
        <Pressable onPress={onKakao} disabled={!!busy || !kakaoRequest} style={({ pressed }) => [styles.provider, styles.kakao, pressed && { opacity: 0.85 }, !!busy && busy !== "kakao" && { opacity: 0.5 }]} accessibilityRole="button">
          <Text style={[styles.providerText, { color: "#191600" }]}>{busy === "kakao" ? "확인 중…" : "카카오로 계속하기"}</Text>
        </Pressable>
        {!googleConfigured() && !kakaoConfigured() && <Text style={[text.muted, { textAlign: "center" }]}>{__DEV__ ? "구글·카카오 키가 아직 설정되지 않았어요 · apps/mobile/.env" : "지금은 로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요."}</Text>}
        {__DEV__ && (
          <Button variant="ghost" onPress={() => router.push("/(auth)/dev-login")} style={{ marginTop: spacing.sm }}>
            Dev login
          </Button>
        )}
        {__DEV__ && (
          <Pressable onLongPress={() => Alert.alert("API", API_BASE_URL)}>
            <Text style={[text.label, { textAlign: "center" }]}>{API_BASE_URL.replace(/^https?:\/\//, "")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  wordmark: { fontSize: 52, fontWeight: "800", letterSpacing: -2, color: colors.ink, lineHeight: 58 },
  provider: { borderRadius: radius.pill, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  google: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line },
  kakao: { backgroundColor: "#FEE500" },
  providerText: { fontSize: 14, fontWeight: "600" },
});
