import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { parseJSON, fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { retryImportAction } from "../../vocabulary/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GoTo } from "./GoTo";

/** 업로드 상태 화면: 분석 중 → 자동 저장되면 단어장으로 이동, 실패하면 원인·재시도 */
export default async function ImportStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const imp = await prisma.import.findFirst({ where: { id, academyId: ctx.member.academyId }, include: { book: true, _count: { select: { rows: true } } } });
  if (!imp) notFound();
  const warnings = parseJSON<string[]>(imp.warnings, []);
  const meta = parseJSON<{ pages?: number; profile?: string; words?: number; days?: number; dayMode?: string; sections?: number; skipped?: number }>(imp.meta, {});
  const busy = imp.status === "queued" || imp.status === "processing";
  const job = await prisma.job.findFirst({ where: { type: "import", resourceId: imp.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto max-w-3xl">
      {busy && <AutoRefresh ms={1500} />}
      {imp.status === "approved" && imp.bookId && <GoTo href={`/app/vocabulary/${imp.bookId}?from=import`} />}
      <div className="mb-5">
        <Link href="/app/vocabulary" className="kicker hover:underline">
          ← Words · 단어장
        </Link>
        <h1 className="h1 mt-1 break-all">{imp.fileName}</h1>
        <p className="muted mt-1">
          {imp.fileType.toUpperCase()} · {(imp.fileSize / 1024).toFixed(0)}KB · {fmtDate(imp.createdAt)}
        </p>
      </div>

      {busy && (
        <div className="card-dark card-body flex items-center gap-4">
          <span className="digital-lg">…</span>
          <div>
            <div className="text-[15px] font-semibold">분석 중</div>
            <div className="text-[13px]" style={{ color: "rgba(236,233,227,0.7)" }}>
              문서를 읽고 단어장을 만들고 있습니다. 끝나면 자동으로 이동합니다.
            </div>
          </div>
        </div>
      )}

      {imp.status === "approved" && (
        <div className="card-accent card-body">
          <div className="lbl-on">Saved</div>
          <div className="mt-2 text-[20px] font-semibold">{imp.book?.title}</div>
          <div className="mt-1 text-[13px]" style={{ color: "rgba(255,244,240,0.85)" }}>
            {meta.words ?? imp._count.rows}단어 · DAY {meta.days} ({meta.dayMode === "doc" ? "문서 DAY 표기" : "기본 7일 균등"})
            {meta.sections ? ` · 지문 ${meta.sections}` : ""}
            {meta.skipped ? ` · 중복 ${meta.skipped} 제외` : ""}
          </div>
          <Link href={`/app/vocabulary/${imp.bookId}`} className="btn-primary mt-4" style={{ background: "#fff4f0", color: "var(--accent)" }}>
            단어장 열기
          </Link>
        </div>
      )}

      {imp.status === "failed" && (
        <div className="card card-body">
          <div className="lbl" style={{ color: "var(--accent)" }}>
            Failed · {imp.errorCode}
          </div>
          <ul className="mt-2 space-y-1 text-[14px]">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <ActionButton action={retryImportAction.bind(null, imp.id)} className="btn-primary">
              다시 분석
            </ActionButton>
            <span className="muted">파일을 고쳐 다시 올리거나 다른 형식(HWPX·DOCX)으로 저장해 보세요.</span>
          </div>
          {job?.status === "failed" && <p className="muted mt-2">job {job.attempts}회 시도 · {job.error}</p>}
        </div>
      )}

      {!busy && warnings.length > 0 && imp.status !== "failed" && (
        <div className="card card-body mt-4 text-[13px]">
          <div className="lbl mb-1">Notes</div>
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
