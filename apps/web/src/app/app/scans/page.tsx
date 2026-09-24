import { redirect } from "next/navigation";
/** v5: 사진 채점은 시험 탭 아래 (/app/tests/scans). 옛 링크 호환 */
export default function OldScansPage() {
  redirect("/app/tests/scans");
}
