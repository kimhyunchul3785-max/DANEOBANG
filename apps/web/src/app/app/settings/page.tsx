import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
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
        <div className="kicker">학원장 전용</div>
        <h1 className="h1 mt-1">학원 설정</h1>
        <p className="muted mt-1">
          /{academy.slug} · {academy.plan} · 개설 {fmtDate(academy.createdAt, false)}
        </p>
        {/* 반·선생님은 각자 한 곳(학생 탭 · 선생님 메뉴)에서 관리 — 여기는 학원 정보만. 탭처럼 보이는 링크 묶음을 두지 않는다 */}
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
          반 관리는{" "}
          <Link href="/app/students?classes=1#classes-wrap" className="font-semibold underline">
            학생 탭
          </Link>
          , 선생님 초대·관리는{" "}
          <Link href="/app/teachers" className="font-semibold underline">
            선생님 메뉴
          </Link>
          에서 해요.
        </p>
      </header>

      <div className="bento">
        <div className="card span-3 card-body">
          <div className="lbl mb-3">기본 정보</div>
          <ActionForm action={updateAcademyAction} className="space-y-3" resetOnSuccess={false}>
            <div>
              <label className="label" htmlFor="ac-name">학원 이름</label>
              <input className="input" id="ac-name" name="name" defaultValue={academy.name} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="ac-rep">대표자명</label>
                <input className="input" id="ac-rep" name="representativeName" defaultValue={academy.representativeName ?? ""} maxLength={30} />
              </div>
              <div>
                <label className="label" htmlFor="ac-phone">학원 전화번호</label>
                <input className="input" id="ac-phone" name="phone" defaultValue={academy.phone ?? ""} maxLength={30} />
              </div>
              <div>
                <label className="label" htmlFor="ac-region">지역</label>
                <input className="input" id="ac-region" name="region" defaultValue={academy.region ?? ""} maxLength={30} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ac-intro">소개</label>
              <textarea className="input" id="ac-intro" name="intro" rows={3} defaultValue={academy.intro ?? ""} />
            </div>
            <div>
              <label className="label">대표 색상 · 시험지 머리글에 씁니다</label>
              <label className="pill cursor-pointer" style={{ padding: "8px 14px 8px 8px" }}>
                <input type="color" name="color" defaultValue={academy.color} className="color-swatch" aria-label="대표 색상" />
                <span className="digital" style={{ fontSize: 13 }}>
                  {academy.color?.toUpperCase()}
                </span>
                <span className="lbl">바꾸기</span>
              </label>
            </div>
            <button className="btn-primary">저장</button>
          </ActionForm>
        </div>

        <div className="card span-3 card-body">
          <div className="lbl mb-3">로고 · 시험지·오답노트 상단에 인쇄</div>
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

        <div className="card-sm card-body span-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]" style={{ color: "var(--ink-2)" }} data-testid="settings-usage">
          <span className="lbl">사용 현황</span>
          <span>선생님 {counts[0]}명</span>
          <span>학생 {counts[1]}명</span>
          <span>단어장 {counts[2]}권</span>
          <span>시험 {counts[3]}개</span>
          {usage.map((u) => (
            <span key={u.kind}>
              {u.kind === "attempt" ? "응시" : u.kind === "ocr" ? "OCR" : u.kind} {u._sum.amount ?? 0}회
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
