import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, landingAfterLogin } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LoginForm } from "../LoginForm";

/**
 * 기존 이메일(또는 휴대폰 번호) 계정 로그인 — 신규 가입은 없다.
 * 이 계정으로 로그인한 뒤 Google/Kakao 로 다시 로그인하면 같은 이메일이면 새 계정을 만들지 않고 로그인 수단만 붙는다.
 */
export default async function EmailLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(await landingAfterLogin(user.id, sp.next));
  const devLogin = (process.env.ALLOW_DEV_LOGIN ?? "true") !== "false";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-end justify-between px-1">
          <Logo height={24} />
          <Link href={sp.next ? `/login?next=${encodeURIComponent(sp.next)}` : "/login"} className="lbl-ink">
            ← Google · 카카오
          </Link>
        </div>
        <div className="card card-body anim-fade-up">
          <h1 className="h2">기존 계정으로 로그인</h1>
          <p className="muted mt-1 mb-4">이메일 또는 휴대폰 번호로 가입했던 계정만 해당됩니다. 새 가입은 Google·카카오로 합니다.</p>
          <LoginForm next={sp.next} showDemo={devLogin} />
        </div>
      </div>
    </main>
  );
}
