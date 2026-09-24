import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAcademy } from "@/lib/auth";
import { NewExamForm } from "@/app/app/tests/new/NewExamForm";
import { loadComposeBooks, loadComposeClasses } from "@/app/app/tests/new/data";

/**
 * 단어장 상세 → [이 단어장으로 시험 만들기]: 단어장은 정해져 있고 바꿀 수 없다. 범위 → 대상 → 조건 → 이름·공개 한 화면.
 * 부모는 단어장 상세. 출제가 끝나면 만들어진 시험(시험 탭의 상세)으로 간다.
 */
export default async function BookNewTestPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ day?: string; days?: string }> }) {
  const ctx = await requireAcademy();
  const { bookId } = await params;
  const sp = await searchParams;
  const [books, classes] = await Promise.all([loadComposeBooks(ctx, bookId), loadComposeClasses(ctx)]);
  const book = books[0];
  if (!book) notFound();
  const defaultDays = (sp.days ?? sp.day ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => n > 0);
  return (
    <div className="mx-auto max-w-6xl" data-testid="book-new-test">
      <header className="mb-5">
        <Link href={`/app/vocabulary/${book.id}`} className="kicker hover:underline">
          ← {book.title}
        </Link>
        <h1 className="h1 mt-1">시험 만들기</h1>
      </header>
      <NewExamForm mode="locked" books={books} defaultBookId={book.id} defaultDays={defaultDays} classes={classes} isOwner={ctx.isOwner} />
    </div>
  );
}
