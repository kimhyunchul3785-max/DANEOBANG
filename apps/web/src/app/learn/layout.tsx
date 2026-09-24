import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, getStudentContext } from "@/lib/auth";
import { LearnTabs } from "./LearnTabs";
import { Logo } from "@/components/Logo";
import { Notifications } from "./Notifications";
import { Suspense } from "react";
import { Icon } from "@/components/Icon";

/**
 * 학생 앱 셸.
 * - 휴대폰(<1024px): 상단 로고·알림 + 세그먼트 탭, 한 열(최대 420px).
 * - 데스크톱(≥1024px): 왼쪽 세로 메뉴(220px) + 넓은 본문(최대 1080px). 각 화면은 .learn-grid 로 두 열로 펼쳐진다.
 * 프로필(이름 · 학원 · 학생)을 누르면 계정 전환.
 */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/learn");
  const ctx = await getStudentContext(user);
  // 헤더: 선택한 학원 · 학생. 연결 전이면 승인 대기 중인 학원명, 그것도 없으면 "학원 연결 전"
  const pending = ctx ? null : await prisma.studentLinkRequest.findFirst({ where: { userId: user.id, status: "pending" }, include: { student: { select: { academy: { select: { name: true } } } } } });
  const where = ctx ? ctx.student.academy.name : pending ? `${pending.student.academy.name} · 확인 대기` : "학원 연결 전";
  return (
    <div className="min-h-screen lg:flex">
      {/* 데스크톱 사이드 */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[232px] lg:shrink-0 lg:flex-col lg:border-r lg:border-[var(--line)] lg:px-3 lg:pt-4">
        <div className="px-2">
          <Logo height={18} href="/learn" />
        </div>
        <Link href="/switch" className="group mt-3 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--fill)]" title="계정 전환" data-testid="profile-switch">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: "var(--accent)" }} aria-hidden>
            {user.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-tight">{user.name}</span>
            <span className="block truncate text-[12px] leading-tight" style={{ color: "var(--ink-3)" }}>
              {where} · 학생
            </span>
          </span>
          <Icon name="switch" size={16} className="shrink-0 text-[var(--ink-3)]" />
        </Link>
        <Suspense fallback={null}>
          <LearnTabs variant="side" />
        </Suspense>
        <form action="/api/auth/logout" method="post" className="mt-auto pb-4">
          <button className="nav-item w-full" style={{ color: "var(--ink-3)" }}>
            <Icon name="logout" />
            <span className="nav-ko">로그아웃</span>
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[420px] sm:max-w-[600px] md:max-w-[760px] lg:ml-0 lg:max-w-[1120px] min-[2200px]:mx-auto">
          {/* 헤더: 휴대폰은 로고·이름·알림·전환, 데스크톱은 알림만 오른쪽에 */}
          <header className="flex items-center justify-between px-5 pt-5 pb-2 lg:justify-end lg:px-8 lg:pt-5 lg:pb-0">
            <span className="lg:hidden">
              <Logo height={20} href="/learn" />
            </span>
            <div className="flex items-center gap-1">
              <Link href="/switch" className="inline-flex min-h-[40px] items-center rounded-full px-2 text-[13px] font-semibold lg:hidden" title="계정 전환">
                {user.name}
                <Icon name="switch" size={14} className="ml-1 text-[var(--ink-3)]" />
              </Link>
              <Notifications />
              <form action="/api/auth/logout" method="post" className="lg:hidden">
                <button className="btn-ghost btn-sm" style={{ minHeight: 40, minWidth: 40, padding: 0 }} title="로그아웃">
                  <Icon name="logout" size={19} />
                  <span className="sr-only">로그아웃</span>
                </button>
              </form>
            </div>
          </header>
          <main className="w-full px-4 pb-12 pt-2 lg:px-8 lg:pt-2">
            <div className="lg:hidden">
              <Suspense fallback={null}>
                <LearnTabs />
              </Suspense>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
