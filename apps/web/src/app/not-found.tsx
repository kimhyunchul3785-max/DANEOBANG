import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4" data-testid="not-found">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 px-1">
          <Logo height={24} />
        </div>
        <div className="card card-body">
          <h1 className="h1">페이지를 찾을 수 없어요</h1>
          <p className="muted mt-2">주소가 바뀌었거나 없는 페이지예요.</p>
          <div className="mt-4 flex gap-2">
            <Link href="/" className="btn-primary">
              처음으로
            </Link>
            <Link href="/switch" className="btn-ghost">
              내 화면 고르기
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
