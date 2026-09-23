import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { uploadScansAction, rejectScanAction } from "./actions";
import type { ItemDetection } from "@/lib/omr/analyze";

const STATUS: Record<string, [string, string]> = {
  queued: ["badge-gray", "대기"],
  processing: ["badge-blue", "판독 중"],
  needs_review: ["badge-amber", "검수 필요"],
  unrecognized: ["badge-red", "식별 실패"],
  accepted: ["badge-green", "확정"],
  failed: ["badge-gray", "제외"],
};

export default async function ScansPage() {
  const ctx = await requireAcademy();
  const scans = await prisma.scanUpload.findMany({
    where: { academyId: ctx.member.academyId, status: { not: "failed" } },
    include: { page: { include: { print: { include: { attempt: { include: { assignment: { include: { student: true, exam: true } } } }, pages: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const busy = scans.some((s) => s.status === "queued" || s.status === "processing");
  return (
    <div>
      {busy && <AutoRefresh ms={2500} />}
      <Link href="/app/tests" className="kicker hover:underline">
        ← Tests · 시험
      </Link>
      <h1 className="h1 mb-1 mt-1">사진 채점</h1>
      <p className="muted mb-4">학생이 마킹한 시험지를 촬영해 올리면 QR로 학생·페이지를 식별하고 마킹을 판독합니다. 판독 결과는 선생님이 확인·수정한 뒤 확정해야 성적에 반영됩니다.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>파일</th>
                <th>학생 · 시험</th>
                <th>페이지</th>
                <th>판독</th>
                <th>상태</th>
                <th>업로드</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400">
                    업로드한 사진이 없습니다.
                  </td>
                </tr>
              )}
              {scans.map((s) => {
                const [cls, label] = STATUS[s.status] ?? ["badge-gray", s.status];
                const det = parseJSON<ItemDetection[]>(s.detections, []);
                const flagged = det.filter((d) => d.status === "multiple_marks" || d.status === "uncertain").length;
                const a = s.page?.print.attempt.assignment;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/app/scans/${s.id}`} className="text-blue-700 hover:underline">
                        {s.fileName}
                      </Link>
                    </td>
                    <td className="text-xs">{a ? `${a.student.name} · ${a.exam.title}` : "-"}</td>
                    <td className="text-xs">{s.page ? `${s.page.pageNo} / ${s.page.print.pages.length}` : "-"}</td>
                    <td className="text-xs">{det.length ? `${det.length}문항${flagged ? ` · 확인 ${flagged}` : ""}` : "-"}</td>
                    <td>
                      <span className={cls}>{label}</span>
                      {s.source === "student" && (
                        <span className="badge-blue ml-1" title="학생이 앱·QR로 제출해 자동 확정된 사진">
                          학생 제출
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{fmtDate(s.createdAt)}</td>
                    <td className="text-right">
                      {s.status !== "accepted" && (
                        <ActionButton action={rejectScanAction.bind(null, s.id)} className="btn-ghost btn-sm text-red-600">
                          제외
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card card-body">
          <h2 className="h2 mb-2">사진 업로드</h2>
          <p className="muted mb-2">JPG · PNG · WebP, 장당 20MB. 시험지 네 모서리의 검은 사각형과 QR이 모두 나오게, 정면에서 밝게 촬영하세요. HEIC는 JPG로 변환해 올리세요.</p>
          <ActionForm action={uploadScansAction} className="space-y-2">
            <input className="input" type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple capture="environment" required />
            <button className="btn-primary w-full">업로드 · 판독</button>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
