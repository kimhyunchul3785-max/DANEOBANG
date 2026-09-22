import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";

/** 로그인 전 첫 화면: 부가 설명 없이 워드마크 · 한 줄 · 진입 버튼만 */
export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo height={24} />
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link className="btn-primary" href="/workspaces">
                내 학원
              </Link>
              {user.isPlatformAdmin && (
                <Link className="btn-ghost" href="/admin">
                  관리자
                </Link>
              )}
            </>
          ) : (
            <Link className="btn-ghost" href="/login">
              로그인
            </Link>
          )}
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-24">
        <div className="lbl mb-6">Vocabulary tests for academies</div>
        <h1 className="anim-fade-up">
          <Logo variant="full" height={170} href={null} />
        </h1>
        <p className="mt-3 text-[18px]" style={{ color: "var(--ink-2)" }}>
          등록 → 출제 → 채점 → 재시험<span style={{ color: "var(--accent)" }}>.</span>
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          {user ? (
            <Link className="btn-primary px-6 py-3 text-[13px]" href="/workspaces">
              대시보드로 이동
            </Link>
          ) : (
            <>
              <Link className="btn-primary px-6 py-3 text-[13px]" href="/login">
                로그인
              </Link>
              <Link className="btn-secondary px-6 py-3 text-[13px]" href="/signup">
                학원 개설
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
