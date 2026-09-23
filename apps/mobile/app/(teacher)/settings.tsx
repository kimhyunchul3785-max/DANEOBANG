/**
 * 설정 (P0 최소) — 현재 학원 · 계정 · 다른 학원으로 전환 · 로그아웃 · 앱 버전. 결제·Seat·학원 설정은 웹.
 */
import React from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, Label, PageHeader, Row, Screen } from "@/components/ui";
import { spacing, text } from "@/theme";

const ROLE_KO: Record<string, string> = { OWNER: "학원장", TEACHER: "선생님", ADMIN: "관리자" };

export default function SettingsScreen() {
  const { me, academyId, clearAcademy, signOut } = useAuth();
  const router = useRouter();
  const membership = me?.memberships.find((m) => m.academy.id === academyId);
  const version = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <Screen>
      <PageHeader kicker="Settings · 설정" title="설정" />
      <Card>
        <Label>Academy · 현재 학원</Label>
        <Text style={[text.title, { marginTop: 6 }]}>{membership?.academy.name ?? "—"}</Text>
        <Text style={[text.muted, { marginTop: 2 }]}>
          {membership ? `${membership.role} · ${ROLE_KO[membership.role] ?? membership.role}` : ""}
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
        <Label>Account · 계정</Label>
        <Row first title={me?.user.name ?? ""} subtitle={me?.user.email ?? "이메일 없음"} />
        <Row title="학원 설정 · 선생님 · 요금제" subtitle="웹에서 관리합니다" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/app/settings`)} />
      </Card>
      <Card>
        <Label>App</Label>
        <Row first title="버전" right={<Text style={text.muted}>{version}</Text>} />
        {__DEV__ && <Row title="API" right={<Text style={text.muted}>{API_BASE_URL}</Text>} />}
      </Card>
      <Button
        variant="ghost"
        onPress={() =>
          Alert.alert("로그아웃", "이 기기에서 로그아웃할까요?", [
            { text: "취소", style: "cancel" },
            { text: "로그아웃", style: "destructive", onPress: () => void signOut() },
          ])
        }
        style={{ alignSelf: "flex-start" }}
      >
        Sign out · 로그아웃
      </Button>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
