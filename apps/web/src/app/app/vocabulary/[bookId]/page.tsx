import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { parseJSON, fmtDate } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
import { ActionBar } from "@/components/ActionBar";
import { toggleWordExcludedAction, deleteWordAction } from "../actions";
import { WordEditor } from "./WordEditor";
import { DaySplitPanel } from "./DaySplitPanel";
import { TitleEditor } from "./TitleEditor";

export default async function BookPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ day?: string; from?: string }> }) {
  const ctx = await requireAcademy();
  const { bookId } = await params;
  const sp = await searchParams;
  const book = await prisma.vocabBook.findFirst({
    where: { id: bookId, academyId: ctx.member.academyId },
    include: {
      days: { orderBy: { dayNo: "asc" }, include: { _count: { select: { words: true } } } },
      imports: { where: { status: "approved" }, orderBy: { createdAt: "desc" }, take: 1, include: { rows: { select: { dayNo: true }, take: 1, where: { dayNo: { not: null } } } } },
      _count: { select: { exams: true, words: true } },
    },
  });
  if (!book) notFound();
  const allWords = await prisma.word.findMany({ where: { bookId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, section: true, dayId: true } });
  const selectedDay = sp.day ? book.days.find((d) => d.dayNo === Number(sp.day)) : book.days[0];
  const words = selectedDay ? await prisma.word.findMany({ where: { dayId: selectedDay.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }) : [];
  const imp = book.imports[0];
  const meta = imp ? parseJSON<{ pages?: number; profile?: string; sections?: number; dayMode?: string; docDayRows?: number }>(imp.meta, {}) : {};
  const sections = new Set(allWords.map((w) => w.section).filter(Boolean)).size;
  const fromImport = sp.from === "import";
  // 이 단어장으로 만든 시험 (최근순) — 범위 DAY · 대상 수 · 완료 수 · 평균
  const exams = await prisma.exam.findMany({
    where: { bookId: book.id, academyId: ctx.member.academyId },
    include: { scopes: true, assignments: { select: { status: true, attempts: { where: { attemptNo: 1 }, select: { grades: { where: { current: true }, select: { score: true } } } } } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const dayNoById = new Map(book.days.map((d) => [d.id, d.dayNo]));
  const examRow = (e: (typeof exams)[number]) => {
    const nos = e.scopes.map((sc) => dayNoById.get(sc.dayId) ?? 0).filter(Boolean).sort((a, b) => a - b);
    const range = nos.length === 0 ? "" : nos.length === 1 ? `DAY ${nos[0]}` : nos.every((n, i) => i === 0 || n === nos[i - 1] + 1) ? `DAY ${nos[0]}–${nos[nos.length - 1]}` : `DAY ${nos.join(",")}`;
    const done = e.assignments.filter((a) => a.status === "completed").length;
    const scores = e.assignments.flatMap((a) => a.attempts.flatMap((t) => t.grades.map((g) => g.score)));
    const avg = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
    return (
      <li key={e.id} className="row">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">
            {e.title}
            {e.isRetake && <span className="badge-amber ml-1">재시험</span>}
          </div>
          <div className="lbl mt-0.5">
            {range} · {e.questionCount}Q · {fmtDate(e.createdAt, false).slice(5)} · {e.status === "published" ? "발행" : e.status === "draft" ? "초안" : e.status}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {e.assignments.length === 0 ? (
            <span className="badge-amber">대상 없음</span>
          ) : (
            <span className="digital">
              {done}/{e.assignments.length}
            </span>
          )}
          {avg !== null && (
            <span className="num-md" style={{ fontSize: 18, color: avg < 70 ? "var(--accent)" : undefined }}>
              {avg}
            </span>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <Link href="/app/vocabulary" className="kicker hover:underline">
          ← 단어장
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <TitleEditor bookId={book.id} title={book.title} level={book.level} />
          <span className="digital">
            {book._count.words}단어 · DAY {book.days.length}개 · 시험 {book._count.exams}개
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="DAY">
        {book.days.map((d) => (
          <Link key={d.id} href={`/app/vocabulary/${book.id}?day=${d.dayNo}`} role="tab" aria-selected={selectedDay?.id === d.id} data-day={d.dayNo} className={`chip${selectedDay?.id === d.id ? " on" : ""}`}>
            {d.label.split(" · ")[0]}
            <span className="chip-sub">{d._count.words}</span>
          </Link>
        ))}
        {book.days.length === 0 && <span className="muted">단어가 없습니다.</span>}
      </div>

      <section className="card mt-3">
        <div className="card-body">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="h3">{selectedDay ? selectedDay.label : "DAY를 선택하세요"}</div>
              <div className="muted">{words.length}단어 · 수정은 기록으로 남고 발행된 시험에는 영향이 없습니다.</div>
            </div>
          </div>
          <table className="tbl tbl-cards">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>영어</th>
                <th className="hidden w-16 sm:table-cell">품사</th>
                <th>뜻</th>
                <th className="w-40" title="보기(오답 선택지)로 쓰지 않는 단어">유의어 · 보기에서 뺌</th>
                <th className="w-28">원문</th>
                <th className="w-40"></th>
              </tr>
            </thead>
            <tbody>
              {words.map((w, i) => (
                <WordEditor key={w.id} index={i + 1} word={{ id: w.id, english: w.english, pos: w.pos, meaning: w.meaning, synonyms: w.synonyms, section: w.section, excluded: w.excluded, revision: w.revision }}>
                  <ActionButton action={toggleWordExcludedAction.bind(null, w.id)} className="btn-ghost btn-sm">
                    {w.excluded ? "출제 포함" : "출제 제외"}
                  </ActionButton>
                  <ActionButton action={deleteWordAction.bind(null, w.id)} className="btn-ghost btn-sm" confirm="이 단어를 삭제할까요?">
                    삭제
                  </ActionButton>
                </WordEditor>
              ))}
              {words.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: "var(--ink-3)" }}>
                    단어가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 원본 정보 · DAY 다시 나누기 — 자주 쓰지 않는 (그리고 되돌리기 어려운) 작업이라 단어 목록 아래에 접어 둔다. 방금 올렸거나 병합했으면 펼친 채로 */}
      <details className="mt-4" open={fromImport || sp.from === "merge"} data-testid="book-tools">
        <summary className="btn-ghost btn-sm cursor-pointer">원본 정보 · DAY 다시 나누기 ▾</summary>
        <div className="mt-3">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card card-body lg:col-span-2">
          <div className="lbl">원본</div>
          {imp ? (
            <>
              <div className="card-title mt-2 break-all">{imp.fileName}</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <div className="num-md">{book._count.words}</div>
                  <div className="lbl mt-1">단어</div>
                </div>
                <div>
                  <div className="num-md">{sections || meta.sections || 0}</div>
                  <div className="lbl mt-1">지문·구획</div>
                </div>
                <div>
                  <div className="num-md">{meta.docDayRows ?? 0}</div>
                  <div className="lbl mt-1">문서 DAY 표기</div>
                </div>
              </div>
              <p className="muted mt-4">
                {imp.fileType.toUpperCase()}
                {meta.pages ? ` · ${meta.pages}쪽` : ""} · {meta.profile === "numbered" ? "번호형 항목으로 읽음" : "표·한 줄 형식으로 읽음"}
              </p>
            </>
          ) : sp.from === "merge" ? (
            <>
              <div className="card-title mt-2" data-testid="merge-done">병합으로 만든 단어장</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="num-md">{book._count.words}</div>
                  <div className="lbl mt-1">단어 (중복 제거 후)</div>
                </div>
                <div>
                  <div className="num-md">{book.days.length}</div>
                  <div className="lbl mt-1">DAY</div>
                </div>
              </div>
            </>
          ) : (
            null
          )}
        </div>
        <div className="lg:col-span-3">
          <DaySplitPanel bookId={book.id} items={allWords.map((w) => ({ section: w.section }))} hasDocDays={!!imp && imp.rows.length > 0} currentDays={book.days.length} highlight={fromImport} />
        </div>
      </div>

        </div>
      </details>

      {/* 이 단어장으로 만든 시험 */}
      <section className="card mt-4" data-testid="book-exams">
        <div className="card-body">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="lbl">이 단어장으로 만든 시험 (요약)</div>
            <Link href={`/app/tests?bookId=${book.id}`} className="lbl-ink hover:underline" data-testid="book-tests-link">
              → 시험 탭에서 열기
            </Link>
          </div>
          {exams.length === 0 ? (
            <p className="muted">아직 없습니다.</p>
          ) : (
            <>
              <ul className="grid gap-1 sm:grid-cols-2">{exams.slice(0, 8).map(examRow)}</ul>
              {exams.length > 8 && (
                <details className="mt-2">
                  <summary className="lbl cursor-pointer hover:underline">이전 시험 {exams.length - 8}개 더 보기</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">{exams.slice(8).map(examRow)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      </section>

      {/* 다음 한 걸음: 이 단어장으로 출제 (보고 있던 DAY 가 미리 선택된다). 단어장은 고정 */}
      <ActionBar testId="book-bar" note={`${book.title} · ${book._count.words}단어 · DAY ${book.days.length}${selectedDay ? ` · 지금 보는 ${selectedDay.label.split(" · ")[0]}` : ""}`}>
        <Link href={`/app/vocabulary/${book.id}/new-test${selectedDay ? `?day=${selectedDay.dayNo}` : ""}`} className="btn-primary" data-testid="book-new-test">
          이 단어장으로 시험 만들기 →
        </Link>
      </ActionBar>
    </div>
  );
}
