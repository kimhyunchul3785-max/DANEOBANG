import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate } from "@/lib/util";

export default async function TestsPage() {
  const ctx = await requireAcademy();
  const exams = await prisma.exam.findMany({
    where: { academyId: ctx.member.academyId },
    include: { book: { select: { title: true } }, scopes: true, _count: { select: { assignments: true } }, assignments: { select: { status: true, dueAt: true, startAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const dayLabels = await prisma.bookDay.findMany({ where: { id: { in: exams.flatMap((e) => e.scopes.map((s) => s.dayId)) } } });
  const labelOf = (id: string) => dayLabels.find((d) => d.id === id)?.label ?? "?";
  const now = Date.now();
  // 목록의 마감: 안 친 학생 기준 공통 마감 (모두 완료면 전체 기준). 학생마다 다르면 "여러"
  const dueOf = (as: { status: string; dueAt: Date | null; startAt: Date | null }[]) => {
    const base = as.some((a) => a.status !== "completed") ? as.filter((a) => a.status !== "completed") : as;
    const set = new Set(base.map((a) => a.dueAt?.getTime() ?? 0));
    if (!base.length) return null;
    if (set.size > 1) return "여러";
    const v = [...set][0];
    return v ? new Date(v) : "없음";
  };
  const startPendingOf = (as: { startAt: Date | null }[]) => as.length > 0 && as.every((a) => a.startAt && a.startAt.getTime() > now);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Tests · 시험</div>
          <h1 className="h1 mt-1">시험</h1>
          <p className="muted mt-1">시험 {exams.length}개 · 최근 만든 순</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/scans" className="btn-secondary" data-nav="/app/scans">
            사진 채점
          </Link>
          <Link href="/app/tests/new" className="btn-primary">
            + 시험 만들기
          </Link>
        </div>
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
              <th>마감</th>
              <th className="whitespace-nowrap">만든 날</th>
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
                <td className="whitespace-nowrap text-xs" style={{ color: "var(--ink-3)" }}>
                  {(() => {
                    const d = dueOf(e.assignments);
                    const open = e.assignments.some((a) => a.status !== "completed");
                    if (d === null) return "-";
                    if (d === "여러" || d === "없음") return d;
                    const late = open && d.getTime() < now;
                    return (
                      <span style={late ? { color: "var(--accent)", fontWeight: 600 } : undefined}>
                        {fmtDate(d)}
                        {late ? " 지남" : ""}
                        {startPendingOf(e.assignments) ? " · 시작 예약" : ""}
                      </span>
                    );
                  })()}
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
