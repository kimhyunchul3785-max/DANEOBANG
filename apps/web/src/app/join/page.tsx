import { redirect } from "next/navigation";

/** 구 학생 가입(/join) → 학생 연결 화면 (로그인 뒤 반 코드·문자 인증번호) */
export default function JoinPage() {
  redirect("/welcome/student");
}
