import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { retryJobAction } from "../actions";

export default async function AdminJobs() {
  const jobs = await prisma.job.findMany({ include: { academy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const audits = await prisma.auditLog.findMany({ include: { user: { select: { name: true } }, academy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1 mb-3">작업(job)</h1>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>유형</th>
                <th>학원</th>
                <th>상태</th>
                <th>시도</th>
                <th>오류</th>
                <th>갱신</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="font-mono text-xs">{j.type}</td>
                  <td className="text-xs">{j.academy?.name ?? "-"}</td>
                  <td>
                    <span className={j.status === "done" ? "badge-green" : j.status === "failed" ? "badge-red" : "badge-blue"}>{j.status}</span>
                  </td>
                  <td>{j.attempts}</td>
                  <td className="max-w-xs truncate text-xs text-red-600">{j.error ?? ""}</td>
                  <td className="text-xs text-slate-500">{fmtDate(j.updatedAt)}</td>
                  <td className="text-right">{j.status === "failed" && <ActionButton action={retryJobAction.bind(null, j.id)}>재실행</ActionButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h2 className="h1 mb-3">감사 로그</h2>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>시각</th>
                <th>사용자</th>
                <th>학원</th>
                <th>동작</th>
                <th>대상</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs text-slate-500">{fmtDate(a.createdAt)}</td>
                  <td className="text-xs">{a.user?.name ?? "-"}</td>
                  <td className="text-xs">{a.academy?.name ?? "-"}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td className="font-mono text-[10px] text-slate-400">{a.target ?? ""}</td>
                  <td className="text-xs">{a.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
