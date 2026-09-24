/** icon: Icon 이름 · tab: 휴대폰 하단 탭 바에 둘지 (5개까지 — 나머지는 상단 ⋯) */
export type NavItem = { href: string; en: string; ko: string; icon: string; tab?: boolean; owner?: boolean; group: "ops" | "admin" };

/** 운영(오늘·학생·단어장·시험·성적·재시험) / 관리(선생님·요금제·학원 설정). 사진 채점은 시험 안으로 */
export const NAV: NavItem[] = [
  { href: "/app", en: "Today", ko: "오늘", icon: "today", tab: true, group: "ops" },
  { href: "/app/students", en: "Students", ko: "학생", icon: "students", tab: true, group: "ops" },
  { href: "/app/vocabulary", en: "Words", ko: "단어장", icon: "words", group: "ops" },
  { href: "/app/tests", en: "Tests", ko: "시험", icon: "tests", tab: true, group: "ops" },
  { href: "/app/results", en: "Results", ko: "성적", icon: "results", tab: true, group: "ops" },
  { href: "/app/retakes", en: "Retake", ko: "재시험", icon: "retakes", tab: true, group: "ops" },
  { href: "/app/teachers", en: "Teachers", ko: "선생님", icon: "teachers", owner: true, group: "admin" },
  { href: "/app/billing", en: "Billing", ko: "요금제", icon: "billing", owner: true, group: "admin" },
  { href: "/app/settings", en: "Setup", ko: "학원 설정", icon: "settings", owner: true, group: "admin" },
];

/** 상단 ⋯ 메뉴에 넣을 관리 항목 (휴대폰·태블릿) — 서버에서 계산해 클라이언트 메뉴에 props 로 넘긴다 */
export function adminMenuItems(isOwner: boolean, billing: boolean) {
  // 하단 탭에 없는 운영 메뉴(단어장)도 여기로
  return [
    ...NAV.filter((n) => n.group === "ops" && !n.tab).map((n) => ({ href: n.href, label: n.ko, icon: n.icon })),
    ...NAV.filter((n) => n.group === "admin" && (!n.owner || isOwner) && (n.href !== "/app/billing" || billing)).map((n) => ({ href: n.href, label: n.ko, icon: n.icon })),
    { href: "/switch", label: "계정 전환", icon: "switch" },
  ];
}
