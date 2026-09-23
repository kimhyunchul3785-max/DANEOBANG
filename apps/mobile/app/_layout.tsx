/**
 * 루트 레이아웃 — Query · Auth 공급자 + 인증 상태에 따른 화면 분기.
 *   미로그인 → (auth)/login · 학원 여러 개 → select-academy · 학생 자리만 → student-only · 그 외 → (teacher) 탭
 */
import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/query/client";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, needsAcademySelect, studentOnly, academyId } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    SplashScreen.hideAsync().catch(() => {});
    const group = segments[0] as string | undefined;
    const inAuth = group === "(auth)";
    if (status === "signedOut") {
      if (!inAuth) router.replace("/(auth)/login");
      return;
    }
    // signedIn
    if (needsAcademySelect) {
      if (group !== "select-academy") router.replace("/select-academy");
      return;
    }
    if (studentOnly || !academyId) {
      // 학생 자리만 있거나(웹 학생 화면 안내), 아직 아무 학원에도 연결되지 않은 계정(웹에서 학원 만들기·참여 안내)
      if (group !== "student-only") router.replace("/student-only");
      return;
    }
    // 학원이 정해짐 → 선생님 탭. 설정에서 "다른 학원으로 전환"을 눌러 select-academy 에 머무는 경우는 허용
    if (inAuth || group === "student-only" || group === undefined || group === "index") router.replace("/(teacher)");
  }, [status, needsAcademySelect, studentOnly, academyId, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="select-academy" options={{ animation: "slide_from_bottom" }} />
                <Stack.Screen name="student-only" />
                <Stack.Screen name="(teacher)" />
              </Stack>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
