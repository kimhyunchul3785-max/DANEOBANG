import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, getStudentContexts } from "@/lib/auth";
import { selectAcademyAction } from "./actions";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const memberships = await prisma.academyMember.findMany({
    where: { userId: user.id, status: "active" },
    include: { academy: true },
    orderBy: { createdAt: "asc" },
  });
  const students = await getStudentContexts(user.id);
  const pendingLinks = await prisma.studentLinkRequest.findMany({
    where: { userId: user.id, status: "pending" },
    include: { student: { include: { academy: true } } },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="lbl">Workspaces</div>
          <h1 className="h1 mt-1">{user.name}</h1>
          <p className="muted mt-1">참여 중인 학원을 선택하거나 새 학원을 개설하세요.</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="btn-ghost btn-sm">로그아웃</button>
        </form>
      </div>

      <section className="card mb-4">
        <div className="card-body">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Academies · 선생님 · 학원장</h2>
            <Link href="/start" className="btn-primary btn-sm">
              + 학원 시작하기
            </Link>
          </div>
          {memberships.length === 0 ? (
            <p className="muted">참여 중인 학원이 없습니다. 학원을 시작하거나(원장), 원장의 초대 링크로 참여하세요(선생님).</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{m.academy.name}</div>
                    <div className="text-xs text-slate-500">
                      /{m.academy.slug} · {m.role === "OWNER" ? "학원장" : "선생님"}
                      {m.academy.status === "pending_payment" && <span className="badge-amber ml-2">결제 필요</span>}
                      {m.academy.status === "suspended" && <span className="badge-red ml-2">정지됨</span>}
                    </div>
                  </div>
                  <form action={selectAcademyAction}>
                    <input type="hidden" name="academyId" value={m.academyId} />
                    <button className="btn-secondary btn-sm" disabled={m.academy.status === "suspended"}>
                      들어가기
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card mb-4">
        <div className="card-body">
          <h2 className="h2 mb-3">Student</h2>
          {students.length === 0 && pendingLinks.length === 0 ? (
            <p className="muted">연결된 학생 명단이 없습니다. 선생님에게 받은 초대 링크를 여세요.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{s.academy.name}</div>
                    <div className="text-xs text-slate-500">{s.name} 학생</div>
                  </div>
                  <Link href="/learn" className="btn-secondary btn-sm">
                    내 시험
                  </Link>
                </li>
              ))}
              {pendingLinks.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{r.student.academy.name}</div>
                    <div className="text-xs text-slate-500">{r.student.name} · 선생님 승인 대기</div>
                  </div>
                  <span className="badge-amber">대기</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {user.isPlatformAdmin && (
        <Link href="/admin" className="btn-secondary">
          플랫폼 관리자 화면
        </Link>
      )}
    </main>
  );
}
