/**
 * 단어방 디자인 토큰 — "quiet technology".
 * 웹은 globals.css 의 CSS 변수로, 모바일은 StyleSheet 로 각자 소비한다. React 컴포넌트·CSS 는 공유하지 않는다.
 * 값의 원본은 apps/web/src/app/globals.css :root 와 같아야 한다.
 */
export const color = {
  background: "#F4F3F0", // 페이지 (따뜻한 오프화이트)
  backgroundDeep: "#EBE9E4",
  surface: "#FFFFFF", // 모듈(카드) — 흰 표면 + 헤어라인
  surfaceRaised: "#F6F5F2", // 입력 · 세그먼트 트랙 · 보조 채움
  ink: "#1B1A18", // 텍스트 · 주 버튼
  inkSecondary: "#4A4843",
  inkTertiary: "#6A665F", // 보조 글자 (흰 표면 위 5:1)
  inkQuaternary: "#9A968E", // 비활성 · 자리표시
  line: "rgba(27, 26, 24, 0.09)",
  lineStrong: "rgba(27, 26, 24, 0.14)",
  fill: "rgba(27, 26, 24, 0.05)",
  accent: "#E8431A", // 학생 주 동작 · 긴급 상태에만
  accentSoft: "rgba(232, 67, 26, 0.09)",
  accentInk: "#FFF4F0", // 강조 배경 위 글자
  warn: "#B45309", // 할 일(출제 전 · 확인 필요)
  info: "#1D4ED8", // 진행 중 · 응시 대기
  charcoal: "#232220", // 동작 바
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
  large: 16, // 카드 (웹 14 — 앱은 손가락 크기에 맞춰 조금 크게)
  medium: 14,
  input: 12,
  small: 8, // 배지 · 작은 버튼
  pill: 999,
} as const;

/**
 * 가변 레이아웃 기준 (앱). 폭만 보지 않고 '쓸 수 있는 가로'로 판단한다.
 * - compact < 600: 휴대폰 — 한 열, 한 화면 한 작업
 * - medium 600–899: 큰 휴대폰 가로 · 태블릿 세로 — 한 열이되 본문 최대폭 640, 요약은 2~3칸
 * - expanded ≥ 900: 태블릿 가로 · iPad — 목록 + 상세(마스터-디테일) 또는 2열, 탭은 왼쪽 레일
 */
export const layout = {
  medium: 600,
  expanded: 900,
  contentMax: 640, // medium 에서 한 열 본문 최대폭
  wideMax: 1180, // expanded 에서 전체 최대폭
  listPane: 380, // expanded 에서 목록 열 폭
  touch: 48, // 최소 터치 높이 (웹 40)
  tabBar: 64,
  railWidth: 88,
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
    body: "Pretendard", // 한 글꼴 (웹 v5.4 부터)
    ui: "Pretendard",
    numeric: "Pretendard", // 숫자는 tabular 굵게
    digital: "Pretendard",
  },
  /** 앱 크기 — 웹보다 한 단계 크게 (이동 중 한 손으로 읽는다) */
  size: {
    label: 13,
    caption: 13,
    body: 16,
    bodyLarge: 17,
    title: 20,
    h1: 28,
    numMd: 24,
    numLg: 34,
    numXl: 48,
  },
  letterSpacing: { label: 0, button: 0 }, // em — 대문자 라벨 없음
  weight: { light: "300", regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

export type ColorToken = keyof typeof color;
