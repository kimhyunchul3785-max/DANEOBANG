import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/util";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { setAcademyStatusAction, setAcademyPlanAction } from "../actions";

export default async function AdminAcademies() {
  const academies = await prisma.academy.findMany({
    include: { _count: { select: { members: true, students: true, exams: true, imports: true, scans: true } }, members: { where: { role: "OWNER" }, include: { user: { select: { name: true, email: true } } } }, subscription: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <h1 className="h1 mb-4">학원 관리</h1>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>학원</th>
              <th>학원장</th>
              <th>구성원/학생</th>
              <th>시험/업로드/사진</th>
              <th>요금제</th>
              <th>상태</th>
              <th>개설</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {academies.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-slate-500">/{a.slug}</div>
                </td>
                <td className="text-xs">{a.members.map((m) => `${m.user.name} (${m.user.email})`).join(", ")}</td>
                <td>
                  {a._count.members} / {a._count.students}
                </td>
                <td>
                  {a._count.exams} / {a._count.imports} / {a._count.scans}
                </td>
                <td>
                  {a.subscription ? (
                    <div className="text-xs">
                      <div className="font-medium">
                        선생님 {a.subscription.seatQuantity}명 · 월 {(a.subscription.seatQuantity * a.subscription.unitPrice).toLocaleString("ko-KR")}원
                      </div>
                      <div className="text-slate-500">
                        {a.subscription.provider} · {a.subscription.status}
                        {a.subscription.cardLast4 ? ` · ****${a.subscription.cardLast4}` : ""}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">구독 없음</span>
                  )}
                  <ActionForm action={setAcademyPlanAction} className="mt-1 flex gap-1" resetOnSuccess={false}>
                    <input type="hidden" name="academyId" value={a.id} />
                    <input className="input w-20" name="plan" defaultValue={a.plan} />
                    <button className="btn-ghost btn-sm">저장</button>
                  </ActionForm>
                </td>
                <td>{a.status === "active" ? <span className="badge-green">운영</span> : a.status === "pending_payment" ? <span className="badge-amber">결제 대기</span> : a.status === "suspended" ? <span className="badge-red">정지</span> : <span className="badge-gray">{a.status}</span>}</td>
                <td className="text-xs text-slate-500">{fmtDate(a.createdAt, false)}</td>
                <td className="text-right">
                  <ActionButton action={setAcademyStatusAction.bind(null, a.id, a.status === "active" ? "suspended" : "active")} className={a.status === "active" ? "btn-danger btn-sm" : "btn-secondary btn-sm"} confirm={a.status === "active" ? "이 학원의 이용을 정지할까요? 소속 사용자가 접속할 수 없게 됩니다." : undefined}>
                    {a.status === "active" ? "이용 정지" : "복구"}
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
