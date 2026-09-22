import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { CountUp } from "@/components/Motion";
import { loadGrades, avg, recentWeeks } from "@/lib/stats";
import { createStudentAction, createClassAction, toggleClassArchiveAction, deleteClassAction } from "./actions";
import { RosterTable, type RosterRow } from "./RosterTable";
import { RosterUpload } from "./RosterUpload";
import { ClassRow } from "./ClassRow";

/**
 * 학생 탭 = 명단 관리.
 * 등록(엑셀 양식 · 한 명), 반 이동, 담당 지정, 비활성·삭제, 반 만들기·이름·보관. 성적은 성적 탭에서.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; classId?: string; status?: string; teacher?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const academyId = ctx.member.academyId;
  const showAll = sp.status === "all";
  const [students, classes, members] = await Promise.all([
    prisma.student.findMany({
      where: {
        ...studentScope(ctx),
        ...(showAll ? {} : { status: "active" }),
        ...(sp.q ? { name: { contains: sp.q } } : {}),
        ...(sp.classId === "none" ? { classId: null } : sp.classId ? { classId: sp.classId } : {}),
        ...(sp.teacher ? { teachers: { some: { memberId: sp.teacher } } } : {}),
      },
      include: { classRoom: true, user: { select: { id: true } }, teachers: { include: { member: { include: { user: { select: { name: true } } } } } }, _count: { select: { linkRequests: { where: { status: "pending" } }, retakes: { where: { status: { in: ["pending", "scheduled"] } } } } } },
      orderBy: [{ status: "asc" }, { classId: "asc" }, { name: "asc" }],
    }),
    prisma.classRoom.findMany({ where: { academyId }, include: { _count: { select: { students: { where: { status: "active" } } } } }, orderBy: [{ archived: "asc" }, { name: "asc" }] }),
    ctx.isOwner ? prisma.academyMember.findMany({ where: { academyId, status: "active" }, include: { user: { select: { name: true } } }, orderBy: { role: "asc" } }) : Promise.resolve([]),
  ]);
  const weeks = recentWeeks(4);
  const grades = await loadGrades(academyId, { id: { in: students.map((s) => s.id) } }, weeks[0]);
  const byStudent = new Map<string, number[]>();
  for (const g of grades) if (!g.isRetake) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g.score]);
  const rows: RosterRow[] = students.map((s) => ({
    id: s.id,
    name: s.name,
    className: s.classRoom?.name ?? null,
    classId: s.classId,
    school: s.school,
    grade: s.grade,
    teachers: s.teachers.map((t) => t.member.user.name).join(", "),
    linked: !!s.user,
    pending: s._count.linkRequests,
    avg: avg(byStudent.get(s.id) ?? []),
    retake: s._count.retakes,
    status: s.status,
  }));
  const activeClasses = classes.filter((c) => !c.archived);
  const linked = students.filter((s) => s.user).length;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, classId: sp.classId, status: sp.status, teacher: sp.teacher, ...patch })) if (v) p.set(k, v);
    const str = p.toString();
    return `/app/students${str ? `?${str}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Students · {ctx.isOwner ? "학원 전체" : "담당 학생"}</div>
          <h1 className="h1 mt-1">학생 명단</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="digital">
            <CountUp value={rows.length} /> STUDENTS · <CountUp value={linked} /> LINKED
          </span>
          <Link href="/app/results" className="btn-secondary btn-sm">
            성적 보기 →
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-3">
          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="반 필터">
              <Link href={qs({ classId: undefined })} className={`chip${!sp.classId ? " on" : ""}`} role="tab" aria-selected={!sp.classId}>
                전체
                <span className="chip-sub">{students.length}</span>
              </Link>
              {activeClasses.map((c) => (
                <Link key={c.id} href={qs({ classId: c.id })} className={`chip${sp.classId === c.id ? " on" : ""}`} role="tab" aria-selected={sp.classId === c.id}>
                  {c.name}
                  <span className="chip-sub">{c._count.students}</span>
                </Link>
              ))}
              <Link href={qs({ classId: "none" })} className={`chip${sp.classId === "none" ? " on" : ""}`} role="tab" aria-selected={sp.classId === "none"}>
                반 없음
              </Link>
            </div>
            <form className="ml-auto flex gap-2" method="get">
              {sp.classId && <input type="hidden" name="classId" value={sp.classId} />}
              {sp.status && <input type="hidden" name="status" value={sp.status} />}
              <input className="input" name="q" placeholder="이름 검색" defaultValue={sp.q ?? ""} style={{ padding: "7px 12px", width: 150 }} />
              <button className="btn-secondary btn-sm">검색</button>
              <Link href={qs({ status: showAll ? undefined : "all" })} className="btn-ghost btn-sm">
                {showAll ? "활성만" : "비활성 포함"}
              </Link>
            </form>
          </div>

          <section className="card card-body overflow-x-auto">
            <RosterTable rows={rows} classes={activeClasses.map((c) => ({ id: c.id, name: c.name }))} members={members.map((m) => ({ id: m.id, name: `${m.user.name}${m.role === "OWNER" ? " (학원장)" : ""}` }))} isOwner={ctx.isOwner} />
          </section>
        </div>

        <div className="space-y-4">
          {/* 등록: 엑셀 양식 */}
          <div className="card-accent card-body">
            <div className="flex items-center justify-between">
              <div className="lbl-on">Register · 엑셀로 등록</div>
              <a href="/api/files/roster-template" className="btn btn-sm" style={{ background: "#fff4f0", color: "var(--accent)" }} download>
                양식 내려받기 ↓
              </a>
            </div>
            <p className="mt-2 text-[13px]" style={{ color: "rgba(255,244,240,0.9)" }}>
              시트 이름이 곧 반 이름입니다. 각 시트에 <b>이름 · 학교 · 학년</b>을 적어 올리면 학생이 그 반으로 등록됩니다. 없는 반은 자동으로 만들어집니다.
            </p>
            <div className="mt-3">
              <RosterUpload />
            </div>
          </div>

          {/* 등록: 한 명 */}
          <div className="card card-body">
            <div className="lbl mb-2">One · 한 명 등록</div>
            <ActionForm action={createStudentAction} className="space-y-2">
              <input className="input" name="name" placeholder="이름" required maxLength={30} />
              <div className="flex gap-2">
                <input className="input" name="school" placeholder="학교" />
                <input className="input" name="grade" placeholder="학년 (예: 고1)" />
              </div>
              <select className="input" name="classId" defaultValue={sp.classId && sp.classId !== "none" ? sp.classId : ""}>
                <option value="">반 없음</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn-primary w-full">등록</button>
            </ActionForm>
          </div>

          {/* 반 관리 */}
          <div className="card card-body">
            <div className="mb-2 flex items-center justify-between">
              <div className="lbl">Classes · 반 관리</div>
              <span className="digital">{activeClasses.length}</span>
            </div>
            <ul>
              {classes.map((c) => (
                <ClassRow key={c.id} cls={{ id: c.id, name: c.name, archived: c.archived, count: c._count.students }}>
                  <ActionButton action={toggleClassArchiveAction.bind(null, c.id)} className="btn-ghost btn-sm">
                    {c.archived ? "복원" : "보관"}
                  </ActionButton>
                  {c._count.students === 0 && (
                    <ActionButton action={deleteClassAction.bind(null, c.id)} className="btn-ghost btn-sm" confirm="이 반을 삭제할까요?">
                      삭제
                    </ActionButton>
                  )}
                </ClassRow>
              ))}
              {classes.length === 0 && <li className="muted py-2">반이 없습니다.</li>}
            </ul>
            <ActionForm action={createClassAction} className="mt-3 flex gap-2">
              <input className="input" name="name" placeholder="새 반 이름 (예: 고1 A반)" required maxLength={30} style={{ padding: "8px 12px" }} />
              <button className="btn-secondary btn-sm whitespace-nowrap">추가</button>
            </ActionForm>
            <p className="muted mt-2">반을 옮겨도 과거 응시 기록은 유지됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
