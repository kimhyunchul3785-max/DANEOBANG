import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "../AuthShell";

/** 첫 화면 = 로그인. 이미 로그인돼 있으면 있어야 할 곳으로 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(`/api/auth/landing${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`); // 쿠키는 Route Handler 에서 (페이지에서 굽으면 500)
  const messages: Record<string, string> = {
    google_not_configured: "Google 로그인 키가 아직 설정되지 않았습니다. '설정 방법'을 눌러 .env 에 키를 넣어 주세요.",
    kakao_not_configured: "카카오 로그인 키가 아직 설정되지 않았습니다. '설정 방법'을 눌러 .env 에 키를 넣어 주세요.",
    oauth_state: "로그인 상태 검증에 실패했습니다. 다시 시도하세요.",
    google_failed: "Google 로그인에 실패했습니다.",
    kakao_failed: "카카오 로그인에 실패했습니다.",
    suspended: "정지된 계정입니다.",
  };
  return (
    <AuthShell next={sp.next}>
      {sp.error && (
        <p className="mt-3 rounded-xl p-3 text-center text-[12.5px]" style={{ background: "rgba(232,67,26,0.08)", color: "var(--accent)" }}>
          {messages[sp.error] ?? sp.error}
        </p>
      )}
    </AuthShell>
  );
}
