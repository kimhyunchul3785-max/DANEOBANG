"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * 휴대폰·태블릿 상단의 ⋯ 메뉴 — 계정 전환 · (학원장) 선생님 · 학원 설정 · 요금제 · 로그아웃.
 * 하단 탭 바에는 운영 6개만 두고, 가끔 쓰는 것들은 여기로.
 */
export function MobileMenu({ items }: { items: { href: string; label: string; icon?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  return (
    <div className="relative lg:hidden" ref={ref}>
      <button type="button" className="btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} aria-label="더보기 메뉴" onClick={() => setOpen(!open)} data-testid="mobile-menu" style={{ minHeight: 40, minWidth: 40, padding: 0 }}>
        <Icon name="more" size={22} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-56 rounded-xl p-1.5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }} data-testid="mobile-menu-open">
          {items.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium hover:bg-[var(--fill)]" onClick={() => setOpen(false)}>
              {it.icon && <Icon name={it.icon} size={18} className="text-[var(--ink-3)]" />}
              {it.label}
            </Link>
          ))}
          <div className="my-1.5" style={{ height: 1, background: "var(--line)" }} />
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium hover:bg-[var(--fill)]" style={{ color: "var(--ink-3)" }} role="menuitem" data-testid="mobile-signout">
              <Icon name="logout" size={18} />
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
