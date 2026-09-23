import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { attemptResultForStudent, ApiError } from "@/lib/attempts";
import { notFound } from "next/navigation";
import { Ring } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { SpeakButton } from "@/components/Speak";

export default async function LearnResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let r;
  try {
    r = await attemptResultForStudent(id, user.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="learn-grid">
      <div className="col sticky">
      <Link href="/learn/grades" className="lbl-ink inline-block px-1">
        ← Grades
      </Link>
      <div className={`${r.score?.passed ? "card-dark" : r.score ? "card-accent" : "card"} card-body min-h-[220px]`}>
        <div className="flex items-start justify-between">
          <div className="lbl" style={{ color: r.score ? "rgba(255,244,240,0.7)" : undefined }}>
            Result
          </div>
          {r.score && <span className="digital">{r.score.passed ? "PASS" : "RETAKE"}</span>}
        </div>
        <div className="mt-2 text-[14px]" style={{ opacity: 0.85 }}>
          {r.examTitle}
        </div>
        {r.status === "in_progress" ? (
          <p className="mt-6">아직 진행 중인 시험입니다.</p>
        ) : !r.graded ? (
          <p className="mt-6">채점 대기 중입니다.</p>
        ) : r.score ? (
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="num-xl">
                <CountUp value={r.score.score} />
              </div>
              <div className="lbl mt-2" style={{ color: "rgba(255,244,240,0.7)" }}>
                {r.score.correct} / {r.score.total} correct · pass {r.score.passScore}
              </div>
            </div>
            <Ring value={(r.score.correct / r.score.total) * 100} size={72} stroke={5} color="#fff4f0" track="rgba(255,244,240,0.25)" />
          </div>
        ) : (
          <p className="mt-6">점수는 선생님이 공개한 뒤 확인할 수 있습니다.</p>
        )}
      </div>
      </div>
      <div className="col">
      {r.graded && (
        <section className="card card-body">
          <div className="mb-3 flex items-center justify-between">
            <div className="lbl">Review</div>
            {r.answersReleased && <span className="digital">{r.wrongItems.length} WRONG</span>}
          </div>
          {!r.answersReleased ? (
            <p className="muted">정답과 오답노트는 선생님이 공개한 뒤 볼 수 있습니다.</p>
          ) : r.wrongItems.length === 0 ? (
            <p className="muted">틀린 문항이 없습니다.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
                <Link href={`/learn/practice/${id}`} className="btn-primary py-3" data-testid="practice-link">
                  틀린 단어 연습 · random
                </Link>
                <a className="btn-secondary py-3" href={`/api/files/wrong-note/${id}?scope=attempt`} target="_blank">
                  PDF
                </a>
              </div>
              <p className="muted mb-1" style={{ fontSize: 11.5 }}>
                연습은 나만 보는 개인 학습입니다. 선생님 화면에는 표시되지 않습니다.
              </p>
              <ul>
                {r.wrongItems.map((w) => (
                  <li key={w.position} className="py-3" style={{ borderTop: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="num-md">{w.prompt}</div>
                      <SpeakButton text={w.prompt} size={30} />
                    </div>
                    <ul className="mt-2 space-y-1 text-[13.5px]">
                      {w.options.map((o, i) => (
                        <li key={i} className={o.correct ? "font-medium" : o.chosen ? "line-through" : ""} style={{ color: o.correct ? "var(--ok)" : o.chosen ? "var(--accent)" : "var(--ink-2)" }}>
                          <span className="lbl mr-2">{i + 1}</span>
                          {o.text}
                          {o.chosen && !o.correct && <span className="lbl ml-2">mine</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
