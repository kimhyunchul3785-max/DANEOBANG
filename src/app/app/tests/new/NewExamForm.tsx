"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createExamAction, previewItemsAction } from "../actions";

type Book = { id: string; title: string; days: { id: string; dayNo: number; label: string; count: number }[] };
type Cls = { id: string; name: string; count: number };
type Preview = { prompt: string; dayLabel: string; options: { text: string; isCorrect: boolean }[] }[];

function seoulDate(offsetDays: number, hour = 23, minute = 59) {
  const now = new Date(Date.now() + 9 * 3600e3);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, hour, minute));
  return d.toISOString().slice(0, 16);
}
function sundayOffset() {
  const now = new Date(Date.now() + 9 * 3600e3);
  const dow = now.getUTCDay(); // 0=일
  return dow === 0 ? 0 : 7 - dow;
}

/**
 * 한 화면 출제: 범위(DAY 칩) → 대상(반 칩) → 조건 → 미리보기 → 발행·배정·학생 앱 표시
 */
export function NewExamForm({ books, defaultBookId, defaultDays, classes }: { books: Book[]; defaultBookId?: string; defaultDays?: number[]; classes: Cls[] }) {
  const [state, action, pending] = useActionState(createExamAction, undefined);
  const initialBook = defaultBookId && books.some((b) => b.id === defaultBookId) ? defaultBookId : books[0].id;
  const [bookId, setBookId] = useState(initialBook);
  const book = books.find((b) => b.id === bookId)!;
  const [sel, setSel] = useState<string[]>(() => book.days.filter((d) => defaultDays?.includes(d.dayNo)).map((d) => d.id));
  const [cls, setCls] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [pass, setPass] = useState(90);
  const [due, setDue] = useState<string>(seoulDate(sundayOffset()));
  const [duePreset, setDuePreset] = useState<"today" | "week" | "custom" | "none">("week");
  const [timeLimit, setTimeLimit] = useState(0);
  const [perWord, setPerWord] = useState(7);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const [loading, startPreview] = useTransition();

  const available = useMemo(() => book.days.filter((d) => sel.includes(d.id)).reduce((s, d) => s + d.count, 0), [book, sel]);
  const targets = useMemo(() => classes.filter((c) => cls.includes(c.id)).reduce((s, c) => s + c.count, 0), [classes, cls]);
  const selNos = book.days.filter((d) => sel.includes(d.id)).map((d) => d.dayNo);
  const range = selNos.length === 0 ? "—" : selNos.length === 1 ? `DAY ${selNos[0]}` : selNos.every((n, i) => i === 0 || n === selNos[i - 1] + 1) ? `DAY ${selNos[0]}–${selNos[selNos.length - 1]}` : `DAY ${selNos.join(",")}`;

  useEffect(() => {
    if (!sel.length) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      startPreview(async () => {
        const r = await previewItemsAction(bookId, sel, 4, seed);
        if (r.ok) {
          setPreview(r.items ?? []);
          setPreviewMsg(null);
        } else {
          setPreview(null);
          setPreviewMsg(r.message ?? null);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [bookId, sel, seed]);

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const pickDue = (p: typeof duePreset) => {
    setDuePreset(p);
    if (p === "today") setDue(seoulDate(0));
    if (p === "week") setDue(seoulDate(sundayOffset()));
    if (p === "none") setDue("");
  };

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-5">
      <input type="hidden" name="bookId" value={bookId} />
      {sel.map((id) => (
        <input key={id} type="hidden" name="dayIds" value={id} />
      ))}
      {cls.map((id) => (
        <input key={id} type="hidden" name="assignClassIds" value={id} />
      ))}
      <input type="hidden" name="questionCount" value={count} />
      <input type="hidden" name="passScore" value={pass} />
      <input type="hidden" name="timeLimitMin" value={timeLimit} />
      <input type="hidden" name="secondsPerItem" value={perWord} />
      <input type="hidden" name="dueAt" value={due} />

      <div className="space-y-4 lg:col-span-3">
        {/* 1. 범위 */}
        <section className="card card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">1 · Range · 범위</div>
            <span className="digital">{available} WORDS</span>
          </div>
          {books.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {books.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`chip${b.id === bookId ? " on" : ""}`}
                  onClick={() => {
                    setBookId(b.id);
                    setSel([]);
                  }}
                >
                  {b.title}
                </button>
              ))}
            </div>
          )}
          {books.length === 1 && <div className="card-title mt-2">{book.title}</div>}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="DAY 선택">
            {book.days.map((d) => (
              <label key={d.id} data-day={d.dayNo} className={`chip${sel.includes(d.id) ? " on" : ""}`}>
                <input type="checkbox" className="sr-only" checked={sel.includes(d.id)} onChange={() => toggle(sel, d.id, setSel)} />
                DAY {d.dayNo}
                <span className="chip-sub">{d.count}</span>
              </label>
            ))}
            {book.days.length === 0 && <span className="muted">이 단어장에 DAY가 없습니다.</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(book.days.map((d) => d.id))}>
              전체
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSel([])}>
              해제
            </button>
          </div>
        </section>

        {/* 2. 대상 */}
        <section className="card card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">2 · Who · 대상 반</div>
            <span className="digital">{targets} STUDENTS</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="반 선택">
            {classes.map((c) => (
              <label key={c.id} data-class={c.name} className={`chip${cls.includes(c.id) ? " on" : ""}`}>
                <input type="checkbox" className="sr-only" checked={cls.includes(c.id)} onChange={() => toggle(cls, c.id, setCls)} />
                {c.name}
                <span className="chip-sub">{c.count}</span>
              </label>
            ))}
            {classes.length === 0 && <span className="muted">반이 없습니다. 발행 후 시험 화면에서 학생별로 배정할 수 있습니다.</span>}
          </div>
          <p className="muted mt-2">선택하지 않으면 발행만 하고, 시험 화면에서 학생을 골라 배정합니다.</p>
        </section>

        {/* 3. 조건 */}
        <section className="card card-body">
          <div className="lbl">3 · Rules · 문항 · 통과 · 타이머 · 마감</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="label">문항 수</div>
              <div className="seg">
                {[10, 20, 30, 40].map((n) => (
                  <button key={n} type="button" className={`seg-item${count === n ? " on" : ""}`} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="input mt-2 w-24" aria-label="문항 수 직접 입력" />
            </div>
            <div>
              <div className="label">통과 기준</div>
              <div className="seg">
                {[80, 90, 100].map((n) => (
                  <button key={n} type="button" className={`seg-item${pass === n ? " on" : ""}`} onClick={() => setPass(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <input type="number" min={0} max={100} value={pass} onChange={(e) => setPass(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="input mt-2 w-24" aria-label="통과 기준 직접 입력" />
            </div>
            <div>
              <div className="label">타이머 · 단어당</div>
              <div className="seg" role="radiogroup" aria-label="단어당 시간" data-testid="timer-toggle">
                {([
                  [7, "7초 · 기본"],
                  [12, "12초 · 여유"],
                ] as const).map(([n, l]) => (
                  <button key={n} type="button" role="radio" aria-checked={perWord === n} className={`seg-item${perWord === n ? " on" : ""}`} onClick={() => setPerWord(n)}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="muted mt-2">온라인 응시에서 단어마다 주는 시간. 종이 시험은 제한 없음.</p>
            </div>
            <div>
              <div className="label">마감</div>
              <div className="seg">
                {(
                  [
                    ["today", "오늘"],
                    ["week", "이번 주"],
                    ["custom", "직접"],
                    ["none", "없음"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" className={`seg-item${duePreset === k ? " on" : ""}`} onClick={() => pickDue(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {duePreset !== "none" && <input type="datetime-local" value={due} onChange={(e) => { setDue(e.target.value); setDuePreset("custom"); }} className="input mt-2" aria-label="마감 일시" />}
            </div>
          </div>
          <details className="mt-3">
            <summary className="lbl cursor-pointer">More · 시간 제한 · 공개 설정</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">전체 시간 제한 (분, 0=없음)</label>
                <input className="input" type="number" min={0} max={600} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">점수 공개</label>
                <select className="input" name="scoreVisibility" defaultValue="immediate">
                  <option value="immediate">제출 직후</option>
                  <option value="after_release">선생님 공개 후</option>
                </select>
              </div>
              <div>
                <label className="label">정답·오답노트 공개</label>
                <select className="input" name="answerVisibility" defaultValue="immediate">
                  <option value="immediate">제출 직후 (학생이 바로 오답 확인)</option>
                  <option value="after_release">선생님 공개 후</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="label">시험 이름 (비우면 자동)</label>
                <input className="input" name="title" maxLength={80} placeholder={`${book.title} ${range}`} />
              </div>
            </div>
          </details>
        </section>
      </div>

      {/* 미리보기 + 발행 */}
      <div className="space-y-3 lg:col-span-2">
        <div className="card-accent card-body flex min-h-[300px] flex-col">
          <div className="flex items-center justify-between">
            <div className="lbl-on">Preview · 미리보기</div>
            <button type="button" className="lbl-on hover:underline" onClick={() => setSeed(Math.random().toString(36).slice(2))} disabled={!sel.length}>
              {loading ? "…" : "다시 섞기"}
            </button>
          </div>
          <div className="mt-2 text-[20px] font-semibold leading-tight">{range}</div>
          <div className="lbl-on mt-1">
            {count} Q · Pass {pass}
            {` · ${perWord}s/word`}{timeLimit ? ` · ${timeLimit} min` : ""} · {due ? `due ${due.slice(5, 10).replace("-", "/")} ${due.slice(11)}` : "no due"}
          </div>
          <div className="mt-4 flex-1 space-y-2">
            {!sel.length && <p className="text-[13px]" style={{ color: "rgba(255,244,240,0.8)" }}>범위를 고르면 문항 예시가 나타납니다.</p>}
            {previewMsg && <p className="text-[13px]">{previewMsg}</p>}
            {preview?.map((it, i) => (
              <div key={i} className="rounded-2xl p-3" style={{ background: "rgba(255,244,240,0.14)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-semibold">{it.prompt}</span>
                  <span className="lbl-on">{it.dayLabel}</span>
                </div>
                <ol className="mt-1 grid grid-cols-2 gap-x-3 text-[12px]" style={{ color: "rgba(255,244,240,0.9)" }}>
                  {it.options.map((o, j) => (
                    <li key={j} className={o.isCorrect ? "font-semibold underline" : ""}>
                      {j + 1}. {o.text}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {available > 0 && available < count && <p className="mt-3 text-[12px]">범위 단어 {available}개 &lt; 문항 {count}개 → {available}문항으로 줄여 출제됩니다.</p>}
        </div>
        {state?.error && <p className="text-[13px]" style={{ color: "var(--accent)" }}>{state.error}</p>}
        <button className="btn-primary w-full py-3" disabled={pending || sel.length === 0} name="publishNow" value="on">
          {pending ? "발행 중…" : cls.length ? `발행 · ${targets}명 배정 · 학생 앱에 표시` : "발행 (배정은 시험 화면에서)"}
        </button>
        <button className="btn-ghost w-full" disabled={pending || sel.length === 0} name="publishNow" value="off">
          초안만 저장
        </button>
      </div>
    </form>
  );
}
