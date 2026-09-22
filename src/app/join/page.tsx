import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CodeJoinForm } from "./CodeJoinForm";

/**
 * 학생 가입 — 휴대폰 번호 + 선생님이 보낸 인증번호 + 비밀번호.
 * 학원이 이미 이름·학교·학년·반을 등록해 두었으므로 학생은 이 세 가지만 입력한다. 선생님 승인 없이 바로 명단에 연결된다.
 */
export default function JoinByCodePage() {
  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Logo height={20} />
        <span className="digital">STUDENT</span>
      </div>
      <div className="card-accent card-body mb-3">
        <div className="lbl-on">Join · 학생 가입</div>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight">선생님이 보낸 인증번호로 가입하세요</h1>
        <p className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
          휴대폰 번호 · 인증번호 · 비밀번호만 있으면 됩니다. 학교·학년·반은 학원에서 이미 등록했습니다.
        </p>
      </div>
      <CodeJoinForm />
      <p className="muted mt-4 text-center">
        이미 가입했나요?{" "}
        <Link href="/login?next=/learn" className="underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
