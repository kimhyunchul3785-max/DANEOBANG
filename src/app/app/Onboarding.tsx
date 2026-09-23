import Link from "next/link";
import { prisma } from "@/lib/db";
import type { AcademyContext } from "@/lib/auth";
import { ClassCodeCard } from "./students/ClassCodeCard";

/**
 * 새 학원의 첫 화면: 학생 초대 → 단어장 → 첫 시험. 완료 판단은 클릭이 아니라 실제 데이터.
 * 세 가지가 다 되면 사라진다.
 */
export async function Onboarding({ ctx }: { ctx: AcademyContext }) {
  const academyId = ctx.member.academyId;
  const [students, books, exams, cls] = await Promise.all([
    prisma.student.count({ where: { academyId, status: "active" } }),
    prisma.vocabBook.count({ where: { academyId, status: "active" } }),
    prisma.exam.count({ where: { academyId, status: { not: "draft" } } }),
    prisma.classRoom.findFirst({ where: { academyId, archived: false }, orderBy: { createdAt: "asc" } }),
  ]);
  const steps = [
    { done: students > 0, title: "학생 초대", sub: "반 코드를 공유해 학생을 연결하세요.", href: "/app/students" },
    { done: books > 0, title: "단어장 올리기", sub: "첫 단어장을 등록하세요.", href: "/app/vocabulary" },
    { done: exams > 0, title: "첫 시험 출제", sub: "학생에게 시험을 보내보세요.", href: "/app/tests/new" },
  ];
  if (steps.every((s) => s.done)) return null;
  const doneN = steps.filter((s) => s.done).length;
  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="onboarding">
      <section className="card card-body">
        <div className="flex items-center justify-between">
          <div className="lbl">Getting started · 단어방 시작하기</div>
          <span className="digital">{doneN}/3</span>
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Link href={s.href} className="tile block rounded-2xl px-4 py-3" style={s.done ? { background: "var(--surface-2)", color: "var(--ink-3)" } : { background: "var(--surface-2)" }} aria-current={!s.done && steps.slice(0, i).every((x) => x.done) ? "step" : undefined}>
                <div className="flex items-center gap-2">
                  <span className="digital" style={{ color: s.done ? "var(--ink-3)" : "var(--accent)" }}>
                    {s.done ? "●" : "○"}
                  </span>
                  <span className="text-[14px] font-semibold" style={s.done ? { textDecoration: "line-through" } : undefined}>
                    {i + 1} {s.title}
                  </span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {s.sub}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      {cls && <ClassCodeCard cls={{ id: cls.id, name: cls.name, joinCode: cls.joinCode }} academyName={ctx.member.academy.name} compact />}
    </div>
  );
}
