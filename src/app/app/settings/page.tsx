import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { updateAcademyAction, uploadLogoAction, removeLogoAction } from "./actions";

/** 학원 설정 — 학원장 전용 (선생님은 메뉴에 보이지 않고, 직접 접근하면 /app 으로) */
export default async function SettingsPage() {
  const ctx = await requireOwner();
  const academy = await prisma.academy.findUniqueOrThrow({ where: { id: ctx.member.academyId } });
  const usage = await prisma.usageEvent.groupBy({ by: ["kind"], where: { academyId: academy.id }, _sum: { amount: true } });
  const counts = await Promise.all([
    prisma.academyMember.count({ where: { academyId: academy.id, status: "active" } }),
    prisma.student.count({ where: { academyId: academy.id, status: "active" } }),
    prisma.vocabBook.count({ where: { academyId: academy.id, status: "active" } }),
    prisma.exam.count({ where: { academyId: academy.id } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <div className="kicker">Setup · 학원 설정</div>
        <h1 className="h1 mt-1">학원 설정</h1>
        <p className="muted mt-1">
          /{academy.slug} · {academy.plan} · 개설 {fmtDate(academy.createdAt, false)}
        </p>
      </header>

      <div className="bento">
        <div className="card span-3 card-body">
          <div className="lbl mb-3">Academy · 기본 정보</div>
          <ActionForm action={updateAcademyAction} className="space-y-3" resetOnSuccess={false}>
            <div>
              <label className="label">학원 이름</label>
              <input className="input" name="name" defaultValue={academy.name} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">대표자명</label>
                <input className="input" name="representativeName" defaultValue={academy.representativeName ?? ""} maxLength={30} />
              </div>
              <div>
                <label className="label">학원 전화번호</label>
                <input className="input" name="phone" defaultValue={academy.phone ?? ""} maxLength={30} />
              </div>
              <div>
                <label className="label">지역</label>
                <input className="input" name="region" defaultValue={academy.region ?? ""} maxLength={30} />
              </div>
            </div>
            <div>
              <label className="label">소개</label>
              <textarea className="input" name="intro" rows={3} defaultValue={academy.intro ?? ""} />
            </div>
            <div>
              <label className="label">대표 색상</label>
              <input className="input w-24" type="color" name="color" defaultValue={academy.color} />
            </div>
            <button className="btn-primary">저장</button>
          </ActionForm>
        </div>

        <div className="card span-3 card-body">
          <div className="lbl mb-3">Logo · 시험지·오답노트 상단에 인쇄</div>
          <div className="flex items-start gap-4">
            {academy.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/files/logo/current" alt="학원 로고" className="h-16 max-w-[220px] rounded-xl object-contain p-1" style={{ background: "var(--surface-2)" }} />
            ) : (
              <div className="flex h-16 w-32 items-center justify-center rounded-xl text-xs" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
                로고 없음
              </div>
            )}
            <div className="flex-1 space-y-2">
              <ActionForm action={uploadLogoAction} className="flex gap-2">
                <input className="input" type="file" name="logo" accept="image/png,image/jpeg" required aria-label="로고 파일" />
                <button className="btn-secondary whitespace-nowrap">등록</button>
              </ActionForm>
              <p className="muted text-[12px]">PNG/JPG, 2MB 이하. 가로형 권장 (600×300 안에 맞춤).</p>
              {academy.logoPath && (
                <ActionButton action={removeLogoAction} className="btn-ghost btn-sm">
                  로고 제거
                </ActionButton>
              )}
            </div>
          </div>
        </div>

        {[
          ["Teachers", counts[0], "선생님"],
          ["Students", counts[1], "학생"],
          ["Books", counts[2], "단어장"],
          ["Exams", counts[3], "시험"],
        ].map(([en, n, ko]) => (
          <div key={String(en)} className="card-sm card-body span-2 lg:!col-span-1">
            <div className="lbl">{en}</div>
            <div className="num-lg mt-2" style={{ fontSize: 36 }}>
              {n}
            </div>
            <div className="muted">{ko}</div>
          </div>
        ))}
        <div className="card-sm card-body span-2">
          <div className="lbl">Usage · 사용량</div>
          <div className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
            {usage.length === 0 ? "없음" : usage.map((u) => `${u.kind} ${u._sum.amount ?? 0}`).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}
