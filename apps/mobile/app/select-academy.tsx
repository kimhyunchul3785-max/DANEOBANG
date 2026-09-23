/**
 * 학원 선택 — /me 의 memberships 가 둘 이상일 때. 고른 id 는 AsyncStorage, 이후 모든 학원 API 에 x-academy-id.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Label, Screen } from "@/components/ui";
import { colors, radius, spacing, text } from "@/theme";

const ROLE_KO: Record<string, string> = { OWNER: "학원장", TEACHER: "선생님", ADMIN: "관리자" };

export default function SelectAcademyScreen() {
  const { me, academyId, selectAcademy, signOut } = useAuth();
  const router = useRouter();
  const memberships = me?.memberships ?? [];
  return (
    <Screen>
      <Label>{me?.user.name}</Label>
      <Text style={text.h1}>학원 선택</Text>
      <Text style={text.muted}>어느 학원으로 들어갈까요? 나중에 설정에서 바꿀 수 있어요.</Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {memberships.map((m) => {
          const on = m.academy.id === academyId;
          return (
            <Pressable
              key={m.academy.id}
              onPress={async () => {
                await selectAcademy(m.academy.id);
                router.replace("/(teacher)");
              }}
              accessibilityRole="button"
              style={({ pressed }) => [{ backgroundColor: on ? colors.ink : colors.surface, borderRadius: radius.large, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }, pressed && { opacity: 0.8 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[text.title, on && { color: colors.surfaceRaised }]}>{m.academy.name}</Text>
                <Text style={[text.label, { marginTop: 4 }, on && { color: "rgba(250,249,246,0.6)" }]}>
                  {m.role} · {ROLE_KO[m.role] ?? m.role}
                </Text>
              </View>
              <Text style={[text.title, on && { color: colors.surfaceRaised }]}>→</Text>
            </Pressable>
          );
        })}
      </View>
      {(me?.students.length ?? 0) > 0 && <Text style={[text.muted, { marginTop: spacing.sm }]}>학생 자리 {me?.students.length}개는 웹 학생 화면(/learn)에서 씁니다.</Text>}
      <Button variant="ghost" onPress={signOut} style={{ alignSelf: "flex-start", marginTop: spacing.lg }}>
        Sign out
      </Button>
    </Screen>
  );
}
