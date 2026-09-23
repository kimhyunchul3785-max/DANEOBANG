/**
 * 선생님 탭 — 오늘 · 학생 · 시험 · 설정. 성적은 학생 상세·시험 상세에서 본다.
 */
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { colors } from "@/theme";

const icon =
  (name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => <Ionicons name={focused ? focusedName : name} size={size - 2} color={color} />;

export default function TeacherTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "오늘", tabBarIcon: icon("today-outline", "today") }} />
      <Tabs.Screen name="students" options={{ title: "학생", tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="exams" options={{ title: "시험", tabBarIcon: icon("document-text-outline", "document-text") }} />
      <Tabs.Screen name="settings" options={{ title: "설정", tabBarIcon: icon("settings-outline", "settings") }} />
    </Tabs>
  );
}
