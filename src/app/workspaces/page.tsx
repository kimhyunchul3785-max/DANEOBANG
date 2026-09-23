import { redirect } from "next/navigation";

/** 구 /workspaces → 계정 전환 */
export default function WorkspacesPage() {
  redirect("/switch");
}
