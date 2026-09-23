import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, listContexts, setAcademyCookie, setLearnCookie } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { Logo } from "@/components/Logo";
import { selectContextAction } from "./actions";

/**
 * 계정 전환 — "어떤 학원에서 어떤 역할로 들어갈지"를 고른다.
 * Workspace·Membership 같은 내부 용어는 보이지 않는다. ?to=member:<academyId> | student 로 바로 전환.
 */
export default async function SwitchPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await requireUser("/switch");
  const sp = await searchParams;
  const { memberships, students, pending } = await listContexts(user.id);
  if (sp.to) {
    if (sp.to === "student" && students.length) {
      await setLearnCookie();
      redirect("/learn");
    }
    const academyId = sp.to.startsWith("member:") ? sp.to.slice(7) : null;
    if (academyId && memberships.some((m) => m.academyId === academyId)) {
      await setAcademyCookie(academyId);
      redirect("/app");
    }
  }
  if (memberships.length === 0 && students.length === 0 && pending.length === 0) redirect("/welcome");

  return (
    <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-6">
      <div className="mb-8 flex items-center justify-between">
        <Logo height={20} href="/" />
        <form action="/api/auth/logout" method="post">
          <button className="lbl hover:text-[var(--ink)]">Sign out</button>
        </form>
      </div>
      <div className="anim-fade-up">
        <div className="lbl">{user.name}</div>
        <h1 className="h1 mt-1">계정 전환</h1>
      </div>

      <ul className="mt-6 grid gap-2 anim-fade-up" style={{ animationDelay: "60ms" }} data-testid="context-list">
        {students.length > 0 && (
          <li>
            <form action={selectContextAction}>
              <input type="hidden" name="to" value="student" />
              <button className="tile card flex w-full items-center justify-between rounded-[20px] px-5 py-4 text-left" data-testid="ctx-student">
                <span>
                  <span className="block text-[16px] font-semibold tracking-tight">{students.map((s) => s.academy.name).join(" · ")}</span>
                  <span className="block text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    학생{students.length > 1 ? ` · ${students.length}곳` : ""}
                  </span>
                </span>
                <span className="lbl-ink">→</span>
              </button>
            </form>
          </li>
        )}
        {memberships.map((m) => (
          <li key={m.id}>
            <form action={selectContextAction}>
              <input type="hidden" name="to" value={`member:${m.academyId}`} />
              <button className="tile card flex w-full items-center justify-between rounded-[20px] px-5 py-4 text-left" data-testid={`ctx-${m.academyId}`}>
                <span>
                  <span className="block text-[16px] font-semibold tracking-tight">{m.academy.name}</span>
                  <span className="block text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    {ROLE_LABEL[m.role] ?? m.role}
                    {m.academy.status === "pending_payment" ? " · 결제 필요" : m.academy.status !== "active" ? " · 결제 확인 필요" : ""}
                  </span>
                </span>
                <span className="lbl-ink">→</span>
              </button>
            </form>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-[20px] px-5 py-4" style={{ background: "var(--surface-2)" }}>
            <span>
              <span className="block text-[16px] font-semibold tracking-tight">{p.student.academy.name}</span>
              <span className="block text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                학생 · 선생님 확인 대기
              </span>
            </span>
            <span className="badge-amber">대기</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <div className="grid gap-1">
          <Link href="/welcome/student?from=switch" className="lbl-ink py-1.5">
            + 학생으로 다른 학원 참여
          </Link>
          <Link href="/welcome/new" className="lbl-ink py-1.5">
            + 새 학원 만들기
          </Link>
          {user.isPlatformAdmin && (
            <Link href="/admin" className="lbl-ink py-1.5">
              플랫폼 관리자 →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
