import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { practiceSetForAttempt } from "@/lib/practice";
import { PracticeRunner } from "../PracticeRunner";

/** 시험 한 개의 틀린 단어만 모아 연습. 본인 응시가 아니면 404 처럼 보인다. 기록은 남기지 않는다. */
export default async function PracticeAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { user, student } = await requireStudent();
  const { attemptId } = await params;
  const set = await practiceSetForAttempt(attemptId, user.id, student.id);
  if (!set) {
    return (
      <div className="space-y-3">
        <Link href={`/learn/results/${attemptId}`} className="lbl-ink inline-block px-1">
          ← Result
        </Link>
        <div className="card card-body">
          <div className="lbl">Practice</div>
          <p className="muted mt-2">정답이 공개된 뒤 연습할 수 있습니다.</p>
        </div>
      </div>
    );
  }
  return <PracticeRunner title={set.title} words={set.words} meaningPool={set.meaningPool} englishPool={set.englishPool} backHref={`/learn/results/${attemptId}`} backLabel="Result" />;
}
