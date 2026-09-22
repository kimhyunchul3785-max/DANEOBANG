import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate } from "@/lib/util";

export default async function TestsPage() {
  const ctx = await requireAcademy();
  const exams = await prisma.exam.findMany({
    where: { academyId: ctx.member.academyId },
    include: { book: { select: { title: true } }, scopes: true, _count: { select: { assignments: true } }, assignments: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });
  const dayLabels = await prisma.bookDay.findMany({ where: { id: { in: exams.flatMap((e) => e.scopes.map((s) => s.dayId)) } } });
  const labelOf = (id: string) => dayLabels.find((d) => d.id === id)?.label ?? "?";
  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="h1">시험</h1>
          <p className="muted mt-1">시험 {exams.length}개 · 최근 만든 순</p>
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
              <th className="whitespace-nowrap">문항 · 통과</th>
              <th className="whitespace-nowrap">완료 / 배정</th>
              <th>상태</th>
              <th>만든 날</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-400">
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
                  {e.isRetake && <span className="badge-amber ml-1.5 align-middle">재시험</span>}
                </td>
                <td className="max-w-[260px] text-xs leading-relaxed text-slate-600">
                  <div className="truncate" title={e.book.title}>
                    {e.book.title}
                  </div>
                  {e.scopes.map((s) => labelOf(s.dayId)).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, ""))).join(", ")}
                </td>
                <td className="whitespace-nowrap">
                  {e.questionCount}문항 · {e.passScore}점
                </td>
                <td className="whitespace-nowrap">
                  {e.assignments.filter((a) => a.status === "completed").length} / {e._count.assignments}
                </td>
                <td>
                  <span className={e.status === "published" ? "badge-green" : e.status === "archived" ? "badge-gray" : "badge-amber"}>{e.status === "published" ? "발행" : e.status === "archived" ? "보관" : "초안"}</span>
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(e.createdAt, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
