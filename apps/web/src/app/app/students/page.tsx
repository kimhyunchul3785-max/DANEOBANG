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
import { ClassCodeList } from "./ClassCodeCard";

/**
 * 학생 탭 = 명단 관리.
 * 등록(엑셀 양식 · 한 명), 반 이동, 담당 지정, 비활성·삭제, 반 만들기·이름·보관. 성적은 성적 탭에서.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; classId?: string; status?: string; teacher?: string; classes?: string; add?: string }> }) {
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
      include: { classRoom: true, user: { select: { id: true } }, teachers: { include: { member: { include: { user: { select: { name: true } } } } } }, _count: { select: { linkRequests: { where: { status: "pending" } }, retakes: { where: { status: { in: ["pending", "issued"] } } } } } },
      orderBy: [{ status: "asc" }, { classId: "asc" }, { name: "asc" }],
    }),
    // 반 칩 숫자 = 내가 볼 수 있는(담당) 학생 수 — 학원장은 반 전체, 선생님은 담당 학생만 (출제 화면과 같은 규칙)
    prisma.classRoom.findMany({ where: { academyId }, include: { _count: { select: { students: { where: { status: "active", ...(ctx.isOwner ? {} : { teachers: { some: { memberId: ctx.member.id } } }) } } } } }, orderBy: [{ archived: "asc" }, { name: "asc" }] }),
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
    phone: s.phone,
    teachers: s.teachers.map((t) => t.member.user.name).join(", "),
    linked: !!s.user,
    invited: (!!s.inviteTokenHash && (!s.inviteExpiresAt || s.inviteExpiresAt > new Date())) || (!!s.phoneCodeHash && (!s.phoneCodeExpiresAt || s.phoneCodeExpiresAt > new Date())),
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
    <div className="mx-auto max-w-6xl" data-width="wide">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">{ctx.isOwner ? "학원 전체" : "담당 학생"}</div>
          <h1 className="h1 mt-1">학생</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="digital">
            <CountUp value={rows.length} />명 · 계정 연결 <CountUp value={linked} />
          </span>
          <label htmlFor="rail-toggle" className="btn-primary btn-sm cursor-pointer" data-testid="add-open">
            학생 추가
          </label>
        </div>
      </header>

      {/* 학생 추가: 기본은 접혀 있고 [학생 추가]로 연다 — 명단이 이 화면의 주인공 (반 코드 공유 · 엑셀 · 한 명) */}
      <input type="checkbox" id="rail-toggle" className="peer sr-only" aria-label="학생 추가 패널 열기" defaultChecked={!!sp.add || students.length === 0} data-testid="add-toggle" />
      <div className="mb-4 hidden peer-checked:block" id="add" data-testid="add-panel">
        <div className="card card-body">
          <div className="mb-3 flex items-center justify-between">
            <div className="h3">학생 추가</div>
            <label htmlFor="rail-toggle" className="btn-ghost btn-sm cursor-pointer">
              닫기 ✕
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="lbl mb-2">반 코드로 초대 (학생이 직접 가입)</div>
          <ClassCodeList key={sp.classId ?? "all"} classes={activeClasses.map((c) => ({ id: c.id, name: c.name, joinCode: c.joinCode, count: c._count.students }))} academyName={ctx.member.academy.name} initialId={sp.classId && sp.classId !== "none" ? sp.classId : undefined} />

            </div>
          {/* 등록: 엑셀 양식 */}
          <div id="add-excel">
            <div className="lbl mb-2">엑셀로 여러 명</div>
            <RosterUpload />
            <p className="muted mt-2">시트 = 반 · 열 = 이름 · 학교 · 학년 · 휴대폰</p>
          </div>

          {/* 등록: 한 명 */}
          <div>
            <div className="lbl mb-2">한 명 등록</div>
            <ActionForm action={createStudentAction} className="space-y-2">
              <input className="input" aria-label="이름" name="name" placeholder="이름" required maxLength={30} />
              <div className="flex gap-2">
                <input className="input" aria-label="학교" name="school" placeholder="학교" />
                <input className="input" aria-label="학년" name="grade" placeholder="학년 (예: 고1)" />
              </div>
              <input className="input" aria-label="휴대폰" name="phone" inputMode="tel" placeholder="휴대폰 번호 (인증번호 발송)" />
              <input className="input" aria-label="이메일" name="email" type="email" placeholder="이메일 (선택)" />
              <select className="input" aria-label="반" name="classId" defaultValue={sp.classId && sp.classId !== "none" ? sp.classId : ""}>
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

          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="반 필터">
              <Link href={qs({ classId: undefined })} className={`chip${!sp.classId ? " on" : ""}`} role="tab" aria-selected={!sp.classId}>
                전체
                <span className="chip-sub">{students.length}</span>
              </Link>
              {activeClasses.map((c) => (
                <Link key={c.id} href={qs({ classId: c.id })} className={`chip${sp.classId === c.id ? " on" : ""}${c._count.students === 0 ? " opacity-50" : ""}`} role="tab" aria-selected={sp.classId === c.id} title={c._count.students === 0 && !ctx.isOwner ? "이 반에는 내 담당 학생이 없어요" : undefined} data-class={c.name}>
                  {c.name}
                  <span className="chip-sub">{c._count.students}</span>
                </Link>
              ))}
              <Link href={qs({ classId: "none" })} className={`chip${sp.classId === "none" ? " on" : ""}`} role="tab" aria-selected={sp.classId === "none"}>
                반 없음
              </Link>
            </div>
            <form className="flex w-full gap-2 sm:ml-auto sm:w-auto" method="get">
              {sp.classId && <input type="hidden" name="classId" value={sp.classId} />}
              {sp.status && <input type="hidden" name="status" value={sp.status} />}
              <input className="input min-w-0 flex-1 sm:w-[180px] sm:flex-none" aria-label="이름 검색" name="q" placeholder="이름 검색" defaultValue={sp.q ?? ""} style={{ padding: "7px 12px" }} />
              <button className="btn-secondary btn-sm">검색</button>
              <Link href={qs({ status: showAll ? undefined : "all" })} className="btn-ghost btn-sm">
                {showAll ? "활성만" : "비활성 포함"}
              </Link>
            </form>
          </div>

          <section className="card card-body overflow-x-auto">
            <RosterTable
              rows={rows}
              classes={activeClasses.map((c) => ({ id: c.id, name: c.name }))}
              members={members.map((m) => ({ id: m.id, name: `${m.user.name}${m.role === "OWNER" ? " (학원장)" : ""}` }))}
              isOwner={ctx.isOwner}
              emptyText={
                sp.q
                  ? `"${sp.q}" 에 맞는 학생이 없어요.`
                  : !ctx.isOwner && sp.classId && sp.classId !== "none"
                    ? "이 반에는 내 담당 학생이 없어요. 담당은 학원장이 학생 탭에서 지정합니다."
                    : !ctx.isOwner
                      ? "아직 담당 학생이 없어요. 학원장이 담당을 지정하면 여기에 보입니다."
                      : "학생이 없습니다. 반 코드를 학생에게 알려주거나, 아래에서 엑셀·한 명씩 등록하세요."
              }
            />
          </section>
      </div>

      {/* 반 관리 — 반은 여기 한 곳에서 (학원 설정에서는 이리로 연결) */}
      <details className="mt-4" id="classes-wrap" open={!!sp.classes}>
        <summary className="btn-ghost btn-sm cursor-pointer" data-testid="classes-toggle">
          반 관리 · {activeClasses.length}개 ▾
        </summary>
        <div className="mt-2">
          {/* 반 관리 */}
          <div className="card card-body" id="classes">
            <div className="mb-2 flex items-center justify-between">
              <div className="lbl">반 관리</div>
              <span className="digital">{activeClasses.length}</span>
            </div>
            <ul>
              {classes.map((c) => (
                <ClassRow key={c.id} cls={{ id: c.id, name: c.name, archived: c.archived, count: c._count.students, teacherMemberId: c.teacherMemberId }} teachers={ctx.isOwner ? members.map((m) => ({ id: m.id, name: m.user.name })) : null}>
                  {ctx.isOwner && (
                    <ActionButton action={toggleClassArchiveAction.bind(null, c.id)} className="btn-ghost btn-sm">
                      {c.archived ? "복원" : "보관"}
                    </ActionButton>
                  )}
                  {ctx.isOwner && c._count.students === 0 && (
                    <ActionButton action={deleteClassAction.bind(null, c.id)} className="btn-ghost btn-sm" confirm="이 반을 삭제할까요?">
                      삭제
                    </ActionButton>
                  )}
                </ClassRow>
              ))}
              {classes.length === 0 && <li className="muted py-2">반이 없습니다.</li>}
            </ul>
            <ActionForm action={createClassAction} className="mt-3 flex gap-2">
              <input className="input" aria-label="새 반 이름" name="name" placeholder="새 반 이름 (예: 고1 A반)" required maxLength={30} style={{ padding: "8px 12px" }} />
              <button className="btn-secondary btn-sm whitespace-nowrap">추가</button>
            </ActionForm>
            <p className="muted mt-2">반을 옮겨도 과거 응시 기록은 유지됩니다.</p>
          </div>
        </div>
      </details>
    </div>
  );
}
