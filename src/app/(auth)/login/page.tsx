import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const messages: Record<string, string> = {
    google_not_configured: "Google 로그인 키가 설정되지 않았습니다.",
    kakao_not_configured: "카카오 로그인 키가 설정되지 않았습니다.",
    oauth_state: "로그인 상태 검증에 실패했습니다. 다시 시도하세요.",
    google_failed: "Google 로그인에 실패했습니다.",
    kakao_failed: "카카오 로그인에 실패했습니다.",
    suspended: "정지된 계정입니다.",
  };
  return (
    <AuthShell title="로그인" next={sp.next}>
      {sp.error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{messages[sp.error] ?? sp.error}</p>}
      <LoginForm next={sp.next} />
    </AuthShell>
  );
}
