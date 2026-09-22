import Link from "next/link";
import { providerConfigured } from "@/lib/oauth";

export function AuthShell({ title, children, next }: { title: string; children: React.ReactNode; next?: string }) {
  const g = providerConfigured("google");
  const k = providerConfigured("kakao");
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-5 flex items-end justify-between px-1">
          <Link href="/" className="lbl-ink">
            Daneobang
          </Link>
          <span className="digital">{title === "로그인" ? "SIGN IN" : "SIGN UP"}</span>
        </div>
        <div className="card card-body">
          <h1 className="h1 mb-6">{title}</h1>
          <div className="space-y-2">
            <a href={g ? `/api/auth/google/start${q}` : "#"} className={`btn-secondary w-full py-3 ${g ? "" : "pointer-events-none opacity-40"}`} title={g ? "" : ".env에 GOOGLE_CLIENT_ID/SECRET 설정 필요"}>
              Google
            </a>
            <a href={k ? `/api/auth/kakao/start${q}` : "#"} className={`btn w-full py-3 ${k ? "" : "pointer-events-none opacity-40"}`} style={{ background: "#FEE500", color: "#191919" }} title={k ? "" : ".env에 KAKAO_CLIENT_ID 설정 필요"}>
              Kakao
            </a>
            {(!g || !k) && <p className="lbl text-center">social login · set keys in .env</p>}
          </div>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
            <span className="lbl">Email</span>
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
