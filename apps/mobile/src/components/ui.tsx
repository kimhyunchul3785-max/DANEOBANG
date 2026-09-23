/**
 * 작은 UI 부품 — 웹의 .lbl / .digital / .card / .badge / .btn 에 대응한다. 웹 컴포넌트는 공유하지 않고 토큰만 같다.
 */
import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type PressableProps, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { badge, colors, radius, spacing, surface, text, type BadgeTone } from "@/theme";

export function Label({ children, tone = "muted", style }: { children: React.ReactNode; tone?: "muted" | "ink" | "onAccent"; style?: StyleProp<TextStyle> }) {
  return <Text style={[tone === "ink" ? text.labelInk : tone === "onAccent" ? text.labelOnAccent : text.label, style]}>{children}</Text>;
}

export function Digital({ children, large, style }: { children: React.ReactNode; large?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[large ? text.digitalLg : text.digital, style]}>{children}</Text>;
}

export function Card({ children, tone = "surface", style }: { children: React.ReactNode; tone?: "surface" | "accent" | "dark" | "sm"; style?: StyleProp<ViewStyle> }) {
  const base = tone === "accent" ? surface.cardAccent : tone === "dark" ? surface.cardDark : tone === "sm" ? surface.cardSm : surface.card;
  return <View style={[base, style]}>{children}</View>;
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: BadgeTone }) {
  const c = badge[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

/** 배정 상태 → 배지 (웹 StatusBadge 와 같은 규칙) */
export function StatusBadge({ status, expired }: { status: string; expired?: boolean }) {
  if (expired) return <Badge tone="red">기한 지남</Badge>;
  const map: Record<string, [string, BadgeTone]> = {
    assigned: ["OPEN", "gray"],
    in_progress: ["진행 중", "ink"],
    completed: ["DONE", "green"],
    review: ["확인 필요", "amber"],
    expired: ["기한 지남", "red"],
    published: ["발행", "green"],
    draft: ["초안", "amber"],
    archived: ["보관", "gray"],
  };
  const [label, tone] = map[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Button({ children, variant = "primary", loading, style, ...rest }: PressableProps & { children: React.ReactNode; variant?: "primary" | "accent" | "secondary" | "ghost" | "onAccent"; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const v = styles[`btn_${variant}` as const];
  const fg = variant === "primary" ? colors.surfaceRaised : variant === "accent" ? colors.accentInk : variant === "onAccent" ? colors.accent : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      disabled={rest.disabled || loading}
      style={({ pressed }) => [styles.btn, v, pressed && { opacity: 0.85, transform: [{ translateY: 1 }] }, (rest.disabled || loading) && { opacity: 0.45 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{children}</Text>}
    </Pressable>
  );
}

/** 목록 줄: 왼쪽 제목·부제, 오른쪽 내용 */
export function Row({ title, subtitle, right, onPress, first }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; first?: boolean }) {
  const inner = (
    <View style={[surface.row, first && surface.rowFirst]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === "string" ? (
          <Text style={text.bodyStrong} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? typeof subtitle === "string" ? <Text style={[text.muted, { marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text> : subtitle : null}
      </View>
      {right}
      {onPress && <Text style={[text.muted, { marginLeft: 2 }]}>›</Text>}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }} accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    inner
  );
}

/** 화면 틀: 안전영역 + 스크롤 + 당겨서 새로고침 */
export function Screen({ children, refreshing, onRefresh, padded = true, ...rest }: ScrollViewProps & { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={surface.screen}
      contentContainerStyle={[{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96, gap: spacing.md }, padded && { paddingHorizontal: spacing.lg }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.ink} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function PageHeader({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Label>{kicker}</Label>
        <Text style={[text.h1, { marginTop: 4 }]} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: spacing.md }}>
      <ActivityIndicator color={colors.ink} />
      <Text style={text.muted}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="dark">
      <Label tone="onAccent">Error · 오류</Label>
      <Text style={[text.body, { color: "#ECE9E3", marginTop: 6 }]}>{message}</Text>
      {onRetry && (
        <Button variant="secondary" onPress={onRetry} style={{ marginTop: spacing.md, alignSelf: "flex-start" }}>
          다시 시도
        </Button>
      )}
    </Card>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ paddingVertical: 28, alignItems: "center", gap: 4 }}>
      <Text style={text.bodyStrong}>{title}</Text>
      {hint && <Text style={text.muted}>{hint}</Text>}
    </View>
  );
}

/** 큰 숫자 타일 (오늘 화면) */
export function StatTile({ label, value, sub, accent, style }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Card tone="sm" style={[{ flex: 1, minWidth: 0 }, style]}>
      <Label>{label}</Label>
      <Text style={[text.numLg, { marginTop: 10 }, accent && text.accent]}>{value}</Text>
      {sub && <Text style={[text.muted, { marginTop: 2 }]}>{sub}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9, alignSelf: "flex-start" },
  badgeText: { fontSize: 11.5, fontWeight: "600" },
  btn: { borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minHeight: 44 },
  btnText: { fontSize: 12.5, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase" },
  btn_primary: { backgroundColor: colors.ink },
  btn_accent: { backgroundColor: colors.accent },
  btn_secondary: { backgroundColor: colors.surfaceRaised },
  btn_ghost: { backgroundColor: "transparent" },
  btn_onAccent: { backgroundColor: colors.accentInk },
});
