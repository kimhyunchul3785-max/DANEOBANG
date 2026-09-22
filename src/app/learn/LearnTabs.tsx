"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/learn", "Week", "이번 주"],
  ["/learn/grades", "Grades", "내 성적"],
  ["/learn/retake", "Retake", "재시험"],
  ["/learn/paper", "Paper", "종이 제출"],
] as const;

export function LearnTabs() {
  const p = usePathname() ?? "/learn";
  if (p.startsWith("/learn/attempts") || p.startsWith("/learn/results")) return null;
  return (
    <nav className="seg mb-3 w-full justify-between" aria-label="학생 메뉴">
      {TABS.map(([href, en, ko]) => {
        const on = href === "/learn" ? p === "/learn" : p.startsWith(href);
        return (
          <Link key={href} href={href} className={`seg-item flex-1 text-center${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            <span className="block">{en}</span>
            <span className="block text-[11px] normal-case tracking-normal" style={{ opacity: 0.85 }}>
              {ko}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
