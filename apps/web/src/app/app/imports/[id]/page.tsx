import { redirect } from "next/navigation";
/** v5: 업로드 상태 화면은 단어장 아래 (/app/vocabulary/imports/[id]). 옛 링크 호환 */
export default async function OldImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/vocabulary/imports/${id}`);
}
