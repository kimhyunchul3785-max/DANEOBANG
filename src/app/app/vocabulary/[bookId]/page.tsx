import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { parseJSON } from "@/lib/util";
import { ActionButton } from "@/components/ActionForm";
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

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <Link href="/app/vocabulary" className="kicker hover:underline">
          ← Words · 단어장
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <TitleEditor bookId={book.id} title={book.title} level={book.level} />
          <div className="flex items-center gap-3">
            <span className="digital">
              {book._count.words} WORDS · {book.days.length} DAYS
            </span>
            <Link href={`/app/tests/new?bookId=${book.id}${selectedDay ? `&day=${selectedDay.dayNo}` : ""}`} className="btn-primary">
              {selectedDay ? `DAY ${selectedDay.dayNo} 시험 만들기` : "시험 만들기"}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card card-body lg:col-span-2">
          <div className="lbl">Source · 원본</div>
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
                {meta.pages ? ` · ${meta.pages}쪽` : ""} · {meta.profile === "numbered" ? "번호형 항목으로 읽음" : "표·한 줄 형식으로 읽음"} · 유의어·반의어·예문 줄은 보기 제외 후보로만 보관합니다. 잘못 읽힌 줄은 아래 목록에서 바로 수정·제외하세요.
              </p>
            </>
          ) : (
            <p className="muted mt-2">파일 업로드 없이 만들어진 단어장입니다.</p>
          )}
        </div>
        <div className="lg:col-span-3">
          <DaySplitPanel bookId={book.id} items={allWords.map((w) => ({ section: w.section }))} hasDocDays={!!imp && imp.rows.length > 0} currentDays={book.days.length} highlight={fromImport} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="DAY">
        {book.days.map((d) => (
          <Link key={d.id} href={`/app/vocabulary/${book.id}?day=${d.dayNo}`} role="tab" aria-selected={selectedDay?.id === d.id} className={`chip${selectedDay?.id === d.id ? " on" : ""}`}>
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
            {selectedDay && (
              <Link href={`/app/tests/new?bookId=${book.id}&day=${selectedDay.dayNo}`} className="btn-secondary btn-sm">
                이 DAY로 출제
              </Link>
            )}
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>영어</th>
                <th className="w-16">품사</th>
                <th>뜻</th>
                <th className="w-40">유의어 (보기 제외)</th>
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
    </div>
  );
}
