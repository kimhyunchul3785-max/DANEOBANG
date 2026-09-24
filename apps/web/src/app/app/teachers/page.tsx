import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { HBars } from "@/components/Viz";
import { loadGrades, avg, rate, recentWeeks } from "@/lib/stats";
import { revokeInvitationAction, setMemberStatusAction } from "../settings/actions";
import { InviteBox } from "../settings/InviteBox";
import { seatUsage } from "@/lib/seats";
import { won } from "@/lib/billing";

/** 선생님 관리 — 학원장 전용. 담당 학생 수·최근 4주 평균·통과율과 초대 */
export default async function TeachersPage() {
  const ctx = await requireOwner();
  const academyId = ctx.member.academyId;
  const members = await prisma.academyMember.findMany({
    where: { academyId },
    include: { user: { select: { name: true, email: true, provider: true } }, students: { select: { studentId: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const invitations = await prisma.invitation.findMany({ where: { academyId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  const usage = await seatUsage(academyId);
  const since = recentWeeks(4)[0];
  const grades = await loadGrades(academyId, { academyId }, since);
  const stat = (studentIds: string[]) => {
    const g = grades.filter((x) => studentIds.includes(x.studentId) && !x.isRetake);
    return { avg: avg(g.map((x) => x.score)), pass: rate(g.filter((x) => x.passed).length, g.length), n: g.length };
  };
  const rows = members.filter((m) => m.status === "active").map((m) => ({ m, s: stat(m.students.map((x) => x.studentId)) }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">선생님</h1>
          <p className="muted mt-1">담당 학생은 학생 상세에서 지정합니다. 선생님은 담당 학생만 봅니다.</p>
        </div>
        {usage.unlimited ? (
          <span className="digital" data-testid="seat-summary">
            선생님 {usage.used}명{usage.pending ? ` · 초대 대기 ${usage.pending}` : ""}
          </span>
        ) : (
        <Link href="/app/billing" className="card-sm card-body flex items-center gap-4 !py-2.5" data-testid="seat-summary" title="요금제 및 결제">
          <span>
            <span className="lbl">이용 중인 선생님</span>
            <span className="num-md block" style={{ fontSize: 22 }}>
              {usage.used}
              <span style={{ color: "var(--ink-3)" }}> / {usage.quantity}명</span>
            </span>
          </span>
          <span className="muted text-[12px]">
            {usage.pending ? `초대 대기 ${usage.pending} · ` : ""}월 {won(usage.monthly)}
            <br />
            {usage.available > 0 ? `추가 가능 ${usage.available}명` : "자리 없음 · 선생님 수 늘리기 →"}
          </span>
        </Link>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card card-body">
            <div className="mb-3 flex items-center justify-between">
              <div className="lbl">최근 4주 담당 학생 평균</div>
              <span className="digital">채점 {grades.filter((g) => !g.isRetake).length}건</span>
            </div>
            <HBars rows={rows.map(({ m, s }) => ({ key: m.id, label: m.user.name, value: s.avg, sub: `${m.students.length}명` }))} accentBelow={70} />
          </section>

          <section className="card">
            <div className="card-body">
              <div className="lbl mb-2">구성원</div>
              <table className="tbl tbl-cards">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>역할</th>
                    <th>담당</th>
                    <th>4주 통과율</th>
                    <th>상태</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const s = stat(m.students.map((x) => x.studentId));
                    return (
                      <tr key={m.id} data-member-status={m.status}>
                        <td data-label="_title">
                          <div>
                            <div className="font-medium">{m.user.name}</div>
                            <div className="muted text-[12px] font-normal">
                              {m.user.email} · {m.user.provider}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap" data-label="역할">
                          {m.role === "OWNER" ? "학원장" : m.role === "ADMIN" ? "관리자" : "선생님"}
                          {m.role === "OWNER" && (m.isTeacher ? " · 선생님" : " · 관리만")}
                          {m.role !== "OWNER" && !m.isTeacher && " · 관리만"}
                        </td>
                        <td className="whitespace-nowrap" data-label="담당">
                          <Link href={`/app/students?teacher=${m.id}`} className="hover:underline" style={{ padding: "4px 0" }}>
                            {m.students.length}명
                          </Link>
                        </td>
                        <td className="whitespace-nowrap" data-label="4주 통과율">{s.pass === null ? "–" : `${s.pass}%`}</td>
                        <td data-label="상태">{m.status === "active" ? <span className="badge-green">활성</span> : <span className="badge-gray">중지</span>}</td>
                        <td className="text-right">
                          {m.role !== "OWNER" && (
                            <ActionButton action={setMemberStatusAction.bind(null, m.id, m.status === "active" ? "disabled" : "active")} className="btn-ghost btn-sm" confirm={m.status === "active" ? `${m.user.name} 선생님의 접근을 중지할까요? 자리는 비지만 구매 자리 수는 그대로입니다.` : undefined}>
                              {m.status === "active" ? "접근 중지" : "복구"}
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <div className="card-dark card-body">
            <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
              Invite · 선생님 초대
            </div>
            <p className="mt-2 text-[13px]" style={{ color: "rgba(236,233,227,0.8)" }}>
              초대 링크를 연 뒤 같은 이메일의 Google·카카오 계정으로 로그인하면 참여됩니다. 7일 유효 · 1회 사용 · 재발급하면 이전 초대는 폐기됩니다.{usage.unlimited ? "" : " 보내는 순간 자리를 예약합니다."}
            </p>
            <div className="mt-3">
              <InviteBox available={usage.available} />
            </div>
            {!usage.unlimited && usage.available <= 0 && (
              <Link href="/app/billing" className="btn mt-3 w-full py-2.5" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                사용 가능한 자리가 없습니다 · 선생님 수 늘리기
              </Link>
            )}
            {invitations.length > 0 && (
              <ul className="mt-3 text-[12px]" style={{ color: "rgba(236,233,227,0.8)" }}>
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-1" data-testid="pending-invite">
                    <span>
                      <span className="badge-amber mr-1">INVITED</span>
                      {i.email ?? "누구나"} · 만료 {fmtDate(i.expiresAt, false)}
                    </span>
                    <ActionButton action={revokeInvitationAction.bind(null, i.id)} className="btn-ghost btn-sm" >
                      취소
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
