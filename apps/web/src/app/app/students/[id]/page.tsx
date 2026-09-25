import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { fmtDate, fmtMD, fmtMDHM, parseJSON } from "@/lib/util";
import { ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { TrendChart } from "@/components/Viz";
import { CountUp } from "@/components/Motion";
import { loadGrades, avg, rate, recentWeeks, weeklySeries, weekLabel, trendDelta } from "@/lib/stats";
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
      linkRequests: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, include: { student: { select: { id: true } } } },
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
  const delta = trendDelta(series);
  const nSeries = series.filter((v) => v !== null).length;
  const kDelta = nSeries >= 6 ? 3 : nSeries >= 4 ? 2 : 1;
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

  // 단어장 진도: 이 학생이 받은 시험(재시험 제외)의 범위 DAY → 통과 · 미달 · 배정만 · 안 함
  const progAsg = student.assignments.filter((a) => !a.exam.isRetake && a.exam.status !== "archived");
  const progExamIds = [...new Set(progAsg.map((a) => a.examId))];
  const [scopes, progDays] = progExamIds.length
    ? await Promise.all([
        prisma.examScope.findMany({ where: { examId: { in: progExamIds } }, select: { examId: true, dayId: true } }),
        prisma.bookDay.findMany({ where: { bookId: { in: [...new Set(progAsg.map((a) => a.exam.bookId))] }, book: { status: "active" } }, select: { id: true, bookId: true, dayNo: true, label: true, book: { select: { title: true } } }, orderBy: { dayNo: "asc" } }),
      ])
    : [[], []];
  const dayState = new Map<string, { s: "pass" | "fail" | "open"; at: number }>();
  const rank = { open: 0, fail: 1, pass: 2 } as const;
  for (const a of progAsg) {
    const gs = a.attempts.flatMap((x) => x.grades);
    const st: "pass" | "fail" | "open" = gs.some((g) => g.passed) ? "pass" : gs.length ? "fail" : "open";
    const at = a.attempts.reduce((m, x) => Math.max(m, x.submittedAt?.getTime() ?? 0), 0);
    for (const sc of scopes.filter((x) => x.examId === a.examId)) {
      const cur = dayState.get(sc.dayId);
      if (!cur || rank[st] > rank[cur.s]) dayState.set(sc.dayId, { s: st, at: Math.max(at, cur?.at ?? 0) });
      else cur.at = Math.max(cur.at, at);
    }
  }
  const progress = [...new Set(progDays.map((d) => d.bookId))].map((bookId) => {
    const days = progDays.filter((d) => d.bookId === bookId).map((d) => ({ ...d, st: dayState.get(d.id)?.s ?? null }));
    const tested = days.filter((d) => d.st === "pass" || d.st === "fail").length;
    const lastIdx = days.reduce((m, d, i) => (d.st ? i : m), -1);
    const next = days.slice(lastIdx + 1).find((d) => !d.st) ?? days.find((d) => !d.st) ?? null;
    return { bookId, title: days[0]?.book.title ?? "", days, tested, pct: days.length ? Math.round((tested / days.length) * 100) : 0, next };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app/students" className="kicker hover:underline">
            ← 학생 · {student.classRoom?.name ?? "반 없음"}
          </Link>
          <h1 className="h1 mt-1">{student.name}</h1>
          <p className="muted">
            {student.school ?? ""} {student.grade ?? ""} · 담당 {student.teachers.map((t) => t.member.user.name).join(", ") || "-"} · {student.user ? "계정 연결됨" : "오프라인 명단"}
          </p>
        </div>
      </div>

      {/* 숫자 세 개: 한 줄 (추이 카드 안에 크게 두지 않는다) */}
      <div className="kpis k3 mb-4" data-testid="student-kpis">
        <div>
          <span className="lbl">12주 평균</span>
          <span className="kpi-v">
            <CountUp value={stat.avg} placeholder="–" />
          </span>
          <span className="kpi-s">
            {delta !== null ? (
              <span title={`최근 ${kDelta}주 평균 − 직전 ${kDelta}주 평균`}>
                <b style={{ color: delta < 0 ? "var(--accent)" : "var(--ink-2)", fontWeight: 600 }}>{delta > 0 ? `+${delta}` : delta === 0 ? "±0" : delta}</b> 최근 {kDelta}주
              </span>
            ) : (
              <span className="hidden sm:inline">첫 응시 기준</span>
            )}
          </span>
        </div>
        <div>
          <span className="lbl">통과율</span>
          <span className="kpi-v">
            <CountUp value={stat.pass} suffix="%" placeholder="–" />
          </span>
          <span className="kpi-s hidden sm:block">기준 {passLine}점</span>
        </div>
        <div>
          <span className="lbl">재시험</span>
          <span className="kpi-v" style={stat.retake ? { color: "var(--warn)" } : undefined}>
            <CountUp value={stat.retake} />
          </span>
          <span className="kpi-s hidden sm:block">진행 중</span>
        </div>
      </div>

      {progress.length > 0 && (
        <section className="card card-body mb-4" data-testid="book-progress">
          <div className="sec-h mb-1">
            <h2 className="sec-t">단어장 진도</h2>
            <span className="prog-legend" aria-hidden>
              <i className="pc pass" />
              통과
              <i className="pc fail" />
              미달
              <i className="pc open" />
              배정
              <i className="pc" />안 함
            </span>
          </div>
          <ul>
            {progress.map((b) => (
              <li key={b.bookId} className="prog-row" data-testid="progress-row" data-book={b.title}>
                <div className="prog-head">
                  <Link href={`/app/vocabulary/${b.bookId}`} className="min-w-0 truncate font-semibold hover:underline">
                    {b.title}
                  </Link>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--ink-2)" }}>
                    {b.tested} / {b.days.length} DAY · <b style={{ color: "var(--ink)" }}>{b.pct}%</b>
                  </span>
                  <span className="prog-next" data-testid="progress-next">
                    {b.next ? (
                      <>
                        다음 <b>{b.next.label}</b>
                      </>
                    ) : (
                      "완료"
                    )}
                  </span>
                </div>
                <div className="meter mt-2" aria-hidden>
                  <i style={{ width: `${b.pct}%` }} />
                </div>
                <div className="prog-cells mt-2">
                  {b.days.map((d) => (
                    <span key={d.id} className={`pc${d.st ? ` ${d.st}` : ""}${b.next?.id === d.id ? " next" : ""}`} title={`${d.label} · ${d.st === "pass" ? "통과" : d.st === "fail" ? "미달" : d.st === "open" ? "배정됨" : "안 함"}`} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 휴대폰: 할 일(재시험·반복 오답) → 기록(이력·추이) → 정보 순서. 넓은 화면(xl): 왼쪽 기록 · 오른쪽 할 일과 정보 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-1">
            {/* 재시험 현황 */}
            {/* 재시험 출제는 재시험 탭 한 곳에서 — 여기서는 현황과 마감 변경, 그리고 이 학생으로 필터한 재시험 탭 링크 */}
            <section className="card card-body flex flex-col" data-testid="student-retakes">
              <div className="flex items-center justify-between">
                <div className="lbl">재시험 {retakeRows.length ? `${retakeRows.length}건` : ""}</div>
                {retakeRows.some((x) => !x.a) && (
                  <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                    출제 전 {retakeRows.filter((x) => !x.a).length}
                  </span>
                )}
              </div>
              {retakeRows.length === 0 ? (
                <p className="muted mt-1 text-[13px]">진행 중인 재시험 없음</p>
              ) : (
                <ul className="mt-2 flex-1">
                  {retakeRows.slice(0, 5).map(({ r, a, g, title, due }) => (
                    <li key={r.id} className="py-2" style={{ borderTop: "1px solid var(--line)" }}>
                      <div className="truncate text-[14px] font-semibold">{title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                        {!a ? (
                          <span className="badge-amber">출제 전</span>
                        ) : g ? (
                          <span className={g.passed ? "badge-green" : "badge-red"}>
                            {g.passed ? "통과" : "미달"} · {Math.round(g.score)}점
                          </span>
                        ) : (
                          <>
                            <span>{due ? `${fmtMDHM(due)}까지` : "마감 없음"} · {a.status === "in_progress" ? "응시 중" : "응시 대기"}</span>
                            <DueBox taskId={r.id} dueAt={due?.toISOString() ?? null} />
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {retakeRows.length > 0 && (
                <Link href={`/app/retakes?student=${student.id}`} className={`${retakeRows.some((x) => !x.a) ? "btn-accent" : "btn-secondary"} btn-sm mt-3 self-start`} data-testid="student-retake-link">
                  {retakeRows.some((x) => !x.a) ? "재시험 탭에서 이 학생 출제하기 →" : "재시험 탭에서 보기 →"}
                </Link>
              )}
            </section>

            {/* 반복 오답 */}
            <section className="card card-body flex flex-col">
              <div className="flex items-center justify-between">
                <div className="lbl">반복 오답</div>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: weak.length ? "var(--ink)" : "var(--ink-4)" }}>
                  {weak.length}
                </span>
              </div>
              <WeakWords studentId={student.id} words={weak} />
            </section>

        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
            {/* 점수 추이: 기록의 맨 위 — 숫자(위 KPI) 다음에 방향, 그다음 개별 시험 */}
            <section className="card card-body" data-testid="student-trend">
              <div className="sec-h mb-3">
                <h2 className="sec-t">12주 점수 추이</h2>
                <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  점선 통과 기준 {passLine}
                </span>
              </div>
              <TrendChart values={series} labels={weeks.map(weekLabel)} passLine={passLine} height={200} lastLabel="이번 주" ariaLabel={`${student.name} 주별 평균`} />
            </section>

            {/* 이력 */}
            <section className="card card-body">
              <div className="flex items-center justify-between">
                <div className="lbl">시험 이력</div>
                <span className="digital">{student.assignments.length}</span>
              </div>
              <ul className="mt-1">
                {student.assignments.length === 0 && <li className="muted py-2">배정된 시험이 없습니다.</li>}
                {student.assignments.slice(0, 8).map((a, i) => {
                  const t = a.attempts[a.attempts.length - 1];
                  const g = t?.grades[0];
                  return (
                    <li key={a.id} className={`row${i >= 5 ? " max-sm:hidden" : ""}`}>
                      <div className="min-w-0">
                        <span className="block truncate text-[13.5px]">{a.exam.title}</span>
                        <div className="muted text-[12px]">
                          {t ? `${fmtDate(t.submittedAt ?? t.startedAt, false).slice(5)} · ${t.mode === "online" ? "온라인" : "종이"}` : a.dueAt ? `기한 ${fmtDate(a.dueAt, false).slice(5)}` : "배정"}
                          {g && ` · ${g.correctCount}/${g.totalCount}`}
                        </div>
                      </div>
                      <span className="flex items-center gap-2">
                        {g ? (
                          <>
                            <span className="num-md" style={{ fontSize: 20 }}>
                              {Math.round(g.score)}
                            </span>
                            <span className={g.passed ? "badge-green" : "badge-red"}>{g.passed ? "통과" : "미달"}</span>
                          </>
                        ) : (
                          <StatusBadge s={t?.status ?? a.status} />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href={`/app/results?studentId=${student.id}#detail`} className="lbl-ink mt-2 inline-block" data-testid="student-results-link">
                → 성적 탭에서 응시 상세{student.assignments.length > 8 ? ` · 전체 ${student.assignments.length}건` : ""}
              </Link>
            </section>

        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-2">
            {/* 정보 · 계정 · 담당: 자주 바꾸지 않으므로 접어 둔다 */}
            <details className="card card-body group" data-testid="student-info">
              <summary className="sec-h cursor-pointer list-none">
                <h2 className="sec-t">학생 정보</h2>
                <span className="sec-link">
                  <span className="group-open:hidden">수정 ▾</span>
                  <span className="hidden group-open:inline">접기 ▴</span>
                </span>
              </summary>
              <div className="mt-3">
              <ActionForm action={updateStudentAction} className="space-y-2" resetOnSuccess={false}>
                <input type="hidden" name="id" value={student.id} />
                <input className="input" aria-label="이름" name="name" defaultValue={student.name} required />
                <div className="flex gap-2">
                  <input className="input" aria-label="학교" name="school" defaultValue={student.school ?? ""} placeholder="학교" />
                  <input className="input" aria-label="학년" name="grade" defaultValue={student.grade ?? ""} placeholder="학년" />
                </div>
                <div className="flex gap-2">
                  <input className="input" aria-label="휴대폰" name="phone" inputMode="tel" defaultValue={student.phone ?? ""} placeholder="휴대폰 (인증번호 발송)" />
                  <input className="input" aria-label="이메일" name="email" type="email" defaultValue={student.email ?? ""} placeholder="이메일 (선택)" />
                </div>
                <select className="input" aria-label="반" name="classId" defaultValue={student.classId ?? ""}>
                  <option value="">반 없음</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <textarea className="input" aria-label="메모" name="memo" rows={2} defaultValue={student.memo ?? ""} placeholder="메모" />
                <select className="input" aria-label="상태" name="status" defaultValue={student.status}>
                  <option value="active">활성</option>
                  <option value="inactive">비활성 (기록 유지)</option>
                </select>
                <button className="btn-primary">저장</button>
              </ActionForm>
              </div>
            </details>
            <div className="space-y-4">
              <StudentTools
                student={{ id: student.id, name: student.name, email: student.email, phone: student.phone, userId: student.userId, userEmail: student.user?.email ?? null, hasInvite: !!student.inviteTokenHash, inviteExpiresAt: student.inviteExpiresAt?.toISOString() ?? null, inviteSentAt: student.inviteSentAt?.toISOString() ?? null, codeSent: !!student.phoneCodeHash && (!student.phoneCodeExpiresAt || student.phoneCodeExpiresAt > new Date()), codeExpiresAt: student.phoneCodeExpiresAt?.toISOString() ?? null }}
                linkRequests={student.linkRequests.map((r) => ({ id: r.id, user: linkUsers.find((u) => u.id === r.userId) ?? null, createdAt: r.createdAt.toISOString(), name: r.name, className: classes.find((c) => c.id === r.classId)?.name ?? null }))}
                isOwner={ctx.isOwner}
                members={members.map((m) => ({ id: m.id, name: m.user.name, role: m.role }))}
                assignedMemberIds={student.teachers.map((t) => t.memberId)}
              />
            </div>
        </div>
      </div>
    </div>
  );
}
