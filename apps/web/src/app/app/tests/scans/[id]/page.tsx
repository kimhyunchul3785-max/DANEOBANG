import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { parseJSON, fmtDate } from "@/lib/util";
import { ActionForm } from "@/components/ActionForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import type { ItemDetection } from "@/lib/omr/analyze";
import type { PrintManifest } from "@/lib/omr/layout";
import { acceptScanAction, assignScanPageAction } from "../actions";
import { ScanReview } from "./ScanReview";
import { AcceptScanButton } from "./AcceptScanButton";

export default async function ScanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const scan = await prisma.scanUpload.findFirst({
    where: { id, academyId: ctx.member.academyId },
    include: { page: { include: { print: { include: { pages: true, attempt: { include: { assignment: { include: { student: true, exam: true, form: { include: { items: { include: { options: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } } } } } } } } } } } } },
  });
  if (!scan) notFound();
  const busy = scan.status === "queued" || scan.status === "processing";
  const det = parseJSON<ItemDetection[]>(scan.detections, []);
  const reviewed = parseJSON<Record<string, number | null>>(scan.reviewed, {});
  const a = scan.page?.print.attempt.assignment;
  const manifest = scan.page ? (JSON.parse(scan.page.print.manifest) as PrintManifest) : null;
  const pm = manifest?.pages.find((p) => p.pageNo === scan.page!.pageNo);
  // QR 실패 시 수동 지정용 후보: 진행 중 종이 응시의 페이지들
  const candidates = scan.status === "unrecognized"
    ? await prisma.printPage.findMany({
        where: { print: { status: "active", attempt: { status: { in: ["in_progress", "review"] }, mode: "paper", assignment: { exam: { academyId: ctx.member.academyId }, student: studentScope(ctx) } } } },
        include: { print: { include: { pages: true, attempt: { include: { assignment: { include: { student: true, exam: true } } } } } } },
        take: 300,
      })
    : [];
  const siblingStatus = scan.page
    ? await prisma.scanUpload.findMany({ where: { pageId: { in: scan.page.print.pages.map((p) => p.id) }, status: "accepted" }, select: { pageId: true } })
    : [];

  return (
    <div>
      {busy && <AutoRefresh ms={2000} />}
      <div className="mb-4">
        <Link href="/app/tests/scans" className="text-xs text-slate-500 hover:underline">
          ← 사진 채점
        </Link>
        <h1 className="h1">대조 · {a ? `${a.student.name} · ${a.exam.title}` : scan.fileName}</h1>
        <p className="muted">
          {fmtDate(scan.createdAt)} 제출
          {a && (
            <>
              {" "}
              · 페이지 {scan.page!.pageNo}/{scan.page!.print.pages.length} · 원본 사진과 판독 결과를 나란히 보고, 다르면 바로 고친 뒤 확정하세요
            </>
          )}
        </p>
      </div>

      {scan.reviewNotes && <div className="card card-body mb-4 whitespace-pre-line border-amber-200 bg-amber-50 text-sm text-amber-800">{scan.reviewNotes}</div>}
      {busy && <div className="card card-body mb-4 text-sm">판독 중입니다…</div>}

      {scan.status === "unrecognized" && (
        <div className="card card-body mb-4">
          <h2 className="h2 mb-2">학생·페이지 직접 지정</h2>
          <p className="muted mb-2">QR을 읽지 못한 경우 어떤 학생의 몇 페이지인지 지정하면 그 시험지 기준으로 다시 판독합니다. 기준점 4개는 여전히 검출되어야 합니다.</p>
          <ActionForm action={assignScanPageAction} className="flex gap-2">
            <input type="hidden" name="scanId" value={scan.id} />
            <select className="input" name="pageId" required defaultValue="">
              <option value="" disabled>
                선택…
              </option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.print.attempt.assignment.student.name} · {p.print.attempt.assignment.exam.title} · {p.pageNo}/{p.print.pages.length}p
                </option>
              ))}
            </select>
            <button className="btn-secondary whitespace-nowrap">재판독</button>
          </ActionForm>
          <div className="mt-3">
            <a className="btn-ghost btn-sm" href={`/api/files/scan/${scan.id}`} target="_blank">
              원본 사진 보기
            </a>
          </div>
        </div>
      )}

      {(scan.status === "needs_review" || scan.status === "accepted") && a && pm && (
        <ScanReview
          scanId={scan.id}
          accepted={scan.status === "accepted"}
          correctedUrl={scan.correctedPath ? `/api/files/scan-corrected/${scan.id}` : null}
          originalUrl={`/api/files/scan/${scan.id}`}
          detections={det}
          reviewed={reviewed}
          items={pm.items.map((it) => {
            const item = a.form.items.find((x) => x.id === it.itemId);
            return { position: it.position, prompt: item?.prompt ?? "?", options: item?.options.map((o) => ({ position: o.position, text: o.text })) ?? [], bubbles: it.bubbles };
          })}
          page={{ w: manifest!.page.w, h: manifest!.page.h }}
          acceptedPages={siblingStatus.map((s) => scan.page!.print.pages.find((p) => p.id === s.pageId)?.pageNo ?? 0)}
          totalPages={scan.page!.print.pages.length}
        >
          {scan.status !== "accepted" && <AcceptScanButton action={acceptScanAction.bind(null, scan.id)} />}
        </ScanReview>
      )}
    </div>
  );
}
