import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, fmtMD, fmtMDHM, parseJSON } from "@/lib/util";
import { ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Sparkline } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel } from "@/lib/stats";
import { updateStudentAction } from "../actions";
import { StudentTools } from "./StudentTools";
import { WeakWords } from "./WeakWords";
import { DueBox } from "../../retakes/RetakeCreate";

/** 학생 상세: 12주 추이 · 반복 오답 → 재시험 즉시 출제 · 재시험 현황(마감) · 시험 이력 · 계정/담당 */
export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAcademy();
  const { id } = await params;
  const student = await prisma.student.findFirst({
    where: { id, ...studentScope(ctx) },
    include: {
      classRoom: true,
      user: { select: { id: true, name: true, email: true } },
      teachers: { include: { member: { include: { user: { select: { name: true } } } } } },
      linkRequests: { where: { status: "pending" }, orderBy: { createdAt: "desc" } },
      assignments: { include: { exam: true, attempts: { include: { grades: { where: { current: true } } }, orderBy: { attemptNo: "asc" } } }, orderBy: { createdAt: "desc" } },
      retakes: { include: { sourceAttempt: { include: { assignment: { include: { exam: true } } } } }, orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] },
    },
  });
  if (!student) notFound();
  const [classes, members, linkUsers] = await Promise.all([
    prisma.classRoom.findMany({ where: { academyId: ctx.member.academyId, archived: false }, orderBy: { name: "asc" } }),
    ctx.isOwner ? prisma.academyMember.findMany({ where: { academyId: ctx.member.academyId, status: "active" }, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
    prisma.user.findMany({ where: { id: { in: student.linkRequests.map((r) => r.userId) } }, select: { id: true, name: true, email: true } }),
  ]);

  const weeks = recentWeeks(12);
  const grades = await loadGrades(ctx.member.academyId, { id: student.id });
  const first = grades.filter((g) => !g.isRetake);
  const recent = first.filter((g) => g.at >= weeks[0]);
  const series = weeklySeries(recent, weeks);
  const passLine = student.assignments.length ? Math.round(student.assignments.reduce((s, a) => s + a.exam.passScore, 0) / student.assignments.length) : 90;
  const openRetakes = student.retakes.filter((r) => r.status === "pending" || r.status === "issued");
  const stat = { avg: avg(recent.map((g) => g.score)), pass: rate(recent.filter((g) => g.passed).length, recent.length), retake: openRetakes.length };

  // 반복 오답: 채점 결과의 오답 문항 → 단어
  const gradedAttemptIds = grades.map((g) => g.attemptId);
  const revs = await prisma.gradeRevision.findMany({ where: { current: true, attemptId: { in: gradedAttemptIds } }, select: { itemResults: true } });
  const wrongItemIds = revs.flatMap((r) => parseJSON<{ itemId: string; correct: boolean }[]>(r.itemResults, []).filter((x) => !x.correct).map((x) => x.itemId));
  const wrongItems = wrongItemIds.length ? await prisma.formItem.findMany({ where: { id: { in: [...new Set(wrongItemIds)] } }, include: { word: { include: { day: true } } } }) : [];
  const weakMap = new Map<string, { wordId: string; english: string; meaning: string; day: string; count: number }>();
  for (const itemId of wrongItemIds) {
    const it = wrongItems.find((x) => x.id === itemId);
    if (!it) continue;
    const e = weakMap.get(it.wordId) ?? { wordId: it.wordId, english: it.word.english, meaning: it.word.meaning, day: it.word.day.label, count: 0 };
    e.count++;
    weakMap.set(it.wordId, e);
  }
  const weak = [...weakMap.values()].filter((w) => !wrongItems.find((x) => x.wordId === w.wordId)?.word.excluded).sort((a, b) => b.count - a.count || a.english.localeCompare(b.english)).slice(0, 12);
  // 재시험 현황: 출제된 것(마감 순) 먼저, 그다음 출제 전
  const retakeExamIds = openRetakes.map((r) => r.retakeExamId).filter((x): x is string => !!x);
  const retakeAsg = retakeExamIds.length ? await prisma.assignment.findMany({ where: { examId: { in: retakeExamIds }, studentId: student.id }, select: { examId: true, status: true, dueAt: true, attempts: { orderBy: { attemptNo: "desc" }, take: 1, select: { id: true, status: true, grades: { where: { current: true }, select: { score: true, passed: true } } } } } }) : [];
  const retakeRows = openRetakes
    .map((r) => {
      const a = retakeAsg.find((x) => x.examId === r.retakeExamId);
      const g = a?.attempts[0]?.grades[0];
      return { r, a, g, title: r.sourceAttempt?.assignment.exam.title ?? "반복 오답 재시험", due: a?.dueAt ?? r.dueAt ?? null };
    })
    .sort((x, y) => Number(!x.a) - Number(!y.a) || (x.due?.getTime() ?? Infinity) - (y.due?.getTime() ?? Infinity));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app/students" className="kicker hover:underline">
            ← Students · {student.classRoom?.name ?? "반 없음"}
          </Link>
          <h1 className="h1 mt-1">{student.name}</h1>
          <p className="muted">
            {student.school ?? ""} {student.grade ?? ""} · 담당 {student.teachers.map((t) => t.member.user.name).join(", ") || "-"} · {student.user ? "계정 연결됨" : "오프라인 명단"}
          </p>
        </div>
        <span className="digital">ID {student.id.slice(-6).toUpperCase()}</span>
      </div>

      <div className="bento">
        {/* 추이 */}
        <section className="card span-6 card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="lbl">Trend · 12주 점수 추이 (첫 응시)</div>
              <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
                점선 = 통과 기준 {passLine} · 빨간 점 = 미달
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <div className="num-lg">
                  <CountUp value={stat.avg} placeholder="–" />
                </div>
                <div className="lbl mt-1">AVG 12W</div>
              </div>
              <div className="text-right">
                <div className="num-lg">
                  <CountUp value={stat.pass} suffix="%" placeholder="–" />
                </div>
                <div className="lbl mt-1">PASS</div>
              </div>
              <div className="text-right">
                <div className="num-lg" style={stat.retake ? { color: "var(--accent)" } : undefined}>
                  <CountUp value={stat.retake} />
                </div>
                <div className="lbl mt-1">RETAKE</div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Sparkline values={series} baseline={passLine} accentBelow={passLine} labels={weeks.map(weekLabel)} height={110} width={800} />
          </div>
          <div className="mt-1 flex justify-between">
            {weeks.map((w, i) => (
              <span key={i} className="lbl" style={{ fontSize: 9 }}>
                {weekLabel(w)}
              </span>
            ))}
          </div>
        </section>

        {/* 반복 오답 */}
        <section className="card span-2 card-body flex flex-col">
          <div className="flex items-center justify-between">
            <div className="lbl">Weak words · 반복 오답</div>
            <span className={weak.length ? "badge-red" : "badge-gray"}>{weak.length}</span>
          </div>
          <WeakWords studentId={student.id} words={weak} />
        </section>

        {/* 재시험 현황 */}
        <section className={`${retakeRows.length ? "card-accent" : "card"} span-2 card-body flex flex-col`} data-testid="student-retakes">
          <div className="flex items-center justify-between">
            <div className={retakeRows.length ? "lbl-on" : "lbl"}>Retake · 재시험 {retakeRows.length ? `${retakeRows.length}건` : ""}</div>
            <Link href="/app/retakes" className={`${retakeRows.length ? "lbl-on" : "lbl-ink"} hover:underline`}>
              재시험 화면 →
            </Link>
          </div>
          {retakeRows.length === 0 ? (
            <p className="muted mt-3">진행 중인 재시험이 없습니다. 통과 기준에 못 미치면 자동으로 생기고, 위 반복 오답으로 직접 낼 수도 있습니다.</p>
          ) : (
            <ul className="mt-2 flex-1">
              {retakeRows.slice(0, 5).map(({ r, a, g, title, due }) => (
                <li key={r.id} className="py-2" style={{ borderTop: "1px solid rgba(255,244,240,0.25)" }}>
                  <div className="truncate text-[14px] font-semibold">{title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "rgba(255,244,240,0.9)" }}>
                    {!a ? (
                      <span className="badge-amber">출제 전 · 재시험 화면에서 범위·마감을 정해 내세요</span>
                    ) : g ? (
                      <span className={g.passed ? "badge-green" : "badge-red"}>
                        {g.passed ? "통과" : "미달"} · {Math.round(g.score)}점
                      </span>
                    ) : (
                      <>
                        <span>{due ? `${fmtMDHM(due)}까지` : "마감 없음"} · {a.status === "in_progress" ? "응시 중" : "응시 대기"}</span>
                        <span className="[&_.btn-secondary]:bg-[#fff4f0] [&_.btn-secondary]:text-[var(--accent)]">
                          <DueBox taskId={r.id} dueAt={due?.toISOString() ?? null} />
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 이력 */}
        <section className="card span-2 card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">History</div>
            <span className="digital">{student.assignments.length}</span>
          </div>
          <ul className="mt-1">
            {student.assignments.length === 0 && <li className="muted py-2">배정된 시험이 없습니다.</li>}
            {student.assignments.slice(0, 8).map((a) => {
              const t = a.attempts[a.attempts.length - 1];
              const g = t?.grades[0];
              return (
                <li key={a.id} className="row">
                  <div className="min-w-0">
                    <Link href={`/app/tests/${a.examId}`} className="block truncate text-[13.5px] hover:underline">
                      {a.exam.title}
                    </Link>
                    <div className="muted text-[12px]">
                      {t ? `${fmtDate(t.submittedAt ?? t.startedAt, false).slice(5)} · ${t.mode === "online" ? "온라인" : "종이"}` : a.dueAt ? `기한 ${fmtDate(a.dueAt, false).slice(5)}` : "배정"}
                      {g && ` · ${g.correctCount}/${g.totalCount}`}
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    {g ? (
                      <>
                        <Link href={`/app/results/${t.id}`} className="num-md hover:underline" style={{ fontSize: 20 }}>
                          {Math.round(g.score)}
                        </Link>
                        <span className={g.passed ? "badge-green" : "badge-red"}>{g.passed ? "PASS" : "RETAKE"}</span>
                      </>
                    ) : (
                      <StatusBadge s={t?.status ?? a.status} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {student.assignments.length > 8 && (
            <Link href={`/app/results?student=${student.id}`} className="lbl-ink mt-2 inline-block">
              All →
            </Link>
          )}
        </section>

        {/* 정보 · 계정 · 담당 */}
        <section className="card span-3 card-body">
          <div className="lbl mb-2">Profile · 정보</div>
          <ActionForm action={updateStudentAction} className="space-y-2" resetOnSuccess={false}>
            <input type="hidden" name="id" value={student.id} />
            <input className="input" name="name" defaultValue={student.name} required />
            <div className="flex gap-2">
              <input className="input" name="school" defaultValue={student.school ?? ""} placeholder="학교" />
              <input className="input" name="grade" defaultValue={student.grade ?? ""} placeholder="학년" />
            </div>
            <div className="flex gap-2">
              <input className="input" name="phone" inputMode="tel" defaultValue={student.phone ?? ""} placeholder="휴대폰 (인증번호 발송)" />
              <input className="input" name="email" type="email" defaultValue={student.email ?? ""} placeholder="이메일 (선택)" />
            </div>
            <select className="input" name="classId" defaultValue={student.classId ?? ""}>
              <option value="">반 없음</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <textarea className="input" name="memo" rows={2} defaultValue={student.memo ?? ""} placeholder="메모" />
            <select className="input" name="status" defaultValue={student.status}>
              <option value="active">활성</option>
              <option value="inactive">비활성 (기록 유지)</option>
            </select>
            <button className="btn-primary">저장</button>
          </ActionForm>
        </section>
        <div className="span-3 space-y-4">
          <StudentTools
            student={{ id: student.id, name: student.name, email: student.email, phone: student.phone, userId: student.userId, userEmail: student.user?.email ?? null, hasInvite: !!student.inviteTokenHash, inviteExpiresAt: student.inviteExpiresAt?.toISOString() ?? null, inviteSentAt: student.inviteSentAt?.toISOString() ?? null, codeSent: !!student.phoneCodeHash && (!student.phoneCodeExpiresAt || student.phoneCodeExpiresAt > new Date()), codeExpiresAt: student.phoneCodeExpiresAt?.toISOString() ?? null }}
            linkRequests={student.linkRequests.map((r) => ({ id: r.id, user: linkUsers.find((u) => u.id === r.userId) ?? null, createdAt: r.createdAt.toISOString() }))}
            isOwner={ctx.isOwner}
            members={members.map((m) => ({ id: m.id, name: m.user.name, role: m.role }))}
            assignedMemberIds={student.teachers.map((t) => t.memberId)}
          />
        </div>
      </div>
    </div>
  );
}
