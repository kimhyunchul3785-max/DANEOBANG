import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/util";

export default async function AdminHome() {
  const since = new Date(Date.now() - 7 * 86400e3);
  const [academies, users, students, exams, attempts, jobsQueued, jobsFailed, usage, activeUsers, scans] = await Promise.all([
    prisma.academy.count(),
    prisma.user.count(),
    prisma.student.count(),
    prisma.exam.count({ where: { status: "published" } }),
    prisma.attempt.count({ where: { status: "graded" } }),
    prisma.job.count({ where: { status: { in: ["queued", "running"] } } }),
    prisma.job.count({ where: { status: "failed" } }),
    prisma.usageEvent.groupBy({ by: ["kind"], _sum: { amount: true }, where: { createdAt: { gte: since } } }),
    prisma.auditLog.findMany({ where: { action: "login", createdAt: { gte: since } }, distinct: ["userId"], select: { userId: true } }),
    prisma.scanUpload.count({ where: { status: { in: ["needs_review", "unrecognized"] } } }),
  ]);
  const Stat = ({ l, v }: { l: string; v: string | number }) => (
    <div className="card card-body">
      <div className="text-xs text-slate-500">{l}</div>
      <div className="text-2xl font-bold">{v}</div>
    </div>
  );
  return (
    <div>
      <h1 className="h1 mb-1">서비스 현황</h1>
      <p className="muted mb-4">{fmtDate(new Date())} · 개별 학생 내용은 운영 통계에 노출하지 않습니다.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat l="학원(테넌트)" v={academies} />
        <Stat l="사용자" v={users} />
        <Stat l="7일 활성 사용자" v={activeUsers.length} />
        <Stat l="학생 명단" v={students} />
        <Stat l="발행 시험" v={exams} />
        <Stat l="확정 응시" v={attempts} />
        <Stat l="작업 대기/실행" v={jobsQueued} />
        <Stat l="작업 실패" v={jobsFailed} />
        <Stat l="사진 검수 대기" v={scans} />
      </div>
      <div className="card card-body mt-4">
        <h2 className="h2 mb-2">최근 7일 사용량</h2>
        <ul className="text-sm">
          {usage.length === 0 && <li className="muted">없음</li>}
          {usage.map((u) => (
            <li key={u.kind}>
              {u.kind}: {u._sum.amount ?? 0}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
