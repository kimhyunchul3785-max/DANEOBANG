import { redirect } from "next/navigation";
import { requireUser, listContexts } from "@/lib/auth";
import { WelcomeShell, ChoiceTile } from "./Shell";

/**
 * 첫 로그인 — 아무 학원에도 연결되지 않은 사용자.
 * 여기서 고르는 것은 영구 역할이 아니라 "지금 하려는 일"이다. 나중에 학생이 선생님이 되거나 그 반대도 된다.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const user = await requireUser("/welcome");
  const sp = await searchParams;
  if (!sp.force) {
    const { memberships, students } = await listContexts(user.id);
    if (memberships.length || students.length) redirect("/switch");
  }
  return (
    <WelcomeShell user={user} back={sp.force ? "/switch" : undefined} backLabel="← 계정 전환">
      <div className="anim-fade-up">
        <div className="lbl">환영해요 · {user.name}</div>
        <h1 className="h1 mt-1">단어방을 어떻게 사용하시나요?</h1>
      </div>
      <div className="mt-6 grid gap-3 anim-fade-up" style={{ animationDelay: "60ms" }}>
        <ChoiceTile href="/welcome/student" title="학생이에요" sub="선생님에게 받은 코드나 초대로 시작해요" testId="welcome-student" />
        <ChoiceTile href="/welcome/teacher" title="선생님이에요" sub="학원을 만들거나 초대받은 학원에 참여해요" testId="welcome-teacher" />
      </div>
    </WelcomeShell>
  );
}
