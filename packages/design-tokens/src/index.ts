/**
 * 단어방 디자인 토큰 — "quiet technology".
 * 웹은 globals.css 의 CSS 변수로, 모바일은 StyleSheet 로 각자 소비한다. React 컴포넌트·CSS 는 공유하지 않는다.
 * 값의 원본은 apps/web/src/app/globals.css :root 와 같아야 한다.
 */
export const color = {
  background: "#E9E6E1", // 페이지 (warm gray) — 순백 없음
  backgroundDeep: "#DFDBD4",
  surface: "#F3F1ED", // 모듈(카드)
  surfaceRaised: "#FAF9F6", // 입력 · 필
  ink: "#1B1A18", // 텍스트 · 선택 상태
  inkSecondary: "#4A4843",
  inkTertiary: "#8B8780",
  line: "rgba(27, 26, 24, 0.08)",
  accent: "#E8431A", // 화면당 큰 모듈 1개 · 재시험 · 마감 임박 · 제출
  accentInk: "#FFF4F0", // 강조 배경 위 글자
  charcoal: "#232220", // 어두운 모듈 · 동작 바
  charcoal2: "#2F2E2B",
  success: "#1F7A4D",
} as const;

/** 강조(주황) 배경 위에서 쓰는 반투명 흰 톤 */
export const onAccent = {
  label: "rgba(255, 244, 240, 0.8)",
  track: "rgba(255, 244, 240, 0.16)",
  trackHover: "rgba(255, 244, 240, 0.28)",
  muted: "rgba(255, 244, 240, 0.6)",
} as const;

export const radius = {
  large: 24, // 큰 모듈
  medium: 18, // 작은 모듈 · 드롭존
  input: 14,
  small: 10,
  pill: 999, // 상태 · 컨트롤
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 모션 — 빠르고 절제된 기계적 전환. 바운스 없음. 웹은 CSS/GSAP, 모바일은 Reanimated 가 같은 값을 쓴다 */
export const motion = {
  duration: {
    instant: 120, // 색 전환 · 눌림
    fast: 160,
    normal: 240, // 카드 등장 · 목록 변화
    slow: 400, // 화면 전환 · 링/미터 채움
  },
  distance: {
    subtle: 6,
    normal: 12,
    strong: 20,
  },
  /** cubic-bezier(0.2, 0.8, 0.2, 1) — 감속 곡선 */
  easing: [0.2, 0.8, 0.2, 1] as const,
  easingCss: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

/** 글꼴 역할 — 실제 글꼴 파일은 앱마다 따로 싣는다 */
export const typography = {
  family: {
    body: "Pretendard", // 한글 본문
    ui: "Space Grotesk", // 소문 라벨 (대문자 · 자간 0.16em)
    numeric: "Inter Tight", // 큰 숫자 (200~300)
    digital: "DotGothic16", // 상태 · 카운터 (READY / 01/20 / D-6)
  },
  size: {
    label: 10.5,
    caption: 12,
    body: 14,
    bodyLarge: 15,
    title: 20,
    h1: 26,
    numMd: 28,
    numLg: 44,
  },
  letterSpacing: { label: 0.16, button: 0.08 }, // em
  weight: { light: "300", regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

export type ColorToken = keyof typeof color;
