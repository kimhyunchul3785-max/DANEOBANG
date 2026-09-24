import { redirect } from "next/navigation";
export default async function OldScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/tests/scans/${id}`);
}
