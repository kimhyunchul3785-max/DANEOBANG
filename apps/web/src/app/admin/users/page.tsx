import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { setUserStatusAction, toggleAdminAction } from "../actions";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const users = await prisma.user.findMany({
    where: sp.q ? { OR: [{ email: { contains: sp.q } }, { name: { contains: sp.q } }] } : {},
    include: { memberships: { include: { academy: { select: { name: true } } } }, _count: { select: { studentLinks: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <h1 className="h1 mb-4">사용자</h1>
      <form className="mb-3 flex gap-2" method="get">
        <input className="input w-64" name="q" placeholder="이름/이메일 검색" defaultValue={sp.q ?? ""} />
        <button className="btn-secondary">검색</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>사용자</th>
              <th>로그인</th>
              <th>소속</th>
              <th>학생 연결</th>
              <th>권한</th>
              <th>상태</th>
              <th>가입</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="text-xs">{u.provider}</td>
                <td className="text-xs">{u.memberships.map((m) => `${m.academy.name}(${m.role === "OWNER" ? "장" : "교사"})`).join(", ") || "-"}</td>
                <td>{u._count.studentLinks}</td>
                <td>{u.isPlatformAdmin ? <span className="badge-blue">ADMIN</span> : "-"}</td>
                <td>{u.status === "active" ? <span className="badge-green">활성</span> : <span className="badge-red">정지</span>}</td>
                <td className="text-xs text-slate-500">{fmtDate(u.createdAt, false)}</td>
                <td className="whitespace-nowrap text-right">
                  <ActionButton action={toggleAdminAction.bind(null, u.id)} className="btn-ghost btn-sm">
                    {u.isPlatformAdmin ? "ADMIN 해제" : "ADMIN 부여"}
                  </ActionButton>
                  <ActionButton action={setUserStatusAction.bind(null, u.id, u.status === "active" ? "suspended" : "active")} className="btn-ghost btn-sm text-red-600">
                    {u.status === "active" ? "정지" : "복구"}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
