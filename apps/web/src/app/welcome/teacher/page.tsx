import { requireUser } from "@/lib/auth";
import { WelcomeShell, ChoiceTile } from "../Shell";
import { InviteLinkForm } from "./InviteLinkForm";

/** 선생님 첫 진입: 새 학원 만들기 / 초대받은 학원 참여하기. 초대 링크를 직접 열었다면 이 화면은 건너뛴다 (/invite/…) */
export default async function TeacherWelcomePage() {
  const user = await requireUser("/welcome/teacher");
  return (
    <WelcomeShell user={user} back="/welcome?force=1">
      <div className="anim-fade-up">
        <div className="lbl">Teacher</div>
        <h1 className="h1 mt-1">어떻게 시작할까요?</h1>
      </div>
      <div className="mt-6 grid gap-3 anim-fade-up" style={{ animationDelay: "60ms" }}>
        <ChoiceTile href="/welcome/new" title="새 학원 만들기" sub="학생과 수업을 직접 관리할 공간을 만들어요" testId="welcome-new-academy" />
        <div className="card rounded-[20px] px-5 py-5">
          <div className="text-[18px] font-semibold tracking-tight">초대받은 학원 참여하기</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
            받은 초대 링크가 있다면 그 링크를 열면 바로 참여됩니다. 링크를 여기에 붙여 넣어도 됩니다.
          </div>
          <InviteLinkForm />
        </div>
      </div>
    </WelcomeShell>
  );
}
