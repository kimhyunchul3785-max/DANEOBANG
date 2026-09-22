"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; en: string; ko: string; owner?: boolean };

const NAV: Item[] = [
  { href: "/app", en: "Today", ko: "오늘" },
  { href: "/app/students", en: "Students", ko: "학생" },
  { href: "/app/vocabulary", en: "Words", ko: "단어장" },
  { href: "/app/tests", en: "Tests", ko: "시험" },
  { href: "/app/scans", en: "Scan", ko: "사진 채점" },
  { href: "/app/results", en: "Results", ko: "성적" },
  { href: "/app/retakes", en: "Retake", ko: "재시험" },
  { href: "/app/teachers", en: "Teachers", ko: "선생님", owner: true },
  { href: "/app/billing", en: "Billing", ko: "요금제", owner: true },
  { href: "/app/settings", en: "Setup", ko: "학원 설정", owner: true },
];

/** 현재 경로를 클라이언트에서 읽어 활성 표시 — 클라이언트 내비게이션에서도 즉시 따라온다. */
export function SideNav({ isOwner, billing = false }: { isOwner: boolean; billing?: boolean }) {
  const pathname = usePathname() ?? "/app";
  const items = NAV.filter((n) => (!n.owner || isOwner) && (n.href !== "/app/billing" || billing)).map((n) => (isOwner && n.href === "/app" ? { ...n, en: "Overview", ko: "학원 현황" } : n));
  const active = (href: string) => {
    if (href === "/app") return pathname === "/app";
    if (href === "/app/vocabulary") return pathname.startsWith("/app/vocabulary") || pathname.startsWith("/app/imports");
    if (href === "/app/students") return pathname.startsWith("/app/students") || pathname.startsWith("/app/classes");
    return pathname === href || pathname.startsWith(href + "/");
  };
  return (
    <nav aria-label="주 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-6 lg:flex-col lg:gap-0.5 lg:px-3">
      {items.map((n) => {
        const on = active(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`nav-item${on ? " on" : ""}`} data-nav={n.href}>
            <span className="lbl">{n.en}</span>
            <span className="nav-ko">{n.ko}</span>
          </Link>
        );
      })}
      <form action="/api/auth/logout" method="post" className="lg:hidden">
        <button className="nav-item lbl">Sign out</button>
      </form>
    </nav>
  );
}
