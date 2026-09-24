"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV, type NavItem as Item } from "./nav-items";
import { Icon } from "./Icon";

/** 현재 경로를 클라이언트에서 읽어 활성 표시 — 클라이언트 내비게이션에서도 즉시 따라온다. */
export function SideNav({ isOwner, billing = false }: { isOwner: boolean; billing?: boolean }) {
  const pathname = usePathname() ?? "/app";
  const items = NAV.filter((n) => (!n.owner || isOwner) && (n.href !== "/app/billing" || billing));
  const active = (href: string) => {
    if (href === "/app") return pathname === "/app";
    if (href === "/app/vocabulary") return pathname.startsWith("/app/vocabulary") || pathname.startsWith("/app/imports");
    if (href === "/app/students") return pathname.startsWith("/app/students") || pathname.startsWith("/app/classes");
    if (href === "/app/tests") return pathname.startsWith("/app/tests") || pathname.startsWith("/app/tests/scans");
    return pathname === href || pathname.startsWith(href + "/");
  };
  // 학원장의 첫 화면은 개인 할 일이 아니라 학원 전체 현황 — 메뉴 이름도 화면 제목과 맞춘다
  const labelOf = (n: Item) => (n.href === "/app" && isOwner ? "현황" : n.ko);
  const render = (n: Item) => {
    const on = active(n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`nav-item${on ? " on" : ""}`} data-nav={n.href} title={labelOf(n)}>
        <Icon name={n.href === "/app" && isOwner ? "overview" : n.icon} />
        <span className="nav-ko">{labelOf(n)}</span>
      </Link>
    );
  };
  const admin = items.filter((n) => n.group === "admin");
  const ops = items.filter((n) => n.group === "ops");
  return (
    <>
      {/* 태블릿(640–1023): 가로 칩 · 데스크톱: 세로 목록. 휴대폰(<640)에서는 숨기고 아래 탭 바로 */}
      <nav aria-label="주 메뉴" className="hidden gap-1 overflow-x-auto px-3 pb-3 sm:flex lg:mt-4 lg:flex-col lg:gap-px lg:px-3">
        {ops.map(render)}
        {admin.length > 0 && (
          <span className="nav-sec hidden lg:block" aria-hidden>
            학원 관리
          </span>
        )}
        {admin.map(render)}
      </nav>
      {/* 휴대폰: 하단 탭 바 (아이콘 5개) — 단어장·관리 메뉴·로그아웃은 상단 ⋯ */}
      <nav aria-label="하단 탭" className="tabbar sm:hidden" data-testid="tabbar">
        {ops.filter((n) => n.tab).map((n) => {
          const on = active(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined} data-nav={n.href}>
              <Icon name={n.href === "/app" && isOwner ? "overview" : n.icon} strokeWidth={on ? 2.1 : 1.75} />
              {labelOf(n)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

