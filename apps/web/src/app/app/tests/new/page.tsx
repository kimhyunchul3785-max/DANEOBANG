import Link from "next/link";
import { requireAcademy } from "@/lib/auth";
import { NewExamForm } from "./NewExamForm";
import { loadComposeBooks, loadComposeClasses } from "./data";

/**
 * 시험 탭 → [+ 시험 만들기]: 단어장 선택부터 한 단계씩 (1 단어장 → 2 범위 → 3 대상 → 4 조건 → 5 이름·공개).
 * 단어장에서 들어오는 출제는 /app/vocabulary/[bookId]/new-test (단어장 고정).
 */
export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ bookId?: string; day?: string; days?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const [books, classes] = await Promise.all([loadComposeBooks(ctx), loadComposeClasses(ctx)]);
  const defaultDays = (sp.days ?? sp.day ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => n > 0);
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <Link href="/app/tests" className="kicker hover:underline">
          ← 시험
        </Link>
        <h1 className="h1 mt-1">시험 만들기</h1>
      </header>
      {books.length === 0 ? (
        <div className="card card-body">
          단어장이 없습니다.{" "}
          <Link href="/app/vocabulary" className="underline">
            단어장 탭에서 파일을 먼저 올려 주세요.
          </Link>
        </div>
      ) : (
        <NewExamForm mode="wizard" books={books} defaultBookId={sp.bookId} defaultDays={defaultDays} classes={classes} isOwner={ctx.isOwner} />
      )}
    </div>
  );
}
