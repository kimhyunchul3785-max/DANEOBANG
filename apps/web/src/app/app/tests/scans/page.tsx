import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtMDHM, parseJSON } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { rejectScanAction } from "./actions";
import type { ItemDetection } from "@/lib/omr/analyze";

const STATUS: Record<string, [string, string]> = {
  queued: ["badge-gray", "판독 대기"],
  processing: ["badge-blue", "판독 중"],
  needs_review: ["badge-amber", "확인 필요"],
  unrecognized: ["badge-red", "식별 실패"],
  accepted: ["badge-green", "확정"],
  failed: ["badge-gray", "제외"],
};
const FILTERS = [
  ["check", "확인 필요"],
  ["all", "전체"],
  ["accepted", "확정"],
] as const;

/**
 * 사진 채점 = 학생이 QR·앱으로 올린 시험지 사진 목록. 선생님이 직접 올리지 않는다 (v5.2).
 * 여기서는 "누가 무엇을 언제 냈고, 판독이 어떻게 됐는지"를 보고, [대조] 로 들어가 원본 사진과 판독 결과를 나란히 확인·정정한다.
 */
export default async function ScansPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.filter) ? (sp.filter as (typeof FILTERS)[number][0]) : "check";
  const scans = await prisma.scanUpload.findMany({
    where: {
      academyId: ctx.member.academyId,
      status: filter === "check" ? { in: ["queued", "processing", "needs_review", "unrecognized"] } : filter === "accepted" ? "accepted" : { not: "failed" },
      OR: [{ page: { print: { attempt: { assignment: { student: studentScope(ctx) } } } } }, { page: null }],
    },
    include: { page: { include: { print: { include: { attempt: { include: { assignment: { include: { student: { include: { classRoom: true } }, exam: true } } } }, pages: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const busy = scans.some((s) => s.status === "queued" || s.status === "processing");
  const counts = await prisma.scanUpload.groupBy({ by: ["status"], where: { academyId: ctx.member.academyId, status: { not: "failed" } }, _count: { _all: true } });
  const n = (keys: string[]) => counts.filter((c) => keys.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const countOf = { check: n(["queued", "processing", "needs_review", "unrecognized"]), all: n(["queued", "processing", "needs_review", "unrecognized", "accepted"]), accepted: n(["accepted"]) };

  return (
    <div className="mx-auto max-w-6xl" data-width="wide">
      {busy && <AutoRefresh ms={2500} />}
      <Link href="/app/tests" className="kicker hover:underline">
        ← 시험
      </Link>
      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">사진 채점 · 학생 제출 대조</h1>
        </div>
        <div className="seg" role="tablist" aria-label="필터" data-testid="scans-filters">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/app/tests/scans?filter=${k}`} className={`seg-item${filter === k ? " on" : ""}`} role="tab" aria-selected={filter === k} data-filter={k}>
              {l}
              <span className="chip-sub">{countOf[k]}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card">
        <table className="tbl tbl-cards">
          <thead>
            <tr>
              <th>학생</th>
              <th>시험</th>
              <th>페이지</th>
              <th>판독</th>
              <th>상태</th>
              <th>제출</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center" style={{ color: "var(--ink-3)" }}>
                  {filter === "check" ? "확인할 사진이 없어요. 학생이 시험지를 찍어 올리면 여기에 쌓입니다." : "제출된 사진이 없습니다."}
                </td>
              </tr>
            )}
            {scans.map((s) => {
              const [cls, label] = STATUS[s.status] ?? ["badge-gray", s.status];
              const det = parseJSON<ItemDetection[]>(s.detections, []);
              const flagged = det.filter((d) => d.status === "multiple_marks" || d.status === "uncertain").length;
              const a = s.page?.print.attempt.assignment;
              return (
                <tr key={s.id} data-testid="scan-row" data-status={s.status}>
                  <td data-label="학생" className="font-medium">
                    {a ? (
                      <>
                        {a.student.name} <span className="muted text-[12px]">{a.student.classRoom?.name ?? ""}</span>
                      </>
                    ) : (
                      <span className="muted">누구인지 못 읽음</span>
                    )}
                  </td>
                  <td data-label="시험" className="text-[13px]">{a ? a.exam.title : s.fileName}</td>
                  <td data-label="페이지" className="text-[13px]">{s.page ? `${s.page.pageNo} / ${s.page.print.pages.length}` : "-"}</td>
                  <td data-label="판독" className="text-[13px]">
                    {det.length ? `${det.length}문항` : "-"}
                    {flagged > 0 && (
                      <span className="ml-1" style={{ color: "var(--accent)" }}>
                        · 확인 {flagged}
                      </span>
                    )}
                  </td>
                  <td data-label="상태">
                    <span className={cls}>{label}</span>
                    {s.source === "teacher" && <span className="badge-gray ml-1">선생님 업로드</span>}
                  </td>
                  <td data-label="제출" className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {fmtMDHM(s.createdAt)}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Link href={`/app/tests/scans/${s.id}`} className={s.status === "accepted" ? "btn-ghost btn-sm" : "btn-secondary btn-sm"} data-testid="scan-open">
                        {s.status === "accepted" ? "보기" : "대조 →"}
                      </Link>
                      {s.status !== "accepted" && (
                        <ActionButton action={rejectScanAction.bind(null, s.id)} className="btn-ghost btn-sm" confirm="이 사진을 제외할까요? 학생이 다시 찍어 올려야 합니다.">
                          제외
                        </ActionButton>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
