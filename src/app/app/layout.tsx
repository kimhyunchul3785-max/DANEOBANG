import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAcademy } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

/**
 * 앱 셸 + 결제 게이트.
 * 학원이 active 가 아니면(결제 대기·결제 실패·읽기 전용) 학원장은 요금제 화면으로, 선생님은 안내만 본다.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAcademy();
  const status = ctx.member.academy.status;
  if (status !== "active") {
    const h = await headers();
    const path = h.get("x-pathname") ?? h.get("next-url") ?? "";
    const onBilling = path.startsWith("/app/billing");
    if (!onBilling) {
      if (ctx.isOwner) redirect("/app/billing");
      return (
        <AppShell ctx={ctx}>
          <div className="mx-auto max-w-lg">
            <div className="card-accent card-body">
              <div className="lbl-on">Payment required</div>
              <h1 className="mt-2 text-[20px] font-semibold">{status === "pending_payment" ? "학원 결제가 아직 완료되지 않았습니다" : "학원 결제에 문제가 있습니다"}</h1>
              <p className="mt-2 text-[13px]" style={{ color: "rgba(255,244,240,0.9)" }}>
                학원장이 요금제 및 결제를 완료하면 바로 사용할 수 있습니다. 데이터는 그대로 보관됩니다.
              </p>
              <Link href="/switch" className="btn mt-4" style={{ background: "var(--accent-ink)", color: "var(--accent)" }}>
                계정 전환
              </Link>
            </div>
          </div>
        </AppShell>
      );
    }
  }
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
