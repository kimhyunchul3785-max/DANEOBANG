import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { listStudentAssignments } from "@/lib/attempts";
import { listStudentScans } from "@/lib/paper";
import { fmtMDHM } from "@/lib/util";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitPhoto } from "@/app/q/[token]/SubmitPhoto";

const STATUS: Record<string, [string, string]> = {
  queued: ["badge-amber", "채점 대기"],
  processing: ["badge-amber", "채점 중"],
  needs_review: ["badge-amber", "확인 중"],
  accepted: ["badge-green", "확정"],
  unrecognized: ["badge-red", "인식 실패"],
  failed: ["badge-red", "실패"],
};

/** 종이 시험 제출: 사진 찍어 제출 → 채점 중 → 결과. 시간 제한 없음 */
export default async function PaperPage() {
  const { user, student } = await requireStudent();
  const [list, scans] = await Promise.all([listStudentAssignments(user.id, student.id), listStudentScans(user.id, student.id)]);
  const paperOpen = list.filter((a) => a.mode === "paper" && a.status !== "completed" && a.status !== "expired");
  const processing = scans.some((s) => s.status === "queued" || s.status === "processing");
  return (
    <div className="learn-grid">
      <div className="col">
      {processing && <AutoRefresh ms={2500} />}
      <div className="flex items-end justify-between px-1">
        <div>
          <Link href="/learn" className="lbl hover:underline">
            ← 이번 주
          </Link>
          <div className="mt-1 text-[15px] font-semibold">종이 시험 · 사진 찍어 제출</div>
        </div>
        <span className="digital">{String(paperOpen.length).padStart(2, "0")} 장</span>
      </div>

      <div className="card-accent card-body anim-fade-up">
        <div className="lbl-on">사진 채점</div>
        <div className="mt-2 text-[18px] font-semibold leading-tight">다 풀었으면 사진을 찍어 올리세요</div>
        <p className="mt-1 text-[12.5px]" style={{ color: "rgba(255,244,240,0.85)" }}>
          QR로 시험을 알아보고 바로 채점합니다 · 시간 제한 없음
        </p>
        <div className="mt-4 [&_.btn-accent]:bg-[#fff4f0] [&_.btn-accent]:text-[var(--accent)] [&_.muted]:text-[rgba(255,244,240,0.8)]">
          <SubmitPhoto />
        </div>
      </div>

      {paperOpen.length > 0 && (
        <section className="card card-body">
          <div className="lbl mb-1">진행 중인 종이 시험</div>
          <ul>
            {paperOpen.map((a) => (
              <li key={a.assignmentId} className="row">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{a.exam.title}</div>
                  <div className="lbl mt-0.5">
                    {a.exam.questionCount}문항 · 통과 {a.exam.passScore}점
                  </div>
                </div>
                <span className="badge-gray">PAPER</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      </div>

      <div className="col">
      <section className="card card-body">
        <div className="mb-1 flex items-center justify-between">
          <div className="lbl">제출 기록</div>
          <span className="digital">{scans.length}</span>
        </div>
        {scans.length === 0 && <p className="muted">아직 제출한 사진이 없습니다.</p>}
        <ul>
          {scans.map((s) => {
            const [cls, label] = STATUS[s.status] ?? ["badge-gray", s.status];
            const graded = s.attemptStatus === "graded" && s.score !== null;
            return (
              <li key={s.id} className="row">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{s.examTitle ?? "시험지 미확인"}</div>
                  <div className="lbl mt-0.5">
                    {fmtMDHM(s.createdAt)}
                    {s.pageNo ? ` · p${s.pageNo}` : ""}
                  </div>
                  {s.status === "unrecognized" && s.note && (
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--accent)" }}>
                      {s.note.split("\n")[0]}
                    </div>
                  )}
                </div>
                {graded && s.attemptId ? (
                  <Link href={`/learn/results/${s.attemptId}`} className="flex items-center gap-2">
                    {s.score !== null ? (
                      <>
                        <span className="num-md">{s.score}</span>
                        <span className={s.passed ? "badge-green" : "badge-red"}>{s.passed ? "통과" : "미달"}</span>
                      </>
                    ) : (
                      <span className="badge-gray">채점 완료 · 점수 공개 전</span>
                    )}
                  </Link>
                ) : (
                  <span className={cls}>{label}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      </div>
    </div>
  );
}
