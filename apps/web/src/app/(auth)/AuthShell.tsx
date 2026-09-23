import Link from "next/link";
import { providerConfigured } from "@/lib/oauth";
import { Logo } from "@/components/Logo";

/**
 * 로그인 셸: 워드마크 · 한 줄 · 구글/카카오 버튼. 회원가입 버튼은 없다 — 처음이면 가입, 기존이면 로그인.
 * 이메일 계정은 기존 사용자 이전용으로만 맨 아래에 작게.
 */
export function AuthShell({ children, next, tagline = "영어 단어 시험을 더 간단하게." }: { children?: React.ReactNode; next?: string; tagline?: string }) {
  const g = providerConfigured("google");
  const k = providerConfigured("kakao");
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="anim-fade-up text-center">
          <Logo height={30} />
          <p className="mt-3 text-[15px]" style={{ color: "var(--ink-2)" }}>
            {tagline}
          </p>
        </div>
        <div className="mt-8 space-y-2 anim-fade-up" style={{ animationDelay: "60ms" }}>
          <a href={`/api/auth/google/start${q}`} className="btn w-full py-3.5 text-[13px]" style={{ background: "#fff", color: "#1f1f1f", boxShadow: "inset 0 0 0 1px rgba(27,26,24,0.12)" }} data-provider="google">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Google로 계속하기
          </a>
          <a href={`/api/auth/kakao/start${q}`} className="btn w-full py-3.5 text-[13px]" style={{ background: "#FEE500", color: "#191919" }} data-provider="kakao">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#191919" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.2 4.6 6.6l-1 3.8c-.1.3.3.6.6.4l4.4-2.9c.5.1.9.1 1.4.1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
            </svg>
            카카오로 계속하기
          </a>
          {(!g || !k) && (
            <p className="pt-1 text-center text-[11px]" style={{ color: "var(--ink-3)" }}>
              {!g && !k ? "구글·카카오 키가 아직 설정되지 않았습니다" : !g ? "구글 키가 아직 설정되지 않았습니다" : "카카오 키가 아직 설정되지 않았습니다"} ·{" "}
              <Link href="/login/setup" className="underline">
                설정 방법
              </Link>
            </p>
          )}
        </div>
        {children}
        <div className="mt-8 border-t pt-5 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            기존 이메일 계정이 있나요?{" "}
            <Link href={`/login/email${q}`} className="underline" style={{ color: "var(--ink-2)" }} data-testid="login-email">
              기존 계정으로 로그인 →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
