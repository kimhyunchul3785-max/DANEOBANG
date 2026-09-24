/**
 * 선생님 탭 — 오늘 · 학생 · 시험 · 설정. 성적은 학생 상세·시험 상세에서 본다.
 */
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { colors, layout } from "@/theme";
import { useSizeClass } from "@/components/ui";

const icon =
  (name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => <Ionicons name={focused ? focusedName : name} size={size - 2} color={color} />;

export default function TeacherTabs() {
  // 딥링크·알림·복원으로 하위 화면부터 열려도, 인증과 학원 선택이 끝나기 전에는 화면을 그리지 않는다 (AuthGate 가 곧 옮겨 준다)
  const { status, academyId } = useAuth();
  // 태블릿 가로·iPad(expanded): 탭을 왼쪽 레일로 — 넓은 화면 아래에 휴대폰 탭 바를 길게 늘이지 않는다
  const size = useSizeClass();
  const rail = size === "expanded";
  if (status !== "signedIn" || !academyId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  return (
    <Tabs
      tabBar={rail ? (props) => <RailTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarPosition: rail ? "left" : "bottom",
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: layout.tabBar, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "오늘", tabBarIcon: icon("today-outline", "today") }} />
      <Tabs.Screen name="students" options={{ title: "학생", tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="exams" options={{ title: "시험", tabBarIcon: icon("document-text-outline", "document-text") }} />
      <Tabs.Screen name="settings" options={{ title: "설정", tabBarIcon: icon("settings-outline", "settings") }} />
      {/* 오늘 › 재시험 카드에서 들어가는 화면 (탭에는 없음) */}
      <Tabs.Screen name="retakes" options={{ href: null, title: "재시험" }} />
    </Tabs>
  );
}

const RAIL_ROUTES = ["index", "students", "exams", "settings"];
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** 태블릿 가로·iPad 의 왼쪽 레일: 아이콘 위 · 라벨 아래, 한 칸 72px (손가락 크기) */
function RailTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ width: layout.railWidth, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.line, paddingTop: insets.top + 24, alignItems: "center", gap: 4 }}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        if (!RAIL_ROUTES.includes(route.name)) return null; // 탭에 없는 화면(재시험 등)은 레일에도 없다
        const focused = state.index === i;
        const color = focused ? colors.ink : colors.inkTertiary;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: focused ? colors.fill : pressed ? colors.fill : "transparent" })}
          >
            {options.tabBarIcon?.({ focused, color, size: 26 })}
            <Text style={{ fontSize: 12, fontWeight: focused ? "700" : "600", color }}>{typeof options.title === "string" ? options.title : route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
