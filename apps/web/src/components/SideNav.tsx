"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; en: string; ko: string; owner?: boolean; group: "ops" | "admin" };

/** 운영(오늘·학생·단어장·시험·성적·재시험) / 관리(선생님·요금제·학원 설정). 사진 채점은 시험 안으로 */
const NAV: Item[] = [
  { href: "/app", en: "Today", ko: "오늘", group: "ops" },
  { href: "/app/students", en: "Students", ko: "학생", group: "ops" },
  { href: "/app/vocabulary", en: "Words", ko: "단어장", group: "ops" },
  { href: "/app/tests", en: "Tests", ko: "시험", group: "ops" },
  { href: "/app/results", en: "Results", ko: "성적", group: "ops" },
  { href: "/app/retakes", en: "Retake", ko: "재시험", group: "ops" },
  { href: "/app/teachers", en: "Teachers", ko: "선생님", owner: true, group: "admin" },
  { href: "/app/billing", en: "Billing", ko: "요금제", owner: true, group: "admin" },
  { href: "/app/settings", en: "Setup", ko: "학원 설정", owner: true, group: "admin" },
];

/** 현재 경로를 클라이언트에서 읽어 활성 표시 — 클라이언트 내비게이션에서도 즉시 따라온다. */
export function SideNav({ isOwner, billing = false }: { isOwner: boolean; billing?: boolean }) {
  const pathname = usePathname() ?? "/app";
  const items = NAV.filter((n) => (!n.owner || isOwner) && (n.href !== "/app/billing" || billing));
  const active = (href: string) => {
    if (href === "/app") return pathname === "/app";
    if (href === "/app/vocabulary") return pathname.startsWith("/app/vocabulary") || pathname.startsWith("/app/imports");
    if (href === "/app/students") return pathname.startsWith("/app/students") || pathname.startsWith("/app/classes");
    if (href === "/app/tests") return pathname.startsWith("/app/tests") || pathname.startsWith("/app/scans");
    return pathname === href || pathname.startsWith(href + "/");
  };
  const render = (n: Item) => {
    const on = active(n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`nav-item${on ? " on" : ""}`} data-nav={n.href}>
        <span className="lbl">{n.en}</span>
        <span className="nav-ko">{n.ko}</span>
      </Link>
    );
  };
  const admin = items.filter((n) => n.group === "admin");
  return (
    <nav aria-label="주 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-6 lg:flex-col lg:gap-0.5 lg:px-3">
      {items.filter((n) => n.group === "ops").map(render)}
      {admin.length > 0 && <span className="hidden lg:block lg:h-px lg:my-2 lg:mx-3" style={{ background: "var(--line)" }} aria-hidden />}
      {admin.map(render)}
      <form action="/api/auth/logout" method="post" className="lg:hidden">
        <button className="nav-item lbl">Sign out</button>
      </form>
    </nav>
  );
}
