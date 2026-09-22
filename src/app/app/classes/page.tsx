import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { createClassAction, toggleClassArchiveAction } from "../students/actions";

export default async function ClassesPage() {
  const ctx = await requireAcademy();
  const classes = await prisma.classRoom.findMany({
    where: { academyId: ctx.member.academyId },
    include: { _count: { select: { students: true } } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
  return (
    <div>
      <h1 className="h1 mb-4">반</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>반 이름</th>
                <th>학생 수</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400">
                    반이 없습니다.
                  </td>
                </tr>
              )}
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c._count.students}</td>
                  <td>{c.archived ? <span className="badge-gray">보관</span> : <span className="badge-green">운영</span>}</td>
                  <td className="text-right">
                    <ActionButton action={toggleClassArchiveAction.bind(null, c.id)}>{c.archived ? "복원" : "보관"}</ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card card-body">
          <h2 className="h2 mb-2">반 만들기</h2>
          <ActionForm action={createClassAction} className="flex gap-2">
            <input className="input" name="name" placeholder="예: 중2 A반" required maxLength={30} />
            <button className="btn-primary">추가</button>
          </ActionForm>
          <p className="muted mt-3">학생을 반에서 이동해도 과거 응시 기록은 유지됩니다.</p>
        </div>
      </div>
    </div>
  );
}
