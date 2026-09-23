"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** 학생 메뉴 4개. 종이 제출은 목적이 아니라 제출 방식이므로 이번 주 → 시험 카드 안으로 */
const TABS = [
  ["/learn", "Week", "이번 주"],
  ["/learn/grades", "Grades", "성적"],
  ["/learn/retake", "Retake", "재시험"],
  ["/learn/practice", "Practice", "연습"],
] as const;

/**
 * 학생 메뉴. 휴대폰은 상단 세그먼트 탭(variant=tabs), 데스크톱은 왼쪽 세로 메뉴(variant=side).
 * 응시 중(/learn/attempts)에는 둘 다 숨긴다. 탭 변형은 결과·연습·종이 제출 화면에서도 숨긴다(뒤로 가기 링크가 있음).
 */
export function LearnTabs({ variant = "tabs" }: { variant?: "tabs" | "side" }) {
  const p = usePathname() ?? "/learn";
  if (p.startsWith("/learn/attempts")) return null;
  if (variant === "tabs" && (p.startsWith("/learn/results") || p.startsWith("/learn/practice") || p.startsWith("/learn/paper"))) return null;
  const isOn = (href: string) => (href === "/learn" ? p === "/learn" || p.startsWith("/learn/results") || p.startsWith("/learn/paper") : p.startsWith(href));
  if (variant === "side") {
    return (
      <nav aria-label="학생 메뉴" className="mt-6 flex flex-col gap-0.5">
        {TABS.map(([href, en, ko]) => {
          const on = isOn(href);
          return (
            <Link key={href} href={href} className={`nav-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined} data-nav={href}>
              <span className="lbl">{en}</span>
              <span className="nav-ko">{ko}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="seg mb-3 w-full justify-between" aria-label="학생 메뉴">
      {TABS.map(([href, en, ko]) => {
        const on = isOn(href);
        return (
          <Link key={href} href={href} className={`seg-item flex-1 px-1 text-center${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
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
