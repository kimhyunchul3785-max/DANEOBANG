import Link from "next/link";
import { providerConfigured, redirectUri } from "@/lib/oauth";
import { Logo } from "@/components/Logo";

/** 소셜 로그인 키 설정 안내 (.env) — 키가 없을 때 로그인 화면에서 링크로 진입 */
export default function OAuthSetupPage() {
  const g = providerConfigured("google");
  const k = providerConfigured("kakao");
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Logo height={24} />
        <Link href="/login" className="btn-ghost btn-sm">
          ← 로그인
        </Link>
      </div>
      <h1 className="h1">구글 · 카카오 로그인 설정</h1>
      <p className="muted mt-1">키는 `daneobang/.env` 파일에 넣고 서버를 다시 시작하면 바로 켜집니다. 가입 절차는 따로 없습니다 — 처음 로그인하면 계정이 만들어집니다.</p>

      <section className="card card-body mt-6">
        <div className="flex items-center justify-between">
          <div className="h3">Google</div>
          <span className={g ? "badge-green" : "badge-amber"}>{g ? "ON" : "키 필요"}</span>
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px]">
          <li>
            <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Google Cloud Console → API 및 서비스 → 사용자 인증 정보
            </a>
            에서 <b>OAuth 클라이언트 ID</b>(웹 애플리케이션)를 만듭니다.
          </li>
          <li>
            승인된 리디렉션 URI에 <code className="rounded bg-[rgba(27,26,24,0.06)] px-1.5 py-0.5 text-[12.5px]">{redirectUri("google")}</code> 를 추가합니다.
          </li>
          <li>
            발급된 값을 `.env` 에 넣습니다:
            <pre className="mt-1 rounded-xl p-3 text-[12.5px]" style={{ background: "var(--surface-2)" }}>{`GOOGLE_CLIENT_ID="…apps.googleusercontent.com"\nGOOGLE_CLIENT_SECRET="…"`}</pre>
          </li>
        </ol>
      </section>

      <section className="card card-body mt-4">
        <div className="flex items-center justify-between">
          <div className="h3">Kakao</div>
          <span className={k ? "badge-green" : "badge-amber"}>{k ? "ON" : "키 필요"}</span>
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px]">
          <li>
            <a className="underline" href="https://developers.kakao.com/console/app" target="_blank" rel="noreferrer">
              Kakao Developers → 내 애플리케이션
            </a>
            에서 앱을 만들고 <b>REST API 키</b>를 복사합니다.
          </li>
          <li>제품 설정 → 카카오 로그인 활성화 ON, 동의항목에서 닉네임·이메일을 켭니다.</li>
          <li>
            Redirect URI에 <code className="rounded bg-[rgba(27,26,24,0.06)] px-1.5 py-0.5 text-[12.5px]">{redirectUri("kakao")}</code> 를 등록합니다. (플랫폼 → Web 사이트 도메인에도 주소 등록)
          </li>
          <li>
            `.env` 에 넣습니다:
            <pre className="mt-1 rounded-xl p-3 text-[12.5px]" style={{ background: "var(--surface-2)" }}>{`KAKAO_CLIENT_ID="REST API 키"\nKAKAO_CLIENT_SECRET=""   # 보안 → Client Secret 을 켰을 때만`}</pre>
          </li>
        </ol>
      </section>

      <p className="muted mt-4">
        학원 밖(학생 휴대폰)에서 접속하려면 `.env` 의 <b>APP_URL</b> 을 실제 주소(예: https://voca.myacademy.kr)로 바꾸고, 위 리디렉션 URI 도 그 주소로 등록해야 합니다.
      </p>
    </main>
  );
}
