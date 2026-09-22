import Link from "next/link";
import type { AcademyContext } from "@/lib/auth";
import { SideNav } from "./SideNav";
import { Logo } from "./Logo";
import { billingEnabled } from "@/lib/billing";

/**
 * 앱 셸. 메뉴는 역할별로 다르다 (보이는 것이 곧 권한).
 * 중단점: <640 휴대폰(한 열·가로 칩 메뉴) · 640–1023 태블릿(가로 메뉴·2열) · ≥1024 데스크톱(왼쪽 세로 메뉴·벤토)
 *  - 선생님: 오늘 · 학생 · 단어장 · 시험 · 사진 채점 · 성적 · 재시험
 *  - 학원장: 위 + 선생님 · 학원 설정
 */
export function AppShell({ ctx, children }: { ctx: AcademyContext; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[220px] lg:shrink-0 lg:flex-col">
        <div className="flex items-center justify-between px-5 pt-5 lg:block lg:pb-2">
          <div>
            <Logo height={20} href="/app" />
            {ctx.member.academy.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/files/logo/current" alt="" className="mt-3 h-7 max-w-[150px] object-contain object-left" />
            ) : (
              <div className="mt-3 text-[16px] font-bold tracking-tight">{ctx.member.academy.name}</div>
            )}
            <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
              {ctx.user.name} · {ctx.isOwner ? "학원장" : "선생님"}
            </div>
          </div>
          <Link href="/workspaces" className="btn-ghost btn-sm">
            switch
          </Link>
        </div>
        <SideNav isOwner={ctx.isOwner} billing={billingEnabled()} />
        <form action="/api/auth/logout" method="post" className="hidden px-6 pb-6 lg:mt-auto lg:block">
          <button className="lbl hover:text-[var(--ink)]">Sign out</button>
        </form>
      </aside>
      <main className="flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">{children}</main>
    </div>
  );
}
