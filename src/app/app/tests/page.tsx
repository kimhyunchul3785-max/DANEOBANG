import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate } from "@/lib/util";

export default async function TestsPage() {
  const ctx = await requireAcademy();
  const exams = await prisma.exam.findMany({
    where: { academyId: ctx.member.academyId },
    include: { book: { select: { title: true } }, scopes: true, forms: { select: { version: true, status: true } }, _count: { select: { assignments: true } }, assignments: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });
  const dayLabels = await prisma.bookDay.findMany({ where: { id: { in: exams.flatMap((e) => e.scopes.map((s) => s.dayId)) } } });
  const labelOf = (id: string) => dayLabels.find((d) => d.id === id)?.label ?? "?";
  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="h1">시험</h1>
          <p className="muted">시험 = 범위·설정, 버전(form) = 확정된 문항. 발행된 버전은 바뀌지 않습니다.</p>
        </div>
        <Link href="/app/tests/new" className="btn-primary">
          + 시험 만들기
        </Link>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>시험</th>
              <th>단어장 · 범위</th>
              <th>문항/통과</th>
              <th>버전</th>
              <th>배정 (완료)</th>
              <th>상태</th>
              <th>생성</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400">
                  시험이 없습니다.
                </td>
              </tr>
            )}
            {exams.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/app/tests/${e.id}`} className="font-medium text-blue-700 hover:underline">
                    {e.title}
                  </Link>
                  {e.isRetake && <span className="badge-amber ml-1">재시험</span>}
                </td>
                <td className="text-xs text-slate-600">
                  {e.book.title}
                  <br />
                  {e.scopes.map((s) => labelOf(s.dayId)).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, ""))).join(", ")}
                </td>
                <td>
                  {e.questionCount} / {e.passScore}점
                </td>
                <td className="text-xs">{e.forms.map((f) => `v${f.version}${f.status === "published" ? "✓" : "(초안)"}`).join(", ") || "-"}</td>
                <td>
                  {e._count.assignments} ({e.assignments.filter((a) => a.status === "completed").length})
                </td>
                <td>
                  <span className={e.status === "published" ? "badge-green" : e.status === "archived" ? "badge-gray" : "badge-amber"}>{e.status === "published" ? "발행" : e.status === "archived" ? "보관" : "초안"}</span>
                </td>
                <td className="text-xs text-slate-500">{fmtDate(e.createdAt, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
