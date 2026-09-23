import { requireUser } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { WelcomeShell } from "../Shell";
import { NewAcademyForm } from "./NewAcademyForm";

/** 학원 만들기 — 필드는 학원 이름 하나. 만들면 학원장 + 기본 반 + 반 코드가 함께 생기고 바로 /app */
export default async function NewAcademyPage() {
  const user = await requireUser("/welcome/new");
  return (
    <WelcomeShell user={user} back="/welcome/teacher">
      <div className="anim-fade-up">
        <div className="lbl">New academy</div>
        <h1 className="h1 mt-1">학원 이름을 알려주세요</h1>
        <p className="muted mt-1">나머지는 나중에 설정에서 바꿀 수 있어요.</p>
      </div>
      <div className="mt-6 anim-fade-up" style={{ animationDelay: "60ms" }}>
        <NewAcademyForm billing={billingEnabled()} />
      </div>
    </WelcomeShell>
  );
}
