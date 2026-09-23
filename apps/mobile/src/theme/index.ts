/**
 * 모바일 테마 — @daneobang/design-tokens 를 StyleSheet 로 소비한다 (CSS 는 공유하지 않는다).
 * 글꼴 파일은 아직 싣지 않았으므로 시스템 글꼴을 쓰고, 역할(라벨·숫자·디지털)만 크기·자간·굵기로 구분한다.
 */
import { Platform, StyleSheet } from "react-native";
import { color, motion, onAccent, radius, spacing, typography } from "@daneobang/design-tokens";

export const colors = color;
export const accentTone = onAccent;
export { radius, spacing, motion };

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** 글자 역할 */
export const text = StyleSheet.create({
  /** 작은 대문자 라벨 (TODAY · STUDENTS) */
  label: { fontSize: typography.size.label, letterSpacing: 1.6, textTransform: "uppercase", color: color.inkTertiary, fontWeight: "500" },
  labelInk: { fontSize: typography.size.label, letterSpacing: 1.6, textTransform: "uppercase", color: color.ink, fontWeight: "500" },
  labelOnAccent: { fontSize: typography.size.label, letterSpacing: 1.6, textTransform: "uppercase", color: onAccent.label, fontWeight: "500" },
  /** 도트매트릭스 대용: 고정폭, 상태·카운터에만 */
  digital: { fontFamily: mono, fontSize: 14, letterSpacing: 1, color: color.ink },
  digitalLg: { fontFamily: mono, fontSize: 22, letterSpacing: 1, color: color.ink },
  /** 큰 숫자 (얇게) */
  numXl: { fontSize: 56, fontWeight: "200", letterSpacing: -1.5, color: color.ink, fontVariant: ["tabular-nums"] },
  numLg: { fontSize: 40, fontWeight: "200", letterSpacing: -1, color: color.ink, fontVariant: ["tabular-nums"] },
  numMd: { fontSize: 26, fontWeight: "300", color: color.ink, fontVariant: ["tabular-nums"] },
  h1: { fontSize: typography.size.h1, fontWeight: "700", letterSpacing: -0.5, color: color.ink, lineHeight: 30 },
  title: { fontSize: typography.size.title, fontWeight: "600", color: color.ink, lineHeight: 26 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: color.ink },
  body: { fontSize: typography.size.body, color: color.ink, lineHeight: 21 },
  bodyStrong: { fontSize: typography.size.body, color: color.ink, fontWeight: "600", lineHeight: 21 },
  muted: { fontSize: 13, color: color.inkTertiary, lineHeight: 19 },
  caption: { fontSize: typography.size.caption, color: color.inkSecondary, lineHeight: 17 },
  onAccent: { color: color.accentInk },
  accent: { color: color.accent },
  success: { color: color.success },
});

/** 면 · 모듈 */
export const surface = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  card: { backgroundColor: color.surface, borderRadius: radius.large, padding: spacing.lg },
  cardSm: { backgroundColor: color.surface, borderRadius: radius.medium, padding: spacing.lg },
  cardAccent: { backgroundColor: color.accent, borderRadius: radius.large, padding: spacing.lg },
  cardDark: { backgroundColor: color.charcoal, borderRadius: radius.large, padding: spacing.lg },
  pill: { backgroundColor: color.surfaceRaised, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { backgroundColor: color.surfaceRaised, borderRadius: radius.input, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: color.ink, borderWidth: 1, borderColor: color.line },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowFirst: { borderTopWidth: 0 },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: color.line },
});

/** 상태 배지 색 */
export const badge = {
  gray: { bg: "rgba(27, 26, 24, 0.06)", fg: color.inkSecondary },
  ink: { bg: "rgba(27, 26, 24, 0.9)", fg: color.surfaceRaised },
  green: { bg: "rgba(31, 122, 77, 0.12)", fg: color.success },
  red: { bg: "rgba(232, 67, 26, 0.12)", fg: color.accent },
  amber: { bg: "rgba(27, 26, 24, 0.06)", fg: color.ink },
} as const;
export type BadgeTone = keyof typeof badge;
