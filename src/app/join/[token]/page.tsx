import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { acceptJoinAction } from "@/app/workspaces/actions";
import { redirect } from "next/navigation";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  const result = await acceptJoinAction(token);
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="h1 mb-3">{result.ok ? "참여 완료" : "참여할 수 없습니다"}</h1>
      <p className="muted mb-6">{result.message}</p>
      <Link href={result.redirectTo ?? "/workspaces"} className="btn-primary">
        계속
      </Link>
    </main>
  );
}
