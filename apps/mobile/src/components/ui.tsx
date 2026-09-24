/**
 * 작은 UI 부품 — 웹의 .lbl / .digital / .card / .badge / .btn 에 대응한다. 웹 컴포넌트는 공유하지 않고 토큰만 같다.
 */
import React from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions, type PressableProps, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { badge, colors, layout, radius, spacing, surface, text, type BadgeTone } from "@/theme";

/** 화면 폭 등급 — compact(휴대폰) · medium(큰 휴대폰 가로·태블릿 세로) · expanded(태블릿 가로·iPad) */
export type SizeClass = "compact" | "medium" | "expanded";
export function useSizeClass(): SizeClass {
  const { width } = useWindowDimensions();
  return width >= layout.expanded ? "expanded" : width >= layout.medium ? "medium" : "compact";
}

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
    assigned: ["안 침", "gray"],
    in_progress: ["진행 중", "ink"],
    completed: ["완료", "green"],
    review: ["확인 필요", "amber"],
    expired: ["기한 지남", "red"],
    published: ["발행", "green"],
    draft: ["초안", "amber"],
    archived: ["휴지통", "gray"],
  };
  const [label, tone] = map[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Button({ children, variant = "primary", loading, style, ...rest }: PressableProps & { children: React.ReactNode; variant?: "primary" | "accent" | "secondary" | "ghost" | "onAccent"; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const v = styles[`btn_${variant}` as const];
  const fg = variant === "primary" ? "#FFFFFF" : variant === "accent" ? "#FFFFFF" : variant === "onAccent" ? colors.accent : colors.ink;
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
      {onPress && <Text style={[text.muted, { marginLeft: 2, fontSize: 20, color: colors.inkQuaternary }]}>›</Text>}
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

/**
 * 화면 틀: 안전영역 + 스크롤 + 당겨서 새로고침.
 * 폭 등급마다 본문 폭을 다르게 — 휴대폰은 꽉 차게, medium 은 가운데 640, expanded 는 1180 까지(두 열 화면용).
 * 태블릿에서 휴대폰 한 열을 그냥 늘려 놓지 않기 위한 틀이다.
 */
export function Screen({ children, refreshing, onRefresh, padded = true, wide, ...rest }: ScrollViewProps & { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; wide?: boolean }) {
  const insets = useSafeAreaInsets();
  const size = useSizeClass();
  // wide 화면(두 열을 쓰는 화면)은 태블릿 세로에서도 폭을 다 쓴다 — 한 열 화면만 640 으로 모은다
  const max = size === "expanded" ? (wide ? layout.wideMax : layout.contentMax + 80) : size === "medium" ? (wide ? 960 : layout.contentMax) : undefined;
  return (
    <ScrollView
      style={surface.screen}
      contentContainerStyle={[{ paddingTop: insets.top + (size === "compact" ? spacing.lg : spacing.xl), paddingBottom: insets.bottom + 96, gap: spacing.md }, padded && { paddingHorizontal: size === "compact" ? spacing.lg : spacing.xl }, max ? { width: "100%", maxWidth: max, alignSelf: "center" } : null]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.ink} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** 두 열 (폭 720 이상 — 태블릿 세로부터). 그보다 좁으면 위→아래로 쌓는다 — 순서가 곧 우선순위 */
export function Columns({ left, right, rightWidth = 360 }: { left: React.ReactNode; right: React.ReactNode; rightWidth?: number }) {
  const { width } = useWindowDimensions();
  const size = useSizeClass();
  // 태블릿 세로(≥720)부터 두 열. 오른쪽 열은 medium 300 · expanded 지정 폭
  if (width < 720)
    return (
      <>
        {left}
        {right}
      </>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.lg }}>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.md }}>{left}</View>
      <View style={{ width: size === "expanded" ? rightWidth : 300, gap: spacing.md }}>{right}</View>
    </View>
  );
}

/** 카드 머리: 제목 + 오른쪽 보조 (숫자·링크) */
export function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
      <Text style={text.cardTitle}>{title}</Text>
      {typeof right === "string" || typeof right === "number" ? <Text style={[text.muted, { fontWeight: "600" }]}>{right}</Text> : right}
    </View>
  );
}

/** 진행 막대 (완료 비율) */
export function Progress({ value, total, tone = "ink", height = 8 }: { value: number; total: number; tone?: "ink" | "accent" | "success"; height?: number }) {
  const pct = total ? Math.max(0, Math.min(1, value / total)) : 0;
  const c = tone === "accent" ? colors.accent : tone === "success" ? colors.success : colors.ink;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.fill, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: height, backgroundColor: c }} />
    </View>
  );
}

export function PageHeader({ kicker, title, right }: { kicker?: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <Label>{kicker}</Label> : null}
        <Text style={[text.h1, { marginTop: kicker ? 2 : 0 }]} numberOfLines={2}>
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
      <Label tone="onAccent">오류</Label>
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
export function StatTile({ label, value, sub, accent, style, onPress }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = (
    <Card tone="sm" style={[{ flex: 1, minWidth: 0 }, style]}>
      <Text style={[text.label, { fontWeight: "600", color: colors.inkSecondary }]}>{label}</Text>
      <Text style={[text.numLg, { marginTop: 6 }, accent && text.accent]}>{value}</Text>
      {sub && <Text style={[text.muted, { marginTop: 2 }]}>{sub}{onPress ? " ›" : ""}</Text>}
    </Card>
  );
  // 누르면 해당 목록으로 — 숫자만 보여 주고 끝나지 않게
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} ${String(value)} 보기`} style={({ pressed }) => [{ flex: 1, minWidth: 0 }, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** 알약 모양 선택 칩 묶음 (필터) */
export function Segments<K extends string>({ items, value, onChange }: { items: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="radio" accessibilityState={{ selected: value === k }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: value === k ? colors.ink : colors.surface, borderWidth: value === k ? 0 : StyleSheet.hairlineWidth, borderColor: colors.lineStrong }}>
          <Text style={[{ fontSize: 15, fontWeight: "600", color: colors.inkSecondary }, value === k && { color: "#fff" }]}>{l}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9, alignSelf: "flex-start" },
  badgeText: { fontSize: 13, fontWeight: "700" },
  btn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minHeight: layout.touch },
  btnText: { fontSize: 16, fontWeight: "700" },
  btn_primary: { backgroundColor: colors.ink },
  btn_accent: { backgroundColor: colors.accent },
  btn_secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  btn_ghost: { backgroundColor: "transparent" },
  btn_onAccent: { backgroundColor: colors.accentInk },
});

/** 확인 대화상자 (iOS·Android: Alert · 웹 미리보기: confirm) */
export function confirmAsync(title: string, message: string, ok = "확인"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${title}\n${message}`) : true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "취소", style: "cancel", onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]),
  );
}

/** 결과 한 줄 알림 (작업 뒤) */
export function notice(message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message);
    return;
  }
  Alert.alert(message);
}
