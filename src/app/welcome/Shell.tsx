import Link from "next/link";
import { Logo } from "@/components/Logo";

/** 온보딩 공통 셸: 좁은 한 열, 로고, 오른쪽에 뒤로/로그아웃 */
export function WelcomeShell({ children, back, backLabel = "← 이전", user }: { children: React.ReactNode; back?: string; backLabel?: string; user?: { name: string } | null }) {
  return (
    <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-6">
      <div className="mb-8 flex items-center justify-between">
        <Logo height={20} href="/" />
        <div className="flex items-center gap-3">
          {back && (
            <Link href={back} className="lbl-ink">
              {backLabel}
            </Link>
          )}
          {user && (
            <form action="/api/auth/logout" method="post">
              <button className="lbl hover:text-[var(--ink)]" title={user.name}>
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
      {children}
    </main>
  );
}

/** 큰 선택 타일 (학생이에요 / 선생님이에요 …) */
export function ChoiceTile({ href, title, sub, testId }: { href: string; title: string; sub: string; testId?: string }) {
  return (
    <Link href={href} className="tile card block rounded-[20px] px-5 py-5" data-testid={testId}>
      <div className="text-[18px] font-semibold tracking-tight">{title}</div>
      <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
        {sub}
      </div>
    </Link>
  );
}
