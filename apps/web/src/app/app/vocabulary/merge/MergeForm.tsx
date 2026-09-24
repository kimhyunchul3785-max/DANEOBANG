"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ActionBar, StepHead } from "@/components/ActionBar";
import { mergeBooksAction } from "../actions";

type Book = { id: string; title: string; words: number; days: number };
type Dropped = { bookId: string; english: string; firstIn: string };

/**
 * 병합 화면: ① 순서(첫 번째가 기준, 뒤 단어장의 겹치는 단어가 빠진다) ② 새 제목 ③ DAY 처리 ④ 원본 보관 → [병합]
 * 겹치는 단어 미리보기는 서버가 계산해 내려준다 (순서를 바꾸면 페이지가 새 순서로 다시 열린다).
 */
export function MergeForm({ books, kept, dropped, sampleDropped }: { books: Book[]; kept: number; dropped: Dropped[]; sampleDropped: string[] }) {
  const [state, action, pending] = useActionState(mergeBooksAction, undefined);
  const [title, setTitle] = useState(books.map((b) => b.title).join(" + ").slice(0, 60));
  const [dayMode, setDayMode] = useState<"append" | "resplit">("append");
  const [days, setDays] = useState(7);
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const totalDays = books.reduce((s, b) => s + b.days, 0);
  const reorder = (i: number, dir: -1 | 1) => {
    const ids = books.map((b) => b.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return null;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return `/app/vocabulary/merge?ids=${ids.join(",")}`;
  };

  return (
    <form action={action} className="space-y-4" data-testid="merge-form">
      {books.map((b) => (
        <input key={b.id} type="hidden" name="bookIds" value={b.id} />
      ))}
      <section className="card card-body">
        <StepHead n={1} title="순서" hint="첫 번째 단어장이 기준. 뒤 단어장에서 겹치는 단어(표제어 같음)는 빠집니다" right={<span className="digital">{books.length}권</span>} />
        <ol className="mt-3 space-y-2">
          {books.map((b, i) => {
            const drops = dropped.filter((d) => d.bookId === b.id).length;
            const up = reorder(i, -1);
            const down = reorder(i, 1);
            return (
              <li key={b.id} className="flex items-center gap-3 rounded-[18px] px-4 py-3" style={{ background: "var(--surface-2)" }} data-testid="merge-book">
                <span className="step-no">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{b.title}</span>
                  <span className="digital mt-0.5 block" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {b.words}단어 · DAY {b.days}개
                    {drops ? ` · 겹침 ${drops} 제거` : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  {up ? <Link href={up} className="btn-ghost btn-sm" aria-label="위로">↑</Link> : <span className="btn-ghost btn-sm opacity-30">↑</span>}
                  {down ? <Link href={down} className="btn-ghost btn-sm" aria-label="아래로">↓</Link> : <span className="btn-ghost btn-sm opacity-30">↓</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card card-body" data-testid="merge-preview">
        <StepHead n={2} title="겹치는 단어" hint="표제어가 같으면(대소문자·괄호·구두점 무시) 뒤 단어장의 것을 뺍니다. 뜻이 달라도 앞 단어장의 뜻이 남아요" right={<span className="digital">{kept} KEPT · {dropped.length} DROPPED</span>} />
        {dropped.length === 0 ? (
          <p className="muted mt-3">겹치는 단어가 없어요. {kept}단어가 그대로 합쳐집니다.</p>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {sampleDropped.map((w, i) => (
                <span key={i} className="chip" style={{ cursor: "default", textDecoration: "line-through", color: "var(--ink-3)" }}>
                  {w}
                </span>
              ))}
              {dropped.length > sampleDropped.length && <span className="chip" style={{ cursor: "default" }}>+{dropped.length - sampleDropped.length}</span>}
            </div>
            <p className="muted mt-2">
              {books
                .filter((b) => dropped.some((d) => d.bookId === b.id))
                .map((b) => `${b.title}에서 ${dropped.filter((d) => d.bookId === b.id).length}개`)
                .join(" · ")}{" "}
              — 이미 {byId.get(dropped[0]?.firstIn)?.title ?? "앞 단어장"} 등에 있는 단어.
            </p>
          </div>
        )}
      </section>

      <section className="card card-body">
        <StepHead n={3} title="새 단어장" hint="제목과 DAY. 원본 단어장은 그대로 남아요 (필요 없으면 목록에서 지우면 됩니다)" />
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="label">제목</div>
            <input className="input" name="title" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="merge-title" />
          </div>
          <div>
            <div className="label">DAY</div>
            <div className="seg" role="radiogroup" aria-label="DAY 처리">
              <button type="button" role="radio" aria-checked={dayMode === "append"} className={`seg-item${dayMode === "append" ? " on" : ""}`} onClick={() => setDayMode("append")} data-testid="merge-day-append">
                이어 붙이기 · DAY {totalDays}
              </button>
              <button type="button" role="radio" aria-checked={dayMode === "resplit"} className={`seg-item${dayMode === "resplit" ? " on" : ""}`} onClick={() => setDayMode("resplit")} data-testid="merge-day-resplit">
                다시 나누기
              </button>
            </div>
            <input type="hidden" name="dayMode" value={dayMode} />
            {dayMode === "resplit" ? (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" name="days" min={1} max={200} value={days} onChange={(e) => setDays(Math.max(1, Math.min(200, Number(e.target.value) || 7)))} className="input w-24" aria-label="일수" />
                <span className="muted">일로 균등하게</span>
              </div>
            ) : (
              null
            )}
          </div>
          <div>
            <div className="label">원본</div>
            <p className="text-[14px]">원본 {books.length}개는 그대로 남아요.</p>
          </div>
        </div>
      </section>

      {state?.error && (
        <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }} role="alert">
          {state.error}
        </p>
      )}
      <ActionBar testId="merge-bar" note={`${books.length}개 → "${title || "제목 없음"}" · ${kept}단어 · ${dayMode === "append" ? `DAY ${totalDays}` : `DAY ${days}`}${dropped.length ? ` · 겹침 ${dropped.length} 제거` : ""}`}>
        <Link href="/app/vocabulary" className="btn-ghost">
          취소
        </Link>
        <button className="btn-primary" disabled={pending || !title.trim()} data-testid="merge-submit">
          {pending ? "합치는 중…" : `병합 · 새 단어장 만들기 →`}
        </button>
      </ActionBar>
    </form>
  );
}
