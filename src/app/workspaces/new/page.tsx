import { redirect } from "next/navigation";

/** 학원 개설은 가입 위저드(/start)에서 — 로그인한 사용자는 계정 단계를 건너뛴다 */
export default function NewAcademyPage() {
  redirect("/start");
}
