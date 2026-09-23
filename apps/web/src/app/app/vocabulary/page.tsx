import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { uploadDocumentAction, archiveBookAction } from "./actions";
import { UploadForm } from "./UploadForm";
import { ocrConfigured } from "@/lib/ocr";
import { CountUp } from "@/components/Motion";

const IMPORT_STATUS: Record<string, [string, string]> = {
  queued: ["badge-gray", "대기"],
  processing: ["badge-blue", "분석 중"],
  review: ["badge-amber", "확인 필요"],
  approved: ["badge-green", "저장됨"],
  failed: ["badge-red", "실패"],
};

export default async function VocabularyPage() {
  const ctx = await requireAcademy();
  const books = await prisma.vocabBook.findMany({
    where: { academyId: ctx.member.academyId },
    include: { days: { orderBy: { dayNo: "asc" }, select: { dayNo: true, _count: { select: { words: true } } } }, _count: { select: { words: true, exams: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  const imports = await prisma.import.findMany({
    where: { academyId: ctx.member.academyId },
    include: { book: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const active = books.filter((b) => b.status === "active");
  const totalWords = active.reduce((s, b) => s + b._count.words, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Words · 단어장</div>
          <h1 className="h1 mt-1">단어장</h1>
        </div>
        <span className="digital">
          <CountUp value={active.length} /> BOOKS · <CountUp value={totalWords} /> WORDS
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {books.length === 0 ? (
            <div className="card card-body">
              <div className="h3">아직 단어장이 없습니다</div>
              <p className="muted mt-1">업로드 카드에 HWPX·DOCX·PDF 파일(또는 사진)을 올리면 분석 후 단어장이 자동으로 만들어집니다.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {books.map((b) => {
                const max = Math.max(1, ...b.days.map((d) => d._count.words));
                return (
                  <div key={b.id} className={`card card-body flex flex-col justify-between ${b.status !== "active" ? "opacity-50" : ""}`}>
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/app/vocabulary/${b.id}`} className="card-title hover:underline">
                          {b.title}
                        </Link>
                        <span className="digital shrink-0">{b._count.words} W</span>
                      </div>
                      <div className="muted mt-1">
                        DAY {b.days.length} · 시험 {b._count.exams} · {fmtDate(b.updatedAt, false)}
                        {b.level && ` · ${b.level}`}
                      </div>
                      <div className="mt-3 flex items-end gap-[3px]" style={{ height: 28 }} aria-hidden>
                        {b.days.slice(0, 40).map((d) => (
                          <div key={d.dayNo} className="w-[5px] rounded-full anim-grow-y" style={{ height: `${Math.max(12, (d._count.words / max) * 100)}%`, background: "var(--ink)", animationDelay: `${d.dayNo * 30}ms` }} title={`DAY ${d.dayNo}: ${d._count.words}`} />
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Link href={`/app/tests/new?bookId=${b.id}`} className="btn-primary btn-sm">
                        시험 만들기
                      </Link>
                      <span className="flex gap-1">
                        <Link href={`/app/vocabulary/${b.id}`} className="btn-ghost btn-sm">
                          열기
                        </Link>
                        <ActionButton action={archiveBookAction.bind(null, b.id)} className="btn-ghost btn-sm">
                          {b.status === "active" ? "보관" : "복원"}
                        </ActionButton>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <section className="card card-body">
            <div className="mb-2 flex items-center justify-between">
              <div className="lbl">Uploads · 업로드 이력</div>
              <span className="digital">{imports.length}</span>
            </div>
            {imports.length === 0 ? (
              <p className="muted">업로드한 파일이 없습니다.</p>
            ) : (
              <ul>
                {imports.map((i) => {
                  const [cls, label] = IMPORT_STATUS[i.status] ?? ["badge-gray", i.status];
                  const warnings = parseJSON<string[]>(i.warnings, []);
                  const meta = parseJSON<{ words?: number; days?: number }>(i.meta, {});
                  return (
                    <li key={i.id} className="row">
                      <div className="min-w-0">
                        <Link href={i.status === "approved" && i.bookId ? `/app/vocabulary/${i.bookId}` : `/app/imports/${i.id}`} className="block truncate text-[14px] hover:underline">
                          {i.fileName}
                        </Link>
                        <div className="muted text-[12px]">
                          {i.fileType.toUpperCase()} · {fmtDate(i.createdAt)}
                          {i.book && ` · ${i.book.title}`}
                          {meta.words !== undefined && ` · ${meta.words}단어 · DAY ${meta.days}`}
                          {i.status === "failed" && warnings[0] && <span style={{ color: "var(--accent)" }}> · {warnings[0]}</span>}
                        </div>
                      </div>
                      <span className={cls}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* 휴대폰·태블릿에서는 업로드(주 동작)가 목록보다 먼저 */}
        <div className="order-first space-y-4 lg:order-none">
          <div className="card-accent card-body anim-fade-up" data-testid="upload-card">
            <UploadForm
              action={uploadDocumentAction}
              books={active.map((b) => ({ id: b.id, title: b.title, words: b._count.words, days: b.days.length }))}
              ocr={ocrConfigured()}
              tip={
                <span className="tip" tabIndex={0} aria-label="업로드 안내">
                  <span className="tip-i" style={{ background: "rgba(255,244,240,0.25)", color: "#fff4f0" }}>
                    i
                  </span>
                  <span className="tip-box" role="tooltip">
                    <b>HWPX · DOCX · PDF · 사진(여러 장)</b>
                    <br />
                    번호형 단어장(001 / 표제어 / 품사 뜻)과 DAY·표 양식을 자동으로 읽어 단어장을 만듭니다.
                    <br />
                    사진을 여러 장 고르면 OCR(OpenAI, 병렬)로 읽고, 사진을 합친 스캔 PDF 도 자동으로 알아봐 OCR 로 읽습니다{ocrConfigured() ? "" : " (.env 에 OPENAI_API_KEY 필요)"}.
                    <br />
                    DAY 표기가 있으면 그대로, 없으면 기본 7일로 나눕니다 (단어장 화면에서 직접 다시 나눌 수 있음).
                    <br />
                    <span style={{ color: "rgba(236,233,227,0.6)" }}>.hwp 는 한글에서 HWPX 로 다시 저장해 주세요. 최대 50MB.</span>
                  </span>
                </span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
