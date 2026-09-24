import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { fmtDate, fmtMDHM } from "@/lib/util";
import { Icon } from "@/components/Icon";
import { ActionButton } from "@/components/ActionForm";
import { DuePopover } from "@/components/DuePopover";
import { updateExamDueAction, trashExamAction, restoreExamAction, purgeExamAction } from "./actions";

type Filter = "open" | "done" | "draft" | "archived" | "all" | "overdue";
// "미완료" = 진행 중 · 시작 예약 · 출제 전(대상 없음). 마감 지난 시험은 "마감 지남" 에만. "archived" 는 v5.6 부터 휴지통
const FILTERS: [Filter, string][] = [
  ["open", "미완료"],
  ["overdue", "마감 지남"],
  ["done", "완료"],
  ["draft", "초안"],
  ["archived", "휴지통"],
  ["all", "전체"],
];
/** 시험 상태 (목록·배지용): 발행 상태에 배정 진행을 합쳐 한 단어로 */
type State = "draft" | "archived" | "none" | "scheduled" | "overdue" | "open" | "done";
const STATE_LABEL: Record<State, [string, string]> = {
  draft: ["badge-amber", "초안"],
  archived: ["badge-gray", "휴지통"],
  none: ["badge-amber", "출제 전"],
  scheduled: ["badge-blue", "시작 예약"],
  overdue: ["badge-red", "마감 지남"],
  open: ["badge-green", "진행 중"],
  done: ["badge-gray", "완료"],
};

