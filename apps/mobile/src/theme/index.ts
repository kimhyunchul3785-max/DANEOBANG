/**
 * 모바일 테마 — @daneobang/design-tokens 를 StyleSheet 로 소비한다 (CSS 는 공유하지 않는다).
 * 글꼴 파일은 아직 싣지 않았으므로 시스템 글꼴을 쓰고, 역할(라벨·숫자·디지털)만 크기·자간·굵기로 구분한다.
 */
import { StyleSheet } from "react-native";
import { color, layout, motion, onAccent, radius, spacing, typography } from "@daneobang/design-tokens";

export const colors = color;
export const accentTone = onAccent;
export { radius, spacing, motion, layout };


const T = typography.size;

/** 글자 역할 — 앱은 웹보다 한 단계 크게. 대문자 라벨 · 얇은 숫자 · 고정폭 글꼴은 쓰지 않는다 */
export const text = StyleSheet.create({
  label: { fontSize: T.label, color: color.inkTertiary, fontWeight: "500" },
  labelInk: { fontSize: T.label, color: color.ink, fontWeight: "600" },
  labelOnAccent: { fontSize: T.label, color: onAccent.label, fontWeight: "500" },
  /** 상태·카운터: 본문 글꼴 tabular 굵게 */
  digital: { fontSize: 15, fontWeight: "600", color: color.ink, fontVariant: ["tabular-nums"] },
  digitalLg: { fontSize: 22, fontWeight: "700", color: color.ink, fontVariant: ["tabular-nums"] },
  numXl: { fontSize: T.numXl, fontWeight: "700", letterSpacing: -1.5, color: color.ink, fontVariant: ["tabular-nums"] },
  numLg: { fontSize: T.numLg, fontWeight: "700", letterSpacing: -1, color: color.ink, fontVariant: ["tabular-nums"] },
  numMd: { fontSize: T.numMd, fontWeight: "700", letterSpacing: -0.5, color: color.ink, fontVariant: ["tabular-nums"] },
  h1: { fontSize: T.h1, fontWeight: "700", letterSpacing: -0.6, color: color.ink, lineHeight: 34 },
  title: { fontSize: T.title, fontWeight: "700", letterSpacing: -0.3, color: color.ink, lineHeight: 26 },
  cardTitle: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: color.ink },
  body: { fontSize: T.body, color: color.ink, lineHeight: 23 },
  bodyStrong: { fontSize: T.body, color: color.ink, fontWeight: "600", lineHeight: 23 },
  muted: { fontSize: 14, color: color.inkTertiary, lineHeight: 20 },
  caption: { fontSize: T.caption, color: color.inkSecondary, lineHeight: 18 },
  onAccent: { color: color.accentInk },
  accent: { color: color.accent },
  warn: { color: color.warn },
  success: { color: color.success },
});

const hairline = { borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong };

/** 면 · 모듈 — 흰 표면 + 헤어라인 한 종류 */
export const surface = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  card: { backgroundColor: color.surface, borderRadius: radius.large, padding: spacing.lg, ...hairline },
  cardSm: { backgroundColor: color.surface, borderRadius: radius.medium, padding: spacing.lg, ...hairline },
  cardAccent: { backgroundColor: color.accent, borderRadius: radius.large, padding: spacing.lg + 2 },
  cardDark: { backgroundColor: color.charcoal, borderRadius: radius.large, padding: spacing.lg },
  pill: { backgroundColor: color.surface, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10, ...hairline },
  input: { backgroundColor: color.surface, borderRadius: radius.input, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: color.ink, borderWidth: 1, borderColor: color.lineStrong, minHeight: 48 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 14, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowFirst: { borderTopWidth: 0 },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: color.line },
});

/** 상태 배지 색 (웹 v5.4 와 같은 의미: 빨강 긴급 · 호박 할 일 · 파랑 진행 · 초록 완료) */
export const badge = {
  gray: { bg: "rgba(27, 26, 24, 0.06)", fg: color.inkSecondary },
  ink: { bg: "rgba(29, 78, 216, 0.09)", fg: color.info },
  green: { bg: "rgba(31, 122, 77, 0.11)", fg: color.success },
  red: { bg: "rgba(232, 67, 26, 0.11)", fg: "#C2360F" },
  amber: { bg: "rgba(217, 119, 6, 0.12)", fg: color.warn },
  blue: { bg: "rgba(29, 78, 216, 0.09)", fg: color.info },
} as const;
export type BadgeTone = keyof typeof badge;
