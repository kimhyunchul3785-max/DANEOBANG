import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { LearnTabs } from "./LearnTabs";
import { Logo } from "@/components/Logo";
import { Notifications } from "./Notifications";

/**
 * 학생 앱 셸.
 * - 휴대폰(<1024px): 상단 로고·알림 + 세그먼트 탭, 한 열(최대 420px).
 * - 데스크톱(≥1024px): 왼쪽 세로 메뉴(220px) + 넓은 본문(최대 1080px). 각 화면은 .learn-grid 로 두 열로 펼쳐진다.
 */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen lg:flex">
      {/* 데스크톱 사이드 */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[220px] lg:shrink-0 lg:flex-col lg:px-5 lg:pt-5">
        <Logo height={20} href="/learn" />
        <div className="mt-3 text-[16px] font-bold tracking-tight">{user.name}</div>
        <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
          학생
        </div>
        <LearnTabs variant="side" />
        <div className="mt-auto flex items-center gap-3 pb-6 px-3">
          <Link href="/workspaces" className="lbl hover:text-[var(--ink)]">
            Switch
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="lbl hover:text-[var(--ink)]">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[420px] lg:max-w-[1080px]">
          {/* 헤더: 휴대폰은 로고·이름·알림·전환, 데스크톱은 알림만 오른쪽에 */}
          <header className="flex items-center justify-between px-5 pt-5 pb-2 lg:justify-end lg:px-8 lg:pt-5 lg:pb-0">
            <span className="lg:hidden">
              <Logo height={20} href="/learn" />
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-semibold lg:hidden">{user.name}</span>
              <span className="lbl hidden lg:inline">Alerts</span>
              <Notifications />
              <Link href="/workspaces" className="btn-ghost btn-sm lg:hidden">
                switch
              </Link>
              <form action="/api/auth/logout" method="post" className="lg:hidden">
                <button className="btn-ghost btn-sm">out</button>
              </form>
            </div>
          </header>
          <main className="w-full px-4 pb-12 pt-2 lg:px-8 lg:pt-2">
            <div className="lg:hidden">
              <LearnTabs />
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
