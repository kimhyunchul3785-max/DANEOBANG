import { redirect } from "next/navigation";

/**
 * 공개 회원가입은 없다.
 * - 학원(원장): /start 가입 위저드 (학원 정보 → 선생님 수 → 결제)
 * - 선생님: 원장의 초대 링크 (/invite/…) 에서 비밀번호만 설정
 * - 학생: 학원이 등록한 뒤 보내는 계정 설정 링크 (/join/…)
 */
export default function SignupPage() {
  redirect("/start");
}
