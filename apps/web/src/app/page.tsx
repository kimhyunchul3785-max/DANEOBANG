import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { billingEnabled } from "@/lib/billing";

/** 로그인 전 첫 화면: 워드마크 · 한 줄 · 진입 버튼만. 가입 버튼은 없다 — 로그인이 곧 가입 */
export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo height={24} />
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link className="btn-primary" href="/switch">
                들어가기
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
        <div className="lbl mb-6">Vocabulary tests for English academies</div>
        <h1 className="anim-fade-up">
          <Logo variant="full" height={170} href={null} />
        </h1>
        <p className="mt-3 text-[20px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          영어 단어 시험을 더 간단하게<span style={{ color: "var(--accent)" }}>.</span>
        </p>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          등록 → 출제 → 채점 → 재시험{billingEnabled() ? <> · <span className="digital">월 9,900원 / 선생님</span> · 학생 무료</> : <> · <span className="digital">무료 체험 중</span></>}
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          {user ? (
            <Link className="btn-primary px-6 py-3 text-[13px]" href="/switch">
              들어가기
            </Link>
          ) : (
            <>
              <Link className="btn-primary px-6 py-3 text-[13px]" href="/login" data-testid="cta-start">
                Google · 카카오로 시작하기
              </Link>
              <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                학생도 선생님도 같은 로그인으로 시작해요
              </span>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
