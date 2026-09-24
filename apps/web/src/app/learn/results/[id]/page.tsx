import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtMDHM } from "@/lib/util";
import { requireUser } from "@/lib/auth";
import { attemptResultForStudent, ApiError } from "@/lib/attempts";
import { notFound } from "next/navigation";
import { CountUp } from "@/components/Motion";
import { SpeakButton } from "@/components/Speak";

export default async function LearnResultPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const fromGrades = (await searchParams).from === "grades";
  let r;
  try {
    r = await attemptResultForStudent(id, user.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  // 미달이면 "다음에 뭘 하면 되는지": 이 응시의 재시험 상태
  const retake = r.score && !r.score.passed ? await prisma.retakeTask.findFirst({ where: { sourceAttemptId: id }, select: { status: true, dueAt: true, retakeExamId: true } }) : null;
  const wrongShown = r.wrongItems.slice(0, 5);
  const wrongMore = r.wrongItems.slice(5);
  return (
    <div className="learn-grid">
      <div className="col sticky">
      <Link href={fromGrades ? "/learn/grades" : "/learn"} className="sec-link inline-block px-1 py-1">
        ← {fromGrades ? "성적" : "이번 주"}
      </Link>
      <div className="card card-body" data-testid="result-card" data-score={r.score ? "shown" : r.scoreHidden ? "hidden" : "none"} data-answers={r.answersReleased ? "shown" : "hidden"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[14px] font-semibold">{r.examTitle}</div>
          {r.score && (
            <span className={r.score.passed ? "badge-green" : "badge-red"} data-testid="result-badge">
              {r.score.passed ? "통과" : "미달"}
            </span>
          )}
        </div>
        {r.status === "in_progress" ? (
          <p className="mt-6">아직 진행 중인 시험입니다.</p>
        ) : !r.graded ? (
          <p className="mt-6">채점 대기 중입니다.</p>
        ) : r.score ? (
          <div className="mt-4">
            <div className="flex items-baseline gap-1">
              <span className="num-xl" style={{ fontSize: 56, color: r.score.passed ? undefined : "var(--accent)" }}>
                <CountUp value={r.score.score} />
              </span>
              <span className="text-[16px] font-semibold" style={{ color: "var(--ink-3)" }}>
                점
              </span>
            </div>
            <div className="meter mt-3" aria-hidden>
              <i style={{ width: `${(r.score.correct / r.score.total) * 100}%`, background: r.score.passed ? "var(--ok)" : "var(--accent)" }} />
            </div>
            <div className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
              {r.score.correct} / {r.score.total} 맞음 · 통과 {r.score.passScore}점
            </div>
          </div>
        ) : (
          <div className="mt-6" data-testid="score-hidden">
            <div className="text-[18px] font-semibold">점수는 선생님이 공개한 뒤 보여요</div>
            <p className="muted mt-1">이 시험은 "점수: 선생님이 공개한 뒤"로 설정돼 있어요. 공개되면 알림으로 알려드려요.</p>
          </div>
        )}
        {r.graded && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3" data-testid="policy-chips">
            <span className="badge-gray" style={{ fontWeight: 500 }}>
              점수 · {r.policy.score === "immediate" ? "제출 직후 공개" : r.policy.released ? "선생님이 공개함" : "선생님 공개 전"}
            </span>
            <span className="badge-gray" style={{ fontWeight: 500 }}>
              정답·오답노트 · {r.policy.answers === "immediate" ? "제출 직후 공개" : r.policy.released ? "선생님이 공개함" : "선생님 공개 전"}
            </span>
          </div>
        )}
      </div>
      {r.score && !r.score.passed && (
        <section className="card card-body" data-testid="next-step">
          <div className="lbl">다음에 할 일</div>
          <div className="mt-2 text-[15px] font-semibold">
            {retake?.retakeExamId ? `재시험이 나왔어요${retake.dueAt ? ` · ${fmtMDHM(retake.dueAt)}까지` : ""}` : retake?.status === "cancelled" ? "선생님이 이 시험은 재시험 없이 마쳤어요" : "선생님이 재시험을 준비하고 있어요"}
          </div>
          <p className="muted mt-1">{retake?.retakeExamId ? "재시험 탭에서 바로 칠 수 있어요." : "나오면 알림으로 알려드려요. 그동안 아래 오답으로 연습해 두세요."}</p>
          <Link href="/learn/retake" className="btn-secondary mt-3 w-full py-3">
            재시험 탭 →
          </Link>
        </section>
      )}
      </div>
      <div className="col">
      {r.graded && (
        <section className="card card-body" data-testid="review-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="lbl">오답 확인</div>
            {r.answersReleased && <span className="digital">틀림 {r.wrongItems.length}</span>}
          </div>
          {!r.answersReleased ? (
            <div data-testid="answers-hidden">
              <p className="text-[15px] font-semibold">정답과 오답노트는 선생님이 공개한 뒤 볼 수 있어요</p>
              <p className="muted mt-1">{r.score ? "점수는 위에서 바로 볼 수 있지만, 어떤 문제를 틀렸는지는 공개 뒤에 보여요." : "점수와 정답 모두 선생님이 공개한 뒤에 보여요."}</p>
            </div>
          ) : r.wrongItems.length === 0 ? (
            <p className="muted">틀린 문항이 없습니다.</p>
          ) : (
            <>
              {!r.score && <p className="muted mb-2">점수는 아직 공개 전이지만, 틀린 단어는 바로 복습할 수 있어요.</p>}
              <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
                <Link href={`/learn/practice/${id}`} className="btn-primary py-3" data-testid="practice-link">
                  틀린 단어 연습 · 무작위
                </Link>
                <a className="btn-secondary py-3" href={`/api/files/wrong-note/${id}?scope=attempt`} target="_blank" rel="noopener" title="새 탭에서 열림">
                  PDF ↗
                </a>
              </div>
              <p className="muted mb-1" style={{ fontSize: 11.5 }}>
                연습은 나만 보는 개인 학습입니다. 선생님 화면에는 표시되지 않습니다.
              </p>
              {(() => {
                const Item = ({ w }: { w: (typeof r.wrongItems)[number] }) => (
                  <li className="py-3" style={{ borderTop: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="num-md">{w.prompt}</div>
                      <SpeakButton text={w.prompt} size={30} />
                    </div>
                    <ul className="mt-2 space-y-1 text-[13.5px]">
                      {w.options.map((o, i) => (
                        <li key={i} className={o.correct ? "font-medium" : o.chosen ? "line-through" : ""} style={{ color: o.correct ? "var(--ok)" : o.chosen ? "var(--accent)" : "var(--ink-2)" }}>
                          <span className="lbl mr-2">{i + 1}</span>
                          {o.text}
                          {o.chosen && !o.correct && <span className="lbl ml-2">내 답</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
                return (
                  <>
                    <ul>
                      {wrongShown.map((w) => (
                        <Item key={w.position} w={w} />
                      ))}
                    </ul>
                    {wrongMore.length > 0 && (
                      <details className="mt-1" data-testid="wrong-more">
                        <summary className="btn-ghost btn-sm cursor-pointer">나머지 {wrongMore.length}개 더 보기</summary>
                        <ul>
                          {wrongMore.map((w) => (
                            <Item key={w.position} w={w} />
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
