import { requireUser } from "@/lib/auth";
import { WelcomeShell } from "../Shell";
import { StudentJoinForms } from "./StudentJoinForms";

/** 학생 첫 진입: 반 코드로 참여 / 문자 인증번호 입력. 초대 링크는 그냥 열면 된다 (/join/…) */
export default async function StudentWelcomePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser("/welcome/student");
  const sp = await searchParams;
  return (
    <WelcomeShell user={user} back={sp.from === "learn" ? "/learn" : sp.from === "switch" ? "/switch" : "/welcome?force=1"}>
      <div className="anim-fade-up">
        <div className="lbl">학생 · {user.name}</div>
        <h1 className="h1 mt-1">학원과 연결해주세요</h1>
        <p className="muted mt-1">선생님에게 받은 방법으로 연결할 수 있어요.</p>
      </div>
      <div className="mt-6 anim-fade-up" style={{ animationDelay: "60ms" }}>
        <StudentJoinForms defaultName={user.name} defaultPhone={user.phone ?? ""} />
      </div>
      <p className="muted mt-5 text-center">초대 링크를 받았다면 링크를 열어 바로 연결할 수 있어요.</p>
    </WelcomeShell>
  );
}
