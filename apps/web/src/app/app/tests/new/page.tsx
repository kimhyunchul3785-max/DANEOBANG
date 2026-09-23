import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAcademy } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { NewExamForm } from "./NewExamForm";

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ bookId?: string; day?: string; days?: string }> }) {
  const ctx = await requireAcademy();
  const sp = await searchParams;
  const books = await prisma.vocabBook.findMany({
    where: { academyId: ctx.member.academyId, status: "active" },
    include: { days: { orderBy: { dayNo: "asc" }, include: { _count: { select: { words: { where: { approved: true, excluded: false } } } } } } },
    orderBy: { updatedAt: "desc" },
  });
  // 반 칩의 인원 = 이 선생님이 배정할 수 있는 학생 수 (학원장은 전체, 선생님은 담당 학생만) — 출제 시 실제 배정 수와 같게
  const classes = await prisma.classRoom.findMany({ where: { academyId: ctx.member.academyId, archived: false }, include: { _count: { select: { students: { where: { ...studentScope(ctx), status: "active" } } } } }, orderBy: { name: "asc" } });
  const defaultDays = (sp.days ?? sp.day ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => n > 0);
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <Link href="/app/tests" className="kicker hover:underline">
          ← Tests · 시험
        </Link>
        <h1 className="h1 mt-1">시험 출제</h1>
        <p className="muted mt-1">범위 → 대상 → 조건 → 아래 <b>출제</b>. 기본은 지금 시작 · 7일 뒤 마감. 문항·정답은 나중에 고칠 수 있어요.</p>
      </header>
      {books.length === 0 ? (
        <div className="card card-body">
          단어장이 없습니다.{" "}
          <Link href="/app/vocabulary" className="underline">
            단어장 파일을 먼저 올려 주세요.
          </Link>
        </div>
      ) : (
        <NewExamForm books={books.map((b) => ({ id: b.id, title: b.title, days: b.days.map((d) => ({ id: d.id, dayNo: d.dayNo, label: d.label, count: d._count.words })) }))} defaultBookId={sp.bookId} defaultDays={defaultDays} classes={classes.map((c) => ({ id: c.id, name: c.name, count: c._count.students }))} isOwner={ctx.isOwner} />
      )}
    </div>
  );
}
