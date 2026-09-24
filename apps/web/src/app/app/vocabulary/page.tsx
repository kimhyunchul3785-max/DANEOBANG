import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, parseJSON } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { uploadDocumentAction, restoreBookAction, purgeBookAction } from "./actions";
import { UploadForm } from "./UploadForm";
import { ocrConfigured } from "@/lib/ocr";
import { CountUp } from "@/components/Motion";
import { MergeProvider, MergeCheck, MergeBar } from "./MergeSelect";
import { FolderBar, BookMenu } from "./Folders";
import { Icon } from "@/components/Icon";

const IMPORT_STATUS: Record<string, [string, string]> = {
  queued: ["badge-gray", "대기"],
  processing: ["badge-blue", "분석 중"],
  review: ["badge-amber", "확인 필요"],
  approved: ["badge-green", "저장됨"],
  failed: ["badge-red", "실패"],
};

/**
 * 단어장 목록 — 카드 전체가 링크. 태그(여러 개)로 거르고, ⋯ 메뉴에서 태그 체크 · 휴지통으로.
 * ?tag=<id> | none (예전 ?folder= 도 받음). 휴지통은 맨 아래 접힌 칸: 복원 · 영구 삭제.
 */
export default async function VocabularyPage({ searchParams }: { searchParams: Promise<{ tag?: string; folder?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const [allBooks, folderRows, imports] = await Promise.all([
    prisma.vocabBook.findMany({
      where: { academyId: ctx.member.academyId },
      include: { days: { orderBy: { dayNo: "asc" }, select: { dayNo: true, _count: { select: { words: true } } } }, tags: { select: { tagId: true } }, _count: { select: { words: true, exams: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.bookFolder.findMany({ where: { academyId: ctx.member.academyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.import.findMany({ where: { academyId: ctx.member.academyId }, include: { book: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const active = allBooks.filter((b) => b.status === "active");
  const archived = allBooks.filter((b) => b.status !== "active");
  const tagsOf = (b: (typeof allBooks)[number]) => b.tags.map((t) => t.tagId);
  const folders = folderRows.map((f) => ({ id: f.id, name: f.name, count: active.filter((b) => tagsOf(b).includes(f.id)).length }));
  const want = sp.tag ?? sp.folder;
  const current = want && (want === "none" || folders.some((f) => f.id === want)) ? want : null;
  const untagged = active.filter((b) => b.tags.length === 0);
  const books = current === "none" ? untagged : current ? active.filter((b) => tagsOf(b).includes(current)) : active;
  const totalWords = active.reduce((s, b) => s + b._count.words, 0);
  const dayLabel = (days: { dayNo: number }[]) => {
    if (!days.length) return "DAY 없음";
    const first = days[0].dayNo;
    const last = days[days.length - 1].dayNo;
    return first === 1 && last === days.length ? `${days.length}일` : `DAY ${first}–${last} · ${days.length}일`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">단어장</h1>
        </div>
        <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          <CountUp value={active.length} />권 · <CountUp value={totalWords} />단어
        </span>
      </header>

      <MergeProvider>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {(active.length > 0 || folders.length > 0) && <FolderBar folders={folders} current={current} total={active.length} noFolder={untagged.length} />}
          {active.length === 0 ? (
            <div className="card card-body">
              <div className="h3">아직 단어장이 없습니다</div>
            </div>
          ) : books.length === 0 ? (
            <div className="card card-body">
              <div className="h3">이 태그가 붙은 단어장이 없어요</div>
            </div>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]" data-testid="book-grid">
              {books.map((b) => {
                const max = Math.max(1, ...b.days.map((d) => d._count.words));
                const bookTags = folders.filter((f) => tagsOf(b).includes(f.id));
                return (
                  <div key={b.id} className="card card-body relative flex flex-col justify-between transition-shadow focus-within:z-30 hover:shadow-[0_0_0_1px_var(--line-2),0_4px_12px_rgba(27,26,24,0.06)]" data-testid="book-card" data-book={b.title}>
                    {/* 카드 전체가 링크 — 버튼들은 z-10 으로 위에 */}
                    <Link href={`/app/vocabulary/${b.id}`} className="absolute inset-0 rounded-[inherit]" aria-label={`${b.title} 열기`} data-testid="book-open" />
                    <div className="pointer-events-none">
                      <div className="flex items-start justify-between gap-2">
                        <span className="card-title">{b.title}</span>
                        <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>{b._count.words}단어</span>
                      </div>
                      <div className="muted mt-1">
                        {dayLabel(b.days)} · 시험 {b._count.exams} · {fmtDate(b.updatedAt, false)}
                        {b.level && ` · ${b.level}`}
                      </div>
                      {bookTags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1" data-testid="book-tags">
                          {bookTags.map((t) => (
                            <span key={t.id} className="badge-gray">
                              #{t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative z-10 mt-4 flex items-center justify-between gap-2">
                      <Link href={`/app/vocabulary/${b.id}/new-test`} className="btn-secondary btn-sm">
                        시험 만들기
                      </Link>
                      <span className="flex items-center gap-1">
                        <MergeCheck id={b.id} title={b.title} />
                        <BookMenu bookId={b.id} title={b.title} tagIds={tagsOf(b)} folders={folders} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {archived.length > 0 && (
            <details className="card card-body" data-testid="archived-books">
              <summary className="lbl flex cursor-pointer items-center gap-1.5">
                <Icon name="trash" size={15} />
                휴지통 {archived.length}
              </summary>
              <ul className="mt-2">
                {archived.map((b) => (
                  <li key={b.id} className="row" data-testid="trash-book" data-book={b.title}>
                    <span className="min-w-0 truncate text-[14px]">
                      {b.title}
                      <span className="ml-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                        {b._count.words}단어 · 시험 {b._count.exams}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <ActionButton action={restoreBookAction.bind(null, b.id)} className="btn-ghost btn-sm" testId="book-restore">
                        복원
                      </ActionButton>
                      <ActionButton
                        action={purgeBookAction.bind(null, b.id)}
                        className="btn-ghost btn-sm"
                        style={{ color: "var(--accent)" }}
                        confirm={b._count.exams ? `"${b.title}"과 이 단어장으로 만든 시험 ${b._count.exams}개, 그 성적까지 모두 지웁니다. 되돌릴 수 없어요.` : `"${b.title}"을 영구 삭제할까요? 되돌릴 수 없어요.`}
                        testId="book-purge"
                      >
                        영구 삭제
                      </ActionButton>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="card card-body">
            <div className="mb-2 flex items-center justify-between">
              <div className="lbl">업로드 이력</div>
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
                        <Link href={i.status === "approved" && i.bookId ? `/app/vocabulary/${i.bookId}` : `/app/vocabulary/imports/${i.id}`} className="block truncate text-[14px] hover:underline">
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
        <div className="space-y-4">
          <div className="card card-body upload-card anim-fade-up" data-testid="upload-card">
            <UploadForm
              action={uploadDocumentAction}
              books={active.map((b) => ({ id: b.id, title: b.title, words: b._count.words, days: b.days.length }))}
              ocr={ocrConfigured()}
              tip={
                <span className="tip" tabIndex={0} aria-label="업로드 안내">
                  <span className="tip-i" style={{ background: "var(--fill)", color: "var(--ink-3)" }}>
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
      <MergeBar />
      </MergeProvider>
    </div>
  );
}
