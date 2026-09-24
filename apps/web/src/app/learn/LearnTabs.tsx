"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

/** 학생 메뉴 4개. 종이 제출은 목적이 아니라 제출 방식이므로 이번 주 → 시험 카드 안으로 */
const TABS = [
  ["/learn", "Week", "이번 주", "today"],
  ["/learn/grades", "Grades", "성적", "results"],
  ["/learn/retake", "Retake", "재시험", "retakes"],
  ["/learn/practice", "Practice", "연습", "words"],
] as const;

/**
 * 학생 메뉴. 휴대폰은 상단 세그먼트 탭(variant=tabs), 데스크톱은 왼쪽 세로 메뉴(variant=side).
 * 응시 중(/learn/attempts)과 결과에서 들어간 오답 연습(/learn/practice/[id])에만 숨긴다.
 * 결과 화면은 들어온 곳(?from=grades → 성적, 그 외 → 이번 주)을 부모로 표시한다 — 뒤로가기 링크와 같은 부모.
 */
export function LearnTabs({ variant = "tabs" }: { variant?: "tabs" | "side" }) {
  const p = usePathname() ?? "/learn";
  const from = useSearchParams()?.get("from");
  if (p.startsWith("/learn/attempts")) return null;
  if (variant === "tabs" && /^\/learn\/practice\/.+/.test(p)) return null;
  const inResult = p.startsWith("/learn/results");
  const isOn = (href: string) =>
    href === "/learn"
      ? p === "/learn" || (inResult && from !== "grades") || p.startsWith("/learn/paper")
      : href === "/learn/grades"
        ? p.startsWith(href) || (inResult && from === "grades")
        : href === "/learn/practice"
          ? p === "/learn/practice"
          : p.startsWith(href);
  if (variant === "side") {
    return (
      <nav aria-label="학생 메뉴" className="mt-4 flex flex-col gap-px">
        {TABS.map(([href, , ko, icon]) => {
          const on = isOn(href);
          return (
            <Link key={href} href={href} className={`nav-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined} data-nav={href}>
              <Icon name={icon} />
              <span className="nav-ko">{ko}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="seg mb-4 w-full justify-between" aria-label="학생 메뉴">
      {TABS.map(([href, en, ko]) => {
        const on = isOn(href);
        return (
          <Link key={href} href={href} className={`seg-item flex-1 px-1 text-center${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={en} style={{ fontSize: 13.5, minHeight: 38 }}>
            {ko}
          </Link>
        );
      })}
    </nav>
  );
}
