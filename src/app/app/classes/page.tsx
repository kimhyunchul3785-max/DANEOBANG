import { redirect } from "next/navigation";

/** 반 관리는 학생 탭으로 통합되었다 */
export default function ClassesPage() {
  redirect("/app/students");
}
