import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { LearnTabs } from "./LearnTabs";
import { Logo } from "@/components/Logo";
import { Notifications } from "./Notifications";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[420px] items-center justify-between px-5 pt-5 pb-2">
        <Logo height={20} href="/learn" />
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-semibold">{user.name}</span>
          <Notifications />
          <Link href="/workspaces" className="btn-ghost btn-sm">
            switch
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="btn-ghost btn-sm">out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[420px] px-4 pb-12 pt-2">
        <LearnTabs />
        {children}
      </main>
    </div>
  );
}
