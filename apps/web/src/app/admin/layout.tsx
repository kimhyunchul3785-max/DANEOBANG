import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

const NAV = [
  ["/admin", "서비스 현황"],
  ["/admin/academies", "학원"],
  ["/admin/users", "사용자"],
  ["/admin/jobs", "작업·감사"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-slate-900 text-white md:w-56 md:border-b-0">
        <div className="px-4 py-3">
          <div className="text-lg font-bold">단어방 Admin</div>
          <div className="text-xs text-slate-400">{user.name} · 플랫폼 운영자</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              {label}
            </Link>
          ))}
          <Link href="/switch" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800">
            ← 일반 화면
          </Link>
        </nav>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
