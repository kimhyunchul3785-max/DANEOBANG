import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { HBars } from "@/components/Viz";
import { loadGrades, avg, rate, recentWeeks } from "@/lib/stats";
import { revokeInvitationAction, setMemberStatusAction } from "../settings/actions";
import { InviteBox } from "../settings/InviteBox";

/** 선생님 관리 — 학원장 전용. 담당 학생 수·최근 4주 평균·통과율과 초대 */
export default async function TeachersPage() {
  const ctx = await requireOwner();
  const academyId = ctx.member.academyId;
  const members = await prisma.academyMember.findMany({
    where: { academyId },
    include: { user: { select: { name: true, email: true, provider: true } }, students: { select: { studentId: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const invitations = await prisma.invitation.findMany({ where: { academyId, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
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
          <div className="kicker">Teachers · 선생님</div>
          <h1 className="h1 mt-1">선생님</h1>
          <p className="muted mt-1">담당 학생은 학생 상세에서 지정합니다. 선생님은 담당 학생만 봅니다.</p>
        </div>
        <span className="digital">{members.filter((m) => m.status === "active").length} ACTIVE</span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card card-body">
            <div className="mb-3 flex items-center justify-between">
              <div className="lbl">By teacher · 최근 4주 담당 학생 평균</div>
              <span className="digital">{grades.filter((g) => !g.isRetake).length} GRADED</span>
            </div>
            <HBars rows={rows.map(({ m, s }) => ({ key: m.id, label: m.user.name, value: s.avg, sub: `${m.students.length}명` }))} accentBelow={70} />
          </section>

          <section className="card">
            <div className="card-body">
              <div className="lbl mb-2">Members · 구성원</div>
              <table className="tbl">
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
                      <tr key={m.id}>
                        <td>
                          <div className="font-medium">{m.user.name}</div>
                          <div className="muted text-[12px]">
                            {m.user.email} · {m.user.provider}
                          </div>
                        </td>
                        <td>{m.role === "OWNER" ? "학원장" : "선생님"}</td>
                        <td>
                          <Link href={`/app/students?teacher=${m.id}`} className="hover:underline">
                            {m.students.length}명
                          </Link>
                        </td>
                        <td>{s.pass === null ? "–" : `${s.pass}%`}</td>
                        <td>{m.status === "active" ? <span className="badge-green">ACTIVE</span> : <span className="badge-gray">OFF</span>}</td>
                        <td className="text-right">
                          {m.role !== "OWNER" && (
                            <ActionButton action={setMemberStatusAction.bind(null, m.id, m.status === "active" ? "inactive" : "active")} className="btn-ghost btn-sm">
                              {m.status === "active" ? "비활성화" : "활성화"}
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
              링크는 7일간 유효하며 1회만 사용됩니다. 가입한 선생님에게 학생 상세에서 담당을 지정하세요.
            </p>
            <div className="mt-3">
              <InviteBox />
            </div>
            {invitations.length > 0 && (
              <ul className="mt-3 text-[12px]" style={{ color: "rgba(236,233,227,0.8)" }}>
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-1">
                    <span>
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
