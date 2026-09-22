import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findPrintPage } from "@/lib/paper";
import { parseJSON, fmtMDHM } from "@/lib/util";
import { Logo } from "@/components/Logo";
import { Ring } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PasswordGate } from "./PasswordGate";
import { SubmitPhoto } from "./SubmitPhoto";
import { qrCookieName, qrCookieValue } from "./actions";

/**
 * 시험지 QR 을 찍으면 오는 화면.
 * 비밀번호(학생 계정) 확인 → 채점 전이면 사진 제출, 채점 중이면 대기, 끝났으면 점수·통과 여부·틀린 문항.
 */
export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await findPrintPage(token);
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[420px] px-4 pb-12 pt-6">
      <div className="mb-4 flex items-center justify-between px-1">
        <Logo height={20} />
        <span className="digital">PAPER · QR</span>
      </div>
      {children}
    </main>
  );
  if (!page) {
    return shell(
      <div className="card card-body">
        <div className="lbl" style={{ color: "var(--accent)" }}>
          Not found
        </div>
        <div className="mt-2 text-[16px] font-semibold">등록되지 않은 시험지입니다</div>
        <p className="muted mt-1">QR 이 훼손되었거나 재발급된 시험지일 수 있습니다. 선생님에게 문의하세요.</p>
      </div>,
    );
  }
  const attempt = page.print.attempt;
  const student = attempt.assignment.student;
  const exam = attempt.assignment.exam;
  // 본인 확인: 로그인한 본인이거나, 비밀번호 확인 쿠키
  const user = await getCurrentUser();
  const c = await cookies();
  const cookieOk = c.get(await qrCookieName(token))?.value === (await qrCookieValue(token));
  const isSelf = !!user && user.id === student.userId;
  if (!isSelf && !cookieOk) {
    return shell(
      <>
        <div className="card-dark card-body mb-3">
          <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
            Paper test
          </div>
          <div className="mt-1 text-[17px] font-semibold">{exam.title}</div>
          <div className="mt-1 text-[12px]" style={{ color: "rgba(236,233,227,0.7)" }}>
            {page.pageNo}/{page.print.pages.length} 페이지 · 통과 {exam.passScore}점
          </div>
        </div>
        <PasswordGate token={token} studentName={student.name.length > 2 ? `${student.name[0]}○${student.name.slice(-1)}` : student.name} />
        {!user && (
          <p className="muted mt-3 text-center">
            <Link href={`/login?next=/q/${token}`} className="underline">
              단어방에 로그인
            </Link>
            해도 됩니다.
          </p>
        )}
      </>,
    );
  }

  const grade = attempt.grades[0];
  const scans = await prisma.scanUpload.findMany({ where: { pageId: { in: page.print.pages.map((p) => p.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, pageId: true, createdAt: true, reviewNotes: true } });
  const processing = scans.some((s) => s.status === "queued" || s.status === "processing");
  const acceptedPages = new Set(scans.filter((s) => s.status === "accepted").map((s) => s.pageId));
  const missing = page.print.pages.filter((p) => !acceptedPages.has(p.id)).map((p) => p.pageNo);
  const lastFail = scans.find((s) => s.status === "unrecognized" || s.status === "failed");

  if (grade) {
    const showAnswers = exam.answerVisibility === "immediate" || exam.answersReleased;
    const results = parseJSON<{ itemId: string; optionId: string | null; correct: boolean }[]>(grade.itemResults, []);
    const wrongIds = results.filter((r) => !r.correct).map((r) => r.itemId);
    const wrongItems = showAnswers && wrongIds.length ? await prisma.formItem.findMany({ where: { id: { in: wrongIds } }, include: { options: true, word: { select: { meaning: true } } }, orderBy: { position: "asc" } }) : [];
    return shell(
      <>
        <div className={`${grade.passed ? "card-dark" : "card-accent"} card-body anim-fade-up`}>
          <div className="flex items-start justify-between">
            <div className="lbl" style={{ color: grade.passed ? "rgba(236,233,227,0.55)" : "rgba(255,244,240,0.8)" }}>
              {grade.passed ? "Passed" : "Retake"} · {student.name}
            </div>
            <Ring value={(grade.correctCount / grade.totalCount) * 100} size={64} stroke={5} color={grade.passed ? "#ece9e3" : "#fff4f0"} track={grade.passed ? "rgba(236,233,227,0.2)" : "rgba(255,244,240,0.25)"} />
          </div>
          <div className="num-xl mt-2">
            <CountUp value={Math.round(grade.score)} />
          </div>
          <div className="mt-1 text-[13px]" style={{ color: grade.passed ? "rgba(236,233,227,0.8)" : "rgba(255,244,240,0.9)" }}>
            {exam.title} · {grade.correctCount}/{grade.totalCount} · 통과 {exam.passScore}점 · {grade.passed ? "통과했습니다" : "재시험 대상입니다"}
          </div>
        </div>
        <section className="card card-body mt-3">
          <div className="flex items-center justify-between">
            <div className="lbl">Wrong · 틀린 문항</div>
            <span className={wrongIds.length ? "badge-red" : "badge-green"}>{wrongIds.length}</span>
          </div>
          {wrongIds.length === 0 ? (
            <p className="muted mt-2">틀린 문항이 없습니다.</p>
          ) : !showAnswers ? (
            <p className="muted mt-2">{wrongIds.length}문항을 틀렸습니다. 정답은 선생님이 공개한 뒤 여기와 학생 앱에서 볼 수 있습니다.</p>
          ) : (
            <ul className="mt-1">
              {wrongItems.map((it) => {
                const chosen = results.find((r) => r.itemId === it.id)?.optionId;
                const correct = it.options.find((o) => o.isCorrect);
                const mine = it.options.find((o) => o.id === chosen);
                return (
                  <li key={it.id} className="row">
                    <div>
                      <div className="text-[15px] font-semibold">
                        <span className="digital mr-2" style={{ color: "var(--ink-3)" }}>
                          {it.position}
                        </span>
                        {it.prompt}
                      </div>
                      <div className="text-[12px]" style={{ color: "var(--ink-2)" }}>
                        정답 {correct?.text} · 내 답 {mine ? mine.text : <span style={{ color: "var(--accent)" }}>무응답</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {isSelf ? (
          <Link href={`/learn/results/${attempt.id}`} className="btn-primary mt-3 w-full py-3">
            학생 앱에서 자세히 보기
          </Link>
        ) : (
          <Link href={`/login?next=/learn/results/${attempt.id}`} className="btn-secondary mt-3 w-full py-3">
            로그인해서 내 성적 보기
          </Link>
        )}
      </>,
    );
  }

  return shell(
    <>
      {processing && <AutoRefresh ms={2500} />}
      <div className="card-dark card-body">
        <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
          Paper test · {student.name}
        </div>
        <div className="mt-1 text-[17px] font-semibold">{exam.title}</div>
        <div className="mt-1 text-[12px]" style={{ color: "rgba(236,233,227,0.7)" }}>
          {page.print.pages.length}페이지 · 통과 {exam.passScore}점 · 종이 시험은 시간 제한이 없습니다
        </div>
      </div>
      {processing ? (
        <div className="card-accent card-body mt-3 text-center anim-fade-up" data-testid="grading">
          <div className="digital-lg">GRADING…</div>
          <div className="mt-2 text-[14px] font-semibold">채점 중입니다</div>
          <p className="mt-1 text-[12px]" style={{ color: "rgba(255,244,240,0.85)" }}>
            보통 10초 안에 끝납니다. 끝나면 이 화면과 학생 앱 알림에 점수가 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="card card-body mt-3 anim-fade-up">
          <div className="lbl">Submit · 사진 제출</div>
          <div className="mt-1 text-[15px] font-semibold">{missing.length === page.print.pages.length ? "시험을 다 풀었으면 사진을 찍어 제출하세요" : `${missing.join(", ")}페이지 사진이 더 필요합니다`}</div>
          {lastFail && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--accent)" }}>
              지난 제출: {lastFail.reviewNotes ?? "인식 실패"} · {fmtMDHM(lastFail.createdAt)}
            </p>
          )}
          <div className="mt-3">
            <SubmitPhoto token={token} />
          </div>
        </div>
      )}
      <p className="muted mt-3 text-center">채점은 자동으로 확정되고 선생님이 결과 화면에서 정정할 수 있습니다.</p>
    </>,
  );
}
