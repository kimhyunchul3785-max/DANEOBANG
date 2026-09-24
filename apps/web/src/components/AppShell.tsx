import Link from "next/link";
import type { AcademyContext } from "@/lib/auth";
import { SideNav } from "./SideNav";
import { adminMenuItems } from "./nav-items";
import { MobileMenu } from "./MobileMenu";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { billingEnabled } from "@/lib/billing";

/**
 * 선생님 앱 셸. 메뉴는 역할별로 다르다 (보이는 것이 곧 권한).
 * 중단점: <640 휴대폰(한 열·가로 칩 메뉴) · 640–1023 태블릿(가로 메뉴·2열) · ≥1024 데스크톱(왼쪽 세로 메뉴·벤토)
 *  - 운영: 오늘 · 학생 · 단어장 · 시험 · 성적 · 재시험
 *  - 관리(학원장): 선생님 · 요금제 · 학원 설정
 * 상단 프로필(이름 · 학원 · 역할)을 누르면 계정 전환.
 */
export function AppShell({ ctx, children }: { ctx: AcademyContext; children: React.ReactNode }) {
  const academy = ctx.member.academy;
  const role = ctx.isOwner ? "학원장" : "선생님";
  return (
    <div className="min-h-screen lg:flex">
      <aside className="app-side lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[72px] lg:shrink-0 lg:flex-col lg:border-r lg:border-[var(--line)] xl:w-[232px]">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:block lg:px-3 lg:pb-1 lg:pt-4">
          <div className="flex min-w-0 items-center gap-3 lg:block">
            <div className="rail-logo lg:px-2">
              <Logo height={18} href="/app" />
            </div>
            {/* 학원 전환: 휴대폰은 로고 옆 한 줄, 데스크톱은 아바타 줄 */}
            <Link href="/switch" className="group flex min-w-0 items-center gap-2.5 rounded-lg transition-colors hover:bg-[var(--fill)] lg:mt-3 lg:px-2 lg:py-2" title="계정 전환" data-testid="profile-switch">
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[13px] font-bold text-white lg:flex" style={{ background: "var(--ink)" }} aria-hidden>
                {academy.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/api/files/logo/current" alt="" className="h-full w-full bg-white object-contain" />
                ) : (
                  academy.name.slice(0, 1)
                )}
              </span>
              <span className="rail-hide min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight lg:text-[14px]">{academy.name}</span>
                <span className="hidden truncate text-[12px] leading-tight lg:block" style={{ color: "var(--ink-3)" }}>
                  {ctx.user.name} · {role}
                </span>
              </span>
              <Icon name="switch" size={16} className="rail-hide hidden shrink-0 text-[var(--ink-3)] group-hover:text-[var(--ink)] lg:block" />
            </Link>
          </div>
          <MobileMenu items={adminMenuItems(ctx.isOwner, billingEnabled())} />
        </div>
        <SideNav isOwner={ctx.isOwner} billing={billingEnabled()} />
        <form action="/api/auth/logout" method="post" className="hidden px-3 pb-4 lg:mt-auto lg:block">
          <button className="nav-item w-full text-[13.5px]" style={{ color: "var(--ink-3)" }} title="로그아웃">
            <Icon name="logout" />
            <span className="nav-ko">로그아웃</span>
          </button>
        </form>
      </aside>
      <main className="app-main min-w-0 flex-1 px-4 pb-28 pt-3 sm:px-6 sm:pb-16 sm:pt-4 lg:px-8 lg:pt-8 xl:px-10 2xl:px-14">{children}</main>
    </div>
  );
}
