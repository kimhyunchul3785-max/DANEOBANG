/**
 * 설정 (P0 최소) — 현재 학원 · 계정 · 다른 학원으로 전환 · 로그아웃 · 앱 버전. 결제·Seat·학원 설정은 웹.
 */
import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, Label, PageHeader, Row, Screen, confirmAsync } from "@/components/ui";
import { spacing, text } from "@/theme";

const ROLE_KO: Record<string, string> = { OWNER: "학원장", TEACHER: "선생님", ADMIN: "관리자" };

export default function SettingsScreen() {
  const { me, academyId, clearAcademy, signOut } = useAuth();
  const router = useRouter();
  const membership = me?.memberships.find((m) => m.academy.id === academyId);
  const version = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <Screen>
      <PageHeader kicker="설정" title="설정" />
      <Card>
        <Label>현재 학원</Label>
        <Text style={[text.title, { marginTop: 6 }]}>{membership?.academy.name ?? "—"}</Text>
        <Text style={[text.muted, { marginTop: 2 }]}>
          {membership ? ROLE_KO[membership.role] ?? membership.role : ""}
          {membership?.academy.slug ? ` · /${membership.academy.slug}` : ""}
        </Text>
        {(me?.memberships.length ?? 0) > 1 && (
          <Button
            variant="secondary"
            onPress={async () => {
              await clearAcademy();
              router.replace("/select-academy");
            }}
            style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
          >
            다른 학원으로 전환
          </Button>
        )}
      </Card>
      <Card>
        <Label>계정</Label>
        <Row first title={me?.user.name ?? ""} subtitle={me?.user.email ?? "이메일 없음"} />
        {membership?.role === "OWNER" ? (
          <Row title="학원 설정 · 선생님 · 요금제" subtitle="웹에서 열기 ↗" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/app/settings`)} />
        ) : (
          <Row title="출제 · 단어장 · 성적 전체" subtitle="웹에서 열기 ↗" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/app`)} />
        )}
      </Card>
      <Card>
        <Label>앱</Label>
        <Row first title="버전" right={<Text style={text.muted}>{version}</Text>} />
        {__DEV__ && <Row title="API" right={<Text style={text.muted}>{API_BASE_URL}</Text>} />}
      </Card>
      <Button
        variant="ghost"
        onPress={async () => {
          if (await confirmAsync("로그아웃", "이 기기에서 로그아웃할까요?", "로그아웃")) void signOut();
        }}
        style={{ alignSelf: "flex-start" }}
      >
        로그아웃
      </Button>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
