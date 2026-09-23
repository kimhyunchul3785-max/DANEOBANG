import { redirect } from "next/navigation";

/** 회원가입 화면은 없다. Google/Kakao 로그인이 곧 가입이다 (처음이면 가입, 기존이면 로그인). */
export default function SignupPage() {
  redirect("/login");
}
