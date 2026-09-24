/**
 * 학생 자리만 있는 계정 — v0.1 은 선생님용. 학생 화면은 웹(/learn)을 연다. v0.2 에서 RN 화면으로 이전.
 */
import React from "react";
import { Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, Label, Screen } from "@/components/ui";
import { spacing, text } from "@/theme";

export default function StudentOnlyScreen() {
  const { me, signOut, refreshMe } = useAuth();
  const noContext = (me?.students.length ?? 0) === 0;
  if (noContext) {
    return (
      <Screen>
        <Label>{me?.user.name}</Label>
        <Text style={text.h1}>아직 연결된{"\n"}학원이 없어요.</Text>
        <Text style={text.muted}>학원 만들기(선생님)·반 코드 참여(학생)·초대 링크는 웹에서 진행합니다. 끝나면 아래 새로고침을 누르세요.</Text>
        <Card tone="accent">
          <Label tone="onAccent">웹에서 시작하기</Label>
          <Text style={[text.title, text.onAccent, { marginTop: 6 }]}>학원 만들기 · 반 코드로 참여</Text>
          <Button variant="onAccent" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/welcome`)} style={{ marginTop: spacing.lg }}>
            웹에서 열기 →
          </Button>
        </Card>
        <Button variant="secondary" onPress={() => void refreshMe()} style={{ alignSelf: "flex-start" }}>
          새로고침
        </Button>
        <Button variant="ghost" onPress={signOut} style={{ alignSelf: "flex-start" }}>
          로그아웃
        </Button>
      </Screen>
    );
  }
  return (
    <Screen>
      <Label>{me?.user.name}</Label>
      <Text style={text.h1}>학생용 모바일 화면은{"\n"}준비 중입니다.</Text>
      <Text style={text.muted}>이 계정은 {me?.students.map((s) => s.academy.name).join(", ")} 학생 명단에 연결돼 있어요. 시험·성적·재시험·연습은 웹 학생 화면에서 그대로 쓸 수 있습니다.</Text>
      <Card tone="accent">
        <Label tone="onAccent">웹 학생 화면</Label>
        <Text style={[text.title, text.onAccent, { marginTop: 6 }]}>이번 주 시험 · 성적 · 재시험 · 연습</Text>
        <Button variant="onAccent" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/login`)} style={{ marginTop: spacing.lg }}>
          학생 화면 열기 →
        </Button>
        <Text style={[text.caption, { color: "rgba(255,244,240,0.75)", marginTop: spacing.sm }]}>브라우저에서 같은 Google·카카오 계정으로 로그인하면 바로 학생 화면이 열려요.</Text>
      </Card>
      <Button variant="ghost" onPress={signOut} style={{ alignSelf: "flex-start" }}>
        로그아웃
      </Button>
    </Screen>
  );
}
