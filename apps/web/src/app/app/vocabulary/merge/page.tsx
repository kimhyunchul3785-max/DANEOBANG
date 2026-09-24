import Link from "next/link";
import { requireAcademy } from "@/lib/auth";
import { previewMerge } from "@/lib/merge-books";
import { MergeForm } from "./MergeForm";

/** 단어장 병합 — 단어장 목록의 자식. ?ids=a,b,c (순서 = 우선순위) */
export default async function MergeBooksPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const ids = [...new Set((sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  const { books, kept, dropped } = ids.length >= 2 ? await previewMerge(ctx.member.academyId, ids) : { books: [], kept: [], dropped: [] };
  return (
    <div className="mx-auto max-w-4xl" data-testid="merge-page">
      <header className="mb-5">
        <Link href="/app/vocabulary" className="kicker hover:underline">
          ← 단어장
        </Link>
        <h1 className="h1 mt-1">단어장 병합</h1>
      </header>
      {books.length < 2 ? (
        <div className="card card-body">
          단어장을 2개 이상 고르세요.{" "}
          <Link href="/app/vocabulary" className="underline">
            단어장 목록에서 카드를 체크
          </Link>
          하면 아래에 병합 버튼이 나타납니다.
        </div>
      ) : (
        <MergeForm
          books={books.map((b) => ({ id: b.id, title: b.title, words: b._count.words, days: b.days.length }))}
          kept={kept.length}
          dropped={dropped}
          sampleDropped={dropped.slice(0, 24).map((d) => d.english)}
        />
      )}
    </div>
  );
}
