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
  const [pi, setPi] = useState(0); // 미리보기에서 보고 있는 문항
  const [title, setTitle] = useState("");

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
          setPi(0);
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
    <form action={action} className="grid gap-5 lg:grid-cols-5">
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

      <div className="space-y-5 lg:col-span-3">
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

        {/* 2. 응시 대상 */}
        <section className="card card-body">
          <div className="flex items-center justify-between">
            <div className="lbl">2 · Targets · 응시 대상 (반)</div>
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
            {classes.length === 0 && <span className="muted">반이 없습니다. 출제 후 시험 상세 2단계(응시 대상)에서 학생을 추가할 수 있습니다.</span>}
          </div>
          <p className="muted mt-2">고른 반의 학생 전원에게 출제됩니다. 대상은 출제 뒤 시험 상세 → <b>응시 대상</b> 단계에서 추가·제외할 수 있습니다.</p>
        </section>

        {/* 3. 조건 */}
        <section className="card card-body">
          <div className="lbl">3 · Rules · 문항 · 통과 · 타이머 · 마감</div>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
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
              <div className="label">타이머 · 단어당 (초)</div>
              <div className="flex items-stretch" data-testid="timer-stepper">
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={perWord}
                  onChange={(e) => setPerWord(Math.max(3, Math.min(60, Number(e.target.value) || 7)))}
                  className="input w-24 rounded-r-none text-center"
                  style={{ fontFamily: "var(--font-num)", fontSize: 22 }}
                  aria-label="단어당 시간(초)"
                  data-testid="timer-input"
                />
                <div className="flex flex-col overflow-hidden rounded-r-[12px]" style={{ border: "1px solid var(--line)", borderLeft: "none" }}>
                  <button type="button" className="flex-1 px-3 text-[11px] hover:bg-[rgba(27,26,24,0.06)]" onClick={() => setPerWord(Math.min(60, perWord + 1))} aria-label="1초 늘리기" data-testid="timer-up">
                    ▲
                  </button>
                  <button type="button" className="flex-1 px-3 text-[11px] hover:bg-[rgba(27,26,24,0.06)]" style={{ borderTop: "1px solid var(--line)" }} onClick={() => setPerWord(Math.max(3, perWord - 1))} aria-label="1초 줄이기" data-testid="timer-down">
                    ▼
                  </button>
                </div>
                <div className="ml-3 flex flex-col justify-center">
                  <span className="text-[13px] font-semibold">초 / 단어</span>
                  {perWord !== 7 ? (
                    <button type="button" className="lbl-ink text-left hover:underline" onClick={() => setPerWord(7)}>
                      기본 7초로
                    </button>
                  ) : (
                    <span className="lbl">기본</span>
                  )}
                </div>
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
        </section>

        {/* 4. 세부 설정 (항상 펼침) */}
        <section className="card card-body" data-testid="options">
          <div className="lbl">4 · Options · 이름 · 공개 · 전체 시간</div>
          <div className="mt-3 grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <div className="label">시험 이름</div>
              <input className="input" name="title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${book.title} ${range} (비우면 이대로)`} />
            </div>
            <div>
              <div className="label">점수 공개</div>
              <select className="input" name="scoreVisibility" defaultValue="immediate">
                <option value="immediate">제출 직후</option>
                <option value="after_release">선생님이 공개한 뒤</option>
              </select>
            </div>
            <div>
              <div className="label">정답 · 오답노트 공개</div>
              <select className="input" name="answerVisibility" defaultValue="immediate">
                <option value="immediate">제출 직후 (바로 오답 확인·연습)</option>
                <option value="after_release">선생님이 공개한 뒤</option>
              </select>
            </div>
            <div>
              <div className="label">전체 시간 제한 (분 · 0 = 없음)</div>
              <input className="input" type="number" min={0} max={600} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) || 0)} aria-label="전체 시간 제한" />
              <p className="muted mt-1">단어당 시간과 별개로 시험 전체에 거는 상한.</p>
            </div>
          </div>
        </section>
      </div>

      {/* 미리보기(학생 응시 화면 그대로) + 발행 */}
      <div className="space-y-3 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-[26px] p-3" style={{ background: "var(--charcoal)" }} data-testid="preview-runner">
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="lbl" style={{ color: "rgba(236,233,227,0.6)" }}>
              Preview · 학생 화면
            </span>
            <button type="button" className="lbl hover:underline" style={{ color: "rgba(236,233,227,0.85)" }} onClick={() => setSeed(Math.random().toString(36).slice(2))} disabled={!sel.length}>
              {loading ? "…" : "다시 섞기 ↻"}
            </button>
          </div>
          {/* 학생 앱 화면 틀 */}
          <div className="mt-2 rounded-[20px] p-3" style={{ background: "var(--bg)" }}>
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="lbl min-w-0 truncate">{title || `${book.title} ${range}`}</span>
              <span className="digital">READY</span>
            </div>
            <div className="mt-2 flex gap-[3px] px-1" aria-hidden>
              {Array.from({ length: Math.min(count, 30) }).map((_, i) => (
                <div key={i} className="h-[5px] flex-1 rounded-full" style={{ background: i === pi ? "var(--accent)" : i < pi ? "var(--ink)" : "rgba(27,26,24,0.10)" }} />
              ))}
            </div>
            <div className="card card-body mt-2" style={{ minHeight: 280 }}>
              {!sel.length ? (
                <p className="muted">범위(DAY)를 고르면 학생이 보게 될 화면이 여기에 나타납니다.</p>
              ) : previewMsg ? (
                <p className="text-[13px]">{previewMsg}</p>
              ) : preview && preview[pi] ? (
                <>
                  <div className="flex items-start justify-between">
                    <span className="digital-lg">
                      {String(pi + 1).padStart(2, "0")}
                      <span style={{ color: "var(--ink-3)" }}>/{String(count).padStart(2, "0")}</span>
                    </span>
                    <div className="relative" style={{ width: 52, height: 52 }} aria-label={`단어당 ${perWord}초`}>
                      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
                        <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(27,26,24,0.10)" strokeWidth="5" />
                        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 22} strokeDashoffset={2 * Math.PI * 22 * 0.15} />
                      </svg>
                      <span className="digital absolute inset-0 flex items-center justify-center" style={{ fontSize: 16 }}>
                        {perWord}
                      </span>
                    </div>
                  </div>
                  <div className="my-6 text-center tracking-tight" style={{ fontFamily: "var(--font-num)", fontWeight: 300, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1, wordBreak: "break-word" }}>
                    {preview[pi].prompt}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {preview[pi].options.map((o, j) => (
                      <div key={j} className="flex min-h-[54px] items-center gap-3 rounded-[18px] px-4 py-2.5 text-[15px] font-medium" style={{ background: "var(--surface-2)", color: "var(--ink)" }}>
                        <span className="digital shrink-0" style={{ color: "var(--ink-3)", width: 16 }}>
                          {j + 1}
                        </span>
                        <span className="min-w-0 flex-1">{o.text}</span>
                        {o.isCorrect && (
                          <span className="lbl shrink-0" style={{ color: "var(--ok)" }} title="정답 (학생에게는 안 보임)">
                            ✓ 정답
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">문항을 만드는 중…</p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="lbl">{perWord}s / word · 1–4 keys</span>
              {preview && preview.length > 1 && (
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setPi((pi - 1 + preview.length) % preview.length)} aria-label="이전 예시">
                    ‹
                  </button>
                  <span className="digital" style={{ fontSize: 11 }}>
                    예시 {pi + 1}/{preview.length}
                  </span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setPi((pi + 1) % preview.length)} aria-label="다음 예시" data-testid="preview-next">
                    ›
                  </button>
                </span>
              )}
            </div>
          </div>
          <div className="px-2 pb-1 pt-3 text-[12px]" style={{ color: "rgba(236,233,227,0.8)" }}>
            <b>{range}</b> · {count}문항 · 통과 {pass}점 · 단어당 {perWord}초{timeLimit ? ` · 전체 ${timeLimit}분` : ""} · {due ? `마감 ${due.slice(5, 10).replace("-", "/")} ${due.slice(11)}` : "마감 없음"} · 대상 {targets}명
            {available > 0 && available < count && <span style={{ color: "#ffd9cc" }}> · 범위 단어 {available}개라 {available}문항으로 출제</span>}
            <span className="block" style={{ color: "rgba(236,233,227,0.55)" }}>
              ✓ 정답 표시는 선생님 미리보기에만 보입니다.
            </span>
          </div>
        </div>
        {state?.error && <p className="text-[13px]" style={{ color: "var(--accent)" }}>{state.error}</p>}
        <button className="btn-primary w-full py-3" disabled={pending || sel.length === 0} name="publishNow" value="on">
          {pending ? "출제 중…" : cls.length ? `출제 · ${targets}명에게 · 학생 앱에 바로 표시` : "발행만 (대상은 시험 상세에서 추가)"}
        </button>
        <button className="btn-ghost w-full" disabled={pending || sel.length === 0} name="publishNow" value="off">
          초안만 저장
        </button>
      </div>
    </form>
  );
}