export default async function TestsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; bookId?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const filter: Filter = (FILTERS.some(([k]) => k === sp.filter) ? sp.filter : sp.q || sp.bookId ? "all" : "open") as Filter;
  const q = (sp.q ?? "").trim();
  const book = sp.bookId ? await prisma.vocabBook.findFirst({ where: { id: sp.bookId, academyId: ctx.member.academyId }, select: { id: true, title: true } }) : null;
  const exams = await prisma.exam.findMany({
    where: {
      academyId: ctx.member.academyId,
      ...(q ? { title: { contains: q } } : {}),
      ...(book ? { bookId: book.id } : {}),
      ...(filter === "draft" ? { status: "draft" } : filter === "archived" ? { status: "archived" } : filter === "all" ? { status: { not: "archived" } } : { status: "published" }),
    },
    include: { book: { select: { title: true } }, scopes: true, _count: { select: { assignments: true } }, assignments: { select: { status: true, dueAt: true, startAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const dayLabels = await prisma.bookDay.findMany({ where: { id: { in: exams.flatMap((e) => e.scopes.map((s) => s.dayId)) } } });
  const labelOf = (id: string) => dayLabels.find((d) => d.id === id)?.label ?? "?";
  const now = Date.now();
  // 목록의 마감: 안 친 학생 기준 공통 마감 (모두 완료면 전체 기준). 학생마다 다르면 "여러"
  const dueOf = (as: { status: string; dueAt: Date | null; startAt: Date | null }[]) => {
    const base = as.some((a) => a.status !== "completed") ? as.filter((a) => a.status !== "completed") : as;
    const set = new Set(base.map((a) => a.dueAt?.getTime() ?? 0));
    if (!base.length) return null;
    if (set.size > 1) return "여러";
    const v = [...set][0];
    return v ? new Date(v) : "없음";
  };
  const startPendingOf = (as: { startAt: Date | null }[]) => as.length > 0 && as.every((a) => a.startAt && a.startAt.getTime() > now);
  const stateOf = (e: (typeof exams)[number]): State => {
    if (e.status === "draft") return "draft";
    if (e.status === "archived") return "archived";
    if (e.assignments.length === 0) return "none";
    if (startPendingOf(e.assignments)) return "scheduled";
    const open = e.assignments.filter((a) => a.status !== "completed");
    if (open.length === 0) return "done";
    if (open.some((a) => a.dueAt && a.dueAt.getTime() < now)) return "overdue";
    return "open";
  };
  // 기본 "진행 중" = 아직 끝나지 않은 것 전부 (진행 중 · 마감 지남 · 시작 예약 · 대상 없음). 완료된 지난 시험은 "완료"에서
  const list = exams.filter((e) => {
    const st = stateOf(e);
    if (filter === "open") return ["open", "scheduled", "none"].includes(st);
    if (filter === "overdue") return st === "overdue";
    if (filter === "done") return st === "done";
    return true;
  });
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ filter: filter === "open" ? undefined : filter, q: q || undefined, bookId: book?.id, ...patch })) if (v) p.set(k, v);
    return `/app/tests${p.toString() ? `?${p}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-6xl" data-width="wide">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">시험</h1>
          <p className="muted mt-1">
            {list.length}개{book ? ` · ${book.title}` : ""}{q ? ` · "${q}"` : ""}
          </p>
        </div>
        <Link href="/app/tests/new" className="btn-primary" data-testid="tests-new">
          + 시험 만들기
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="tests-filters">
        <div className="seg">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={link({ filter: k === "open" ? undefined : k })} className={`seg-item${filter === k ? " on" : ""}`} data-filter={k} style={k === "archived" ? { display: "inline-flex", alignItems: "center", gap: 5 } : undefined}>
              {k === "archived" && <Icon name="trash" size={14} />}
              {l}
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-center gap-1">
          {book && <input type="hidden" name="bookId" value={book.id} />}
          {filter !== "open" && <input type="hidden" name="filter" value={filter} />}
          <input className="input" name="q" placeholder="시험 이름 검색" defaultValue={q} style={{ padding: "7px 12px", width: 180 }} aria-label="시험 이름 검색" />
          {(q || book) && (
            <Link href="/app/tests" className="btn-ghost btn-sm">
              지우기
            </Link>
          )}
        </form>
        <Link href="/app/tests/scans" className="btn-ghost btn-sm" data-nav="/app/tests/scans">
          사진 채점 →
        </Link>
      </div>
      <div className="card">
        <table className="tbl tbl-cards">
          <thead>
            <tr>
              <th>시험</th>
              <th>단어장 · 범위</th>
              <th className="whitespace-nowrap">문항 · 통과</th>
              <th className="whitespace-nowrap">완료 / 배정</th>
              <th>상태</th>
              <th>마감</th>
              <th className="whitespace-nowrap">만든 날</th>
              <th className="w-px"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-400">
                  {filter === "open" && !q && !book ? "끝나지 않은 시험이 없습니다." : filter === "overdue" ? "마감이 지난 시험이 없습니다." : filter === "archived" ? "휴지통이 비어 있습니다." : "조건에 맞는 시험이 없습니다."}
                </td>
              </tr>
            )}
            {list.map((e) => {
              const st = stateOf(e);
              const [cls, label] = STATE_LABEL[st];
              return (
                <tr key={e.id} data-testid="exam-row" data-state={st} data-title={e.title}>
                  <td data-label="_title">
                    <span>
                      <Link href={`/app/tests/${e.id}`} className="font-medium hover:underline">
                        {e.title}
                      </Link>
                      {e.isRetake && <span className="badge-amber ml-1.5 align-middle">재시험</span>}
                    </span>
                  </td>
                  <td className="max-w-[260px] text-xs leading-relaxed text-slate-600" data-label="범위">
                    <span>
                      <span className="block truncate" title={e.book.title}>
                        {e.book.title}
                      </span>
                      {e.scopes.map((s) => labelOf(s.dayId)).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, ""))).join(", ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap" data-label="문항">
                    {e.questionCount}문항 · {e.passScore}점
                  </td>
                  <td className="whitespace-nowrap" data-label="완료">
                    {e._count.assignments === 0 ? <span className="muted">대상 없음</span> : `${e.assignments.filter((a) => a.status === "completed").length} / ${e._count.assignments}`}
                  </td>
                  <td data-label="상태">
                    <span className={cls}>{label}</span>
                  </td>
                  <td className="whitespace-nowrap text-xs" data-label="마감" style={{ color: "var(--ink-3)" }}>
                    {(() => {
                      const d = dueOf(e.assignments);
                      if (d === null) return "-";
                      const late = st === "overdue";
                      const days = d instanceof Date ? Math.ceil((d.getTime() - now) / 86400e3) : 0;
                      const text = d === "여러" || d === "없음" ? d : `${fmtMDHM(d)}${late ? " 지남" : st === "open" && days >= 0 ? ` · ${days === 0 ? "D-DAY" : `D-${days}`}` : ""}`;
                      // 끝나지 않은 발행 시험은 날짜를 누르면 바로 달력 (마감 지남 탭은 지난 학생만)
                      const editable = e.status === "published" && e.assignments.some((a) => a.status !== "completed");
                      if (!editable) return <span title={d instanceof Date ? fmtDate(d) : undefined}>{text}</span>;
                      return (
                        <DuePopover action={updateExamDueAction} fields={{ examId: e.id, scope: late ? "overdue" : "open" }} current={d instanceof Date ? d : null} question={late ? "마감기한을 늘릴까요?" : "마감 변경"} testId="due-edit">
                          <Icon name="calendar" />
                          <span style={late ? { color: "var(--accent)", fontWeight: 600 } : undefined}>{text}</span>
                        </DuePopover>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500" data-label="만든 날">{fmtDate(e.createdAt, false)}</td>
                  <td className="whitespace-nowrap text-right">
                    {e.status === "archived" ? (
                      <span className="inline-flex items-center gap-1">
                        <ActionButton action={restoreExamAction.bind(null, e.id)} className="btn-ghost btn-sm" testId="exam-restore">
                          복원
                        </ActionButton>
                        <ActionButton action={purgeExamAction.bind(null, e.id)} className="btn-ghost btn-sm" style={{ color: "var(--accent)" }} confirm={`"${e.title}"을 영구 삭제할까요?\n배정 ${e._count.assignments}건과 응시·성적·시험지·재시험이 함께 지워지고 되돌릴 수 없어요.`} testId="exam-purge">
                          영구 삭제
                        </ActionButton>
                      </span>
                    ) : (
                      <ActionButton action={trashExamAction.bind(null, e.id)} className="icon-btn danger" title="휴지통으로" confirm={`"${e.title}"을 휴지통으로 옮길까요? 학생 화면에서 바로 사라져요.`} testId="exam-trash">
                        <Icon name="trash" />
                      </ActionButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
