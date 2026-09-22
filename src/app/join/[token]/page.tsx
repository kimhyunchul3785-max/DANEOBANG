import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashToken } from "@/lib/util";
import { acceptJoinAction } from "@/app/workspaces/actions";
import { Logo } from "@/components/Logo";
import { ActivateForm } from "./ActivateForm";

/**
 * 학생 계정 설정 링크 (/join/<token>).
 * 학원이 등록한 학생 정보는 이미 있으므로 학생은 로그인용 이메일과 비밀번호만 정한다. 선생님 승인 없이 바로 연결된다.
 * 이미 로그인한 상태(같은 학생의 다른 기기 등)라면 그 계정에 바로 연결한다.
 * 선생님 초대 링크(구버전 /join)도 이 경로로 올 수 있어 그 경우는 기존 처리(acceptJoinAction)를 따른다.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = hashToken(token);
  const user = await getCurrentUser();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Logo height={20} />
        <span className="digital">STUDENT</span>
      </div>
      {children}
    </main>
  );
  const student = await prisma.student.findUnique({ where: { inviteTokenHash: h }, include: { academy: { select: { name: true } }, classRoom: { select: { name: true } } } });
  if (!student) {
    // 선생님 초대(구버전) 또는 잘못된 링크
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: h } });
    if (inv) {
      if (!user) return shell(
        <div className="card card-body">
          <p className="text-[14px]">선생님 초대 링크입니다. 로그인 후 참여합니다.</p>
          <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="btn-primary mt-4 w-full py-3">로그인</Link>
        </div>,
      );
      const r = await acceptJoinAction(token);
      return shell(
        <div className="card card-body text-center">
          <h1 className="h1 mb-3">{r.ok ? "참여 완료" : "참여할 수 없습니다"}</h1>
          <p className="muted mb-6">{r.message}</p>
          <Link href={r.redirectTo ?? "/workspaces"} className="btn-primary">계속</Link>
        </div>,
      );
    }
    return shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>Invalid</div>
        <h1 className="h1 mt-1">유효하지 않은 링크입니다</h1>
        <p className="muted mt-2">링크가 잘못되었거나 이미 사용되었습니다. 선생님에게 계정 설정 링크를 다시 요청하세요.</p>
      </div>,
    );
  }
  if (student.inviteExpiresAt && student.inviteExpiresAt < new Date())
    return shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>Expired</div>
        <h1 className="h1 mt-1">만료된 링크입니다</h1>
        <p className="muted mt-2">계정 설정 링크는 7일간 유효합니다. 선생님에게 다시 요청하세요.</p>
      </div>,
    );
  if (student.userId)
    return shell(
      <div className="card card-body">
        <h1 className="h1">이미 계정이 연결된 학생입니다</h1>
        <Link href="/login?next=/learn" className="btn-primary mt-4 w-full py-3">로그인</Link>
      </div>,
    );
  return shell(
    <>
      <div className="card-accent card-body mb-3">
        <div className="lbl-on">{student.academy.name}</div>
        <h1 className="mt-1 text-[22px] font-semibold">{student.name}</h1>
        <p className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
          {[student.school, student.grade, student.classRoom?.name].filter(Boolean).join(" · ") || "학생"} · 단어시험 서비스에 등록되었습니다
        </p>
      </div>
      <ActivateForm token={token} studentName={student.name} presetEmail={student.email} current={user ? { name: user.name, email: user.email } : null} />
    </>,
  );
}
