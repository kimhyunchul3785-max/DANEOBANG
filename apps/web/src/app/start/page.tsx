import { redirect } from "next/navigation";

/** 구 가입 위저드(/start) → 학원 만들기 */
export default function StartPage() {
  redirect("/welcome/new");
}
