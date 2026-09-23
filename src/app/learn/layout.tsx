import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, getStudentContext } from "@/lib/auth";
import { LearnTabs } from "./LearnTabs";
import { Logo } from "@/components/Logo";
import { Notifications } from "./Notifications";

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
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[220px] lg:shrink-0 lg:flex-col lg:px-5 lg:pt-5">
        <Logo height={20} href="/learn" />
        <Link href="/switch" className="mt-3 block rounded-xl transition-colors hover:bg-[rgba(27,26,24,0.05)] lg:-mx-2 lg:px-2 lg:py-1.5" title="계정 전환" data-testid="profile-switch">
          <div className="text-[16px] font-bold tracking-tight">{user.name}</div>
          <div className="mt-1 truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
            {where} · 학생 <span className="lbl-ink">⇄</span>
          </div>
        </Link>
        <LearnTabs variant="side" />
        <div className="mt-auto flex items-center gap-3 pb-6 px-3">
          <form action="/api/auth/logout" method="post">
            <button className="lbl hover:text-[var(--ink)]">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[420px] sm:max-w-[600px] lg:max-w-[1080px]">
          {/* 헤더: 휴대폰은 로고·이름·알림·전환, 데스크톱은 알림만 오른쪽에 */}
          <header className="flex items-center justify-between px-5 pt-5 pb-2 lg:justify-end lg:px-8 lg:pt-5 lg:pb-0">
            <span className="lg:hidden">
              <Logo height={20} href="/learn" />
            </span>
            <div className="flex items-center gap-1">
              <Link href="/switch" className="text-[12px] font-semibold lg:hidden" title="계정 전환">
                {user.name} <span className="lbl-ink">⇄</span>
              </Link>
              <span className="lbl hidden lg:inline">Alerts</span>
              <Notifications />
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
