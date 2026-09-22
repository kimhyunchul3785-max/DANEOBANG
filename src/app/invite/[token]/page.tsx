import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { Logo } from "@/components/Logo";
import { AcceptForm } from "./AcceptForm";

/**
 * 선생님 초대 수락. 선생님은 공개 회원가입을 하지 않는다 — 초대받은 이메일이 곧 계정 이메일이고,
 * 이름·비밀번호만 정하면 가입 + 학원 참여가 끝난다. 이미 그 이메일로 계정이 있으면 로그인만 하면 된다.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { academy: { select: { name: true, status: true } } } });
  const user = await getCurrentUser();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[480px] px-5 pb-16 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Logo height={20} />
        <span className="digital">INVITE</span>
      </div>
      {children}
    </main>
  );
  const fail = (title: string, body: string) =>
    shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>
          Invalid
        </div>
        <h1 className="h1 mt-1">{title}</h1>
        <p className="muted mt-2">{body}</p>
        <Link href="/login" className="btn-secondary mt-5">
          로그인
        </Link>
      </div>,
    );
  if (!inv) return fail("유효하지 않은 초대입니다", "링크가 잘못되었습니다. 학원장에게 다시 요청하세요.");
  if (inv.usedAt) return fail("이미 수락한 초대입니다", "로그인해서 학원에 들어가세요.");
  if (inv.revokedAt || inv.expiresAt < new Date()) return fail("만료된 초대입니다", "초대는 7일간 유효합니다. 학원장에게 재발급을 요청하세요.");
  const existing = inv.email ? await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } }) : null;
  return shell(
    <>
      <div className="card-dark card-body mb-3">
        <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
          {inv.academy.name}
        </div>
        <h1 className="mt-1 text-[20px] font-semibold">선생님으로 초대되었습니다</h1>
        <p className="mt-1 text-[13px]" style={{ color: "rgba(236,233,227,0.75)" }}>
          {inv.email ?? "누구나"} · 단어시험·재시험 시스템
        </p>
      </div>
      <AcceptForm token={token} email={inv.email} academyName={inv.academy.name} mode={user ? (inv.email && user.email.toLowerCase() !== inv.email ? "wrong_user" : "accept") : existing ? "login" : "signup"} currentEmail={user?.email ?? null} />
    </>,
  );
}
