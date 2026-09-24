"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ActionBar, StepHead } from "@/components/ActionBar";
import { createExamAction, previewItemsAction } from "../actions";

type Book = { id: string; title: string; days: { id: string; dayNo: number; label: string; count: number }[] };
const EMPTY_BOOK: Book = { id: "", title: "단어장", days: [] };
type Cls = { id: string; name: string; count: number };
type Vis = "immediate" | "after_release";
type Preview = { prompt: string; dayLabel: string; options: { text: string; isCorrect: boolean }[] }[];

/* 시각은 전부 'YYYY-MM-DDTHH:mm' (서울 로컬) 문자열로 다룬다 — datetime-local 입력값 그대로 */
function seoulNowLocal() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
}
/** 로컬 문자열에 n일을 더한다 (시:분 유지). 기본 마감 = 시작 + 7일 */
function plusDays(local: string, days: number) {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return local;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days, +m[4], +m[5])).toISOString().slice(0, 16);
}
const fmtLocal = (v: string) => (v ? `${v.slice(5, 10).replace("-", "/")} ${v.slice(11)}` : "");

/**
 * 출제 폼 — 두 가지 진입에 맞춘 두 모드.
 *  - locked : 단어장 상세에서 들어옴. 단어장은 정해져 있고(바꿀 수 없음) 범위 → 대상 → 조건 → 이름·공개를 한 화면에.
 *  - wizard : 시험 탭 [+ 시험 만들기]. 1 단어장 → 2 범위 → 3 대상 → 4 조건 → 5 이름·공개 를 한 단계씩 (이전/다음 동작 바).
 */
type Mode = "locked" | "wizard";
type StepKey = "book" | "range" | "target" | "cond" | "name";
const STEP_META: Record<StepKey, { title: string; hint: string }> = {
  book: { title: "단어장", hint: "어느 단어장에서 낼까요" },
  range: { title: "범위", hint: "어느 DAY를 낼까요" },
  target: { title: "대상", hint: "누가 칠까요 (반 단위)" },
  cond: { title: "조건", hint: "몇 문항 · 몇 점이면 통과 · 단어당 몇 초 · 언제부터 언제까지" },
  name: { title: "이름 · 공개", hint: "비워 두면 범위 이름으로. 점수·정답은 기본으로 바로 공개" },
};

export function NewExamForm({ books, defaultBookId, defaultDays, classes, isOwner = true, mode = "locked" }: { books: Book[]; defaultBookId?: string; defaultDays?: number[]; classes: Cls[]; isOwner?: boolean; mode?: Mode }) {
  const [state, action, pending] = useActionState(createExamAction, undefined);
  const steps: StepKey[] = mode === "wizard" ? ["book", "range", "target", "cond", "name"] : ["range", "target", "cond", "name"];
  const hasDefaultBook = !!defaultBookId && books.some((b) => b.id === defaultBookId);
  // wizard 는 단어장을 "고르는" 단계가 첫 단계 — 링크로 정해져 오지 않았으면 아무것도 골라져 있지 않다 (locked 는 그 단어장 하나)
  const initialBook = hasDefaultBook ? defaultBookId! : mode === "wizard" ? "" : books[0].id;
  const [bookId, setBookId] = useState(initialBook);
  // wizard: 단어장이 링크로 정해져 왔으면 2단계(범위)부터
  const [step, setStep] = useState(mode === "wizard" && hasDefaultBook ? 1 : 0);
  const stepKey = steps[step];
  const no = (k: StepKey) => steps.indexOf(k) + 1;
  const show = (k: StepKey) => mode === "locked" || stepKey === k;
  const book: Book = books.find((b) => b.id === bookId) ?? EMPTY_BOOK;
  const [sel, setSel] = useState<string[]>(() => book.days.filter((d) => defaultDays?.includes(d.dayNo)).map((d) => d.id));
  const [cls, setCls] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [pass, setPass] = useState(90);
  // 기본: 시작 = 지금(출제 즉시), 마감 = 7일 뒤 같은 시각
  const [startPreset, setStartPreset] = useState<"now" | "custom">("now");
  const [startAt, setStartAt] = useState<string>(() => seoulNowLocal());
  const [due, setDue] = useState<string>(() => plusDays(seoulNowLocal(), 7));
  const [duePreset, setDuePreset] = useState<"week1" | "custom" | "none">("week1");
  const [timeLimit, setTimeLimit] = useState(0);
  const [perWord, setPerWord] = useState(7);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const [loading, startPreview] = useTransition();
  const [pi, setPi] = useState(0); // 미리보기에서 보고 있는 문항
  const [title, setTitle] = useState("");
  const [scoreVis, setScoreVis] = useState<Vis>("immediate");
  const [answerVis, setAnswerVis] = useState<Vis>("immediate");

  const available = useMemo(() => book.days.filter((d) => sel.includes(d.id)).reduce((s, d) => s + d.count, 0), [book, sel]);
  // 실제로 나갈 문항 수: 범위 단어가 모자라면 그만큼 (미리보기·요약·시험 상세가 같은 숫자)
  const effCount = available > 0 ? Math.min(count, available) : count;
  const [previewOpen, setPreviewOpen] = useState(false);
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

  // 서버 렌더 시각과 브라우저 시각이 다를 수 있어 마운트 뒤 "지금" 기준으로 한 번 맞춘다
  useEffect(() => {
    const n = seoulNowLocal();
    setStartAt((v) => (startPreset === "now" ? n : v));
    setDue((v) => (duePreset === "week1" ? plusDays(n, 7) : v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const effectiveStart = startPreset === "now" ? seoulNowLocal() : startAt;
  const pickDue = (p: typeof duePreset, base = effectiveStart) => {
    setDuePreset(p);
    if (p === "week1") setDue(plusDays(base, 7));
    if (p === "custom" && !due) setDue(plusDays(base, 7));
    if (p === "none") setDue("");
  };
  const pickStart = (p: typeof startPreset) => {
    setStartPreset(p);
    const base = p === "now" ? seoulNowLocal() : startAt;
    if (p === "custom" && startAt < seoulNowLocal()) setStartAt(seoulNowLocal());
    if (duePreset === "week1") setDue(plusDays(base, 7));
  };
  const dueError = due && effectiveStart && due <= effectiveStart ? "마감이 시작보다 빠르거나 같아요. 마감을 뒤로 잡아 주세요." : null;
  const startLabel = startPreset === "now" ? "시작 지금" : `시작 ${fmtLocal(startAt)}`;
  const dueLabel = due ? `마감 ${fmtLocal(due)}` : "마감 없음";
  const bookWords = (b: Book) => b.days.reduce((s, d) => s + d.count, 0);
  const stepOk: Record<StepKey, boolean> = { book: !!bookId, range: sel.length > 0, target: true, cond: !dueError, name: true };
  const last = step === steps.length - 1;
  const canDraft = !pending && sel.length > 0 && !dueError;
  // 출제(발행)는 대상이 있어야 한다 — 대상 없는 시험(0/0)이 생기지 않게. 초안은 대상 없이도 저장.
  const canSubmit = canDraft && targets > 0;
  const summary = `${range} · ${effCount}문항 · 통과 ${pass} · ${perWord}초 · ${startLabel} · ${dueLabel} · 대상 ${targets}명`;

  return (
    <form
      action={action}
      className="grid gap-5 xl:grid-cols-5"
      data-mode={mode}
      data-step={stepKey}
      onKeyDown={(e) => {
        // Enter 로는 제출하지 않는다 — 암묵적 제출은 폼의 첫 submit 버튼([초안만 저장])을 누른 셈이 되어 출제 대신 초안이 생긴다.
        // 출제·초안은 아래 바의 버튼으로만.
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault();
      }}
    >
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
      <input type="hidden" name="startAt" value={startPreset === "now" ? "now" : startAt} />
      <input type="hidden" name="dueAt" value={due} />

      {mode === "wizard" && (
        <ol className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 xl:col-span-5" aria-label="진행 단계" data-testid="stepper">
          {steps.map((k, i) => (
            <li key={k} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={`chip${i === step ? " on" : ""}`}
                style={i > step ? { opacity: 0.55 } : undefined}
                disabled={i > step}
                onClick={() => i < step && setStep(i)}
                aria-current={i === step ? "step" : undefined}
                data-step-key={k}
              >
                <span className="chip-sub" style={{ marginLeft: 0, marginRight: 6 }}>{i + 1}</span>
                {STEP_META[k].title}
              </button>
              {i < steps.length - 1 && <span className="lbl" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
      )}
      <div className={`space-y-5 ${mode === "wizard" && stepKey === "book" ? "xl:col-span-5" : "xl:col-span-3"}`}>
        {/* wizard 1. 단어장 — 여기서 고른 뒤에는 다음 단계에서 바꾸지 않는다 (바꾸려면 이전으로) */}
        {mode === "wizard" && show("book") && (
          <section className="card card-body" data-testid="step-book">
            <StepHead n={no("book")} title={STEP_META.book.title} hint={STEP_META.book.hint} right={<span className="digital">{books.length}권</span>} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="단어장 선택">
              {books.map((b) => {
                const on = b.id === bookId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-book={b.title}
                    className="flex items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors"
                    style={on ? { background: "var(--ink)", color: "var(--surface-2)" } : { background: "var(--surface-2)", color: "var(--ink)" }}
                    onClick={() => {
                      if (b.id !== bookId) setSel([]);
                      setBookId(b.id);
                      // 하나만 고르는 단계 — 고르면 바로 범위로 넘어간다 (바꾸려면 위 단계 칩으로 돌아오기)
                      if (mode === "wizard" && stepKey === "book") setStep(1);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{b.title}</span>
                      <span className="digital mt-1 block" style={{ fontSize: 11, opacity: 0.7 }}>
                        {bookWords(b)}단어 · DAY {b.days.length}개
                      </span>
                    </span>
                    {on && <span className="lbl" style={{ color: "rgba(250,249,246,0.7)" }}>선택됨</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 범위 */}
        {show("range") && (
        <section className="card card-body" data-testid="step-range">
          <StepHead n={no("range")} title={STEP_META.range.title} hint={STEP_META.range.hint} right={<span className="digital">{available}단어</span>} />
          <div className="mt-2 flex items-center gap-2">
            <span className="card-title">{book.title}</span>
            <span className="digital" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {bookWords(book)}단어 · DAY {book.days.length}개
            </span>
          </div>
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
        )}

        {/* 응시 대상 */}
        {show("target") && (
        <section className="card card-body" data-testid="step-target">
          <StepHead n={no("target")} title={STEP_META.target.title} hint={STEP_META.target.hint} right={<span className="digital">{targets}명</span>} />
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="반 선택">
            {classes.map((c) => (
              <label key={c.id} data-class={c.name} className={`chip${cls.includes(c.id) ? " on" : ""}${c.count === 0 ? " opacity-50" : ""}`} title={c.count === 0 ? (isOwner ? "이 반에 학생이 없어요" : "이 반에는 담당 학생이 없어요") : undefined}>
                <input type="checkbox" className="sr-only" checked={cls.includes(c.id)} onChange={() => toggle(cls, c.id, setCls)} disabled={c.count === 0} />
                {c.name}
                <span className="chip-sub">{c.count}</span>
              </label>
            ))}
            {classes.length === 0 && <span className="muted">반이 없어요.</span>}
          </div>
        </section>
        )}

        {/* 조건 */}
        {show("cond") && (
        <section className="card card-body" data-testid="step-cond">
          <StepHead n={no("cond")} title={STEP_META.cond.title} hint={STEP_META.cond.hint} />
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
              <div className="flex items-center gap-2" data-testid="timer-stepper">
                <div className="seg">
                  {[5, 7, 10].map((n) => (
                    <button key={n} type="button" className={`seg-item${perWord === n ? " on" : ""}`} onClick={() => setPerWord(n)} data-testid={`timer-${n}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center overflow-hidden rounded-full" style={{ border: "1px solid var(--line)", background: "var(--surface-2)" }}>
                  <button type="button" className="px-3 py-1.5 text-[14px] hover:bg-[rgba(27,26,24,0.06)]" onClick={() => setPerWord(Math.max(3, perWord - 1))} aria-label="1초 줄이기" data-testid="timer-down">
                    −
                  </button>
                  <input
                    type="number"
                    min={3}
                    max={60}
                    value={perWord}
                    onChange={(e) => setPerWord(Math.max(3, Math.min(60, Number(e.target.value) || 7)))}
                    className="w-12 bg-transparent text-center outline-none"
                    style={{ fontFamily: "var(--font-num)", fontSize: 20, MozAppearance: "textfield" }}
                    aria-label="단어당 시간(초)"
                    data-testid="timer-input"
                  />
                  <button type="button" className="px-3 py-1.5 text-[14px] hover:bg-[rgba(27,26,24,0.06)]" onClick={() => setPerWord(Math.min(60, perWord + 1))} aria-label="1초 늘리기" data-testid="timer-up">
                    +
                  </button>
                </div>
                <span className="text-[13px] font-semibold">초</span>
              </div>
              <p className="muted mt-2">온라인만 적용. 종이 시험은 제한 없음.</p>
            </div>
            <div>
              <div className="label">전체 시간 제한 (분 · 0 = 없음)</div>
              <input className="input w-28" type="number" min={0} max={600} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) || 0)} aria-label="전체 시간 제한" />
            </div>
            {/* 기간: 시작(기본 지금) · 마감(기본 7일 뒤) */}
            <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2" data-testid="period">
              <div>
                <div className="label">시작</div>
                <div className="seg" role="radiogroup" aria-label="시작 시각">
                  {(
                    [
                      ["now", "지금"],
                      ["custom", "예약"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={startPreset === k} className={`seg-item${startPreset === k ? " on" : ""}`} onClick={() => pickStart(k)} data-testid={`start-${k}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {startPreset === "custom" ? (
                  <input type="datetime-local" value={startAt} min={seoulNowLocal()} onChange={(e) => { setStartAt(e.target.value); if (duePreset === "week1") setDue(plusDays(e.target.value, 7)); }} className="input mt-2" aria-label="시작 일시" data-testid="start-input" />
                ) : null}
              </div>
              <div>
                <div className="label">마감</div>
                <div className="seg" role="radiogroup" aria-label="마감">
                  {(
                    [
                      ["week1", "1주 뒤"],
                      ["custom", "직접"],
                      ["none", "없음"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={duePreset === k} className={`seg-item${duePreset === k ? " on" : ""}`} onClick={() => pickDue(k)} data-testid={`due-${k}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {duePreset !== "none" && <input type="datetime-local" value={due} readOnly={duePreset === "week1"} onChange={(e) => { setDue(e.target.value); setDuePreset("custom"); }} className="input mt-2" style={duePreset === "week1" ? { color: "var(--ink-2)" } : undefined} aria-label="마감 일시" data-testid="due-input" />}
                {dueError && (
                  <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent)" }} role="alert" data-testid="due-error">
                    {dueError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* 이름 · 공개 */}
        {show("name") && (
        <section className="card card-body" data-testid="options">
          <StepHead n={no("name")} title={STEP_META.name.title} hint={STEP_META.name.hint} />
          <div className="mt-3 grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <div className="label">시험 이름</div>
              <input className="input" name="title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${book.title} ${range} (비우면 이대로)`} />
            </div>
            <div>
              <div className="label">점수 공개</div>
              <select className="input" name="scoreVisibility" value={scoreVis} onChange={(e) => setScoreVis(e.target.value as Vis)} data-testid="score-vis">
                <option value="immediate">제출 직후</option>
                <option value="after_release">선생님이 공개한 뒤</option>
              </select>
            </div>
            <div>
              <div className="label">정답 · 오답노트 공개</div>
              <select className="input" name="answerVisibility" value={answerVis} onChange={(e) => setAnswerVis(e.target.value as Vis)} data-testid="answer-vis">
                <option value="immediate">제출 직후 · 바로 오답 확인</option>
                <option value="after_release">선생님이 공개한 뒤</option>
              </select>
            </div>
          </div>
        </section>
        )}
      </div>

      {/* 미리보기(학생 응시 화면 그대로) + 발행 — wizard 는 단어장을 고른 뒤부터 */}
      <div className="space-y-3 xl:col-span-2 xl:sticky xl:top-6 xl:self-start" style={mode === "wizard" && stepKey === "book" ? { display: "none" } : undefined}>
        {/* 휴대폰: 미리보기는 접어 두고 필요할 때 펼친다 (단계 입력과 [다음]이 먼저 보이게) */}
        <button type="button" className="btn-secondary w-full xl:hidden" onClick={() => setPreviewOpen(!previewOpen)} aria-expanded={previewOpen} data-testid="preview-toggle">
          {previewOpen ? "학생 화면 미리보기 접기 ▴" : `학생 화면 미리보기 ▾ · ${effCount}문항`}
        </button>
        <div className={`rounded-[26px] p-3 ${previewOpen ? "" : "max-xl:hidden"}`} style={{ background: "var(--charcoal)" }} data-testid="preview-runner">
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="lbl" style={{ color: "rgba(236,233,227,0.6)" }}>
              학생 화면 미리보기
            </span>
            <button type="button" className="lbl hover:underline" style={{ color: "rgba(236,233,227,0.85)" }} onClick={() => setSeed(Math.random().toString(36).slice(2))} disabled={!sel.length}>
              {loading ? "…" : "다시 섞기 ↻"}
            </button>
          </div>
          {/* 학생 앱 화면 틀 */}
          <div className="mt-2 rounded-[20px] p-3" style={{ background: "var(--bg)" }}>
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="lbl min-w-0 truncate">{title || (sel.length ? `${book.title} ${range}` : "범위를 고르세요")}</span>
              <span className="digital">준비</span>
            </div>
            <div className="mt-2 flex gap-[3px] px-1" aria-hidden>
              {Array.from({ length: Math.min(effCount, 30) }).map((_, i) => (
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
                      <span style={{ color: "var(--ink-3)" }}>/{String(effCount).padStart(2, "0")}</span>
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
                  <div className="my-6 text-center tracking-tight" style={{ fontFamily: "var(--font-num)", fontWeight: 300, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.05, overflowWrap: "anywhere" }}>
                    {preview[pi].prompt}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {preview[pi].options.map((o, j) => (
                      <div key={j} className="flex min-h-[54px] items-center gap-3 rounded-[18px] px-4 py-2.5 text-[15px] font-medium" style={{ background: "var(--surface-2)", color: "var(--ink)" }}>
                        <span className="digital shrink-0" style={{ color: "var(--ink-3)", width: 16 }}>
                          {j + 1}
                        </span>
                        <span className="min-w-0 flex-1" style={{ wordBreak: "keep-all" }}>{o.text}</span>
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
              <span className="lbl">단어당 {perWord}초 · 키보드 1–4</span>
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
            <b>{range}</b> · {effCount}문항 · 통과 {pass}점 · 단어당 {perWord}초{timeLimit ? ` · 전체 ${timeLimit}분` : ""} · {startLabel} · {dueLabel} · 대상 {targets}명
            {available > 0 && available < count && <span style={{ color: "#ffd9cc" }}> · 범위 단어 {available}개라 {available}문항으로 출제</span>}
            <span className="block" style={{ color: "rgba(236,233,227,0.55)" }}>
              ✓ 정답 표시는 선생님에게만 보여요.
            </span>
          </div>
        </div>
        {state?.error && <p className="text-[13px]" style={{ color: "var(--accent)" }}>{state.error}</p>}
      </div>

      {/* 다음 동작 바: locked 는 출제, wizard 는 이전/다음 → 마지막에 출제.
          key 를 꼭 둔다: React 가 자리만 같은 [다음](type=button) 버튼 DOM 을 [초안](submit) 으로 재사용하면
          클릭의 기본 동작이 그 submit 버튼으로 폼을 제출해 버린다 (조건 → 이름으로 넘어가며 초안이 만들어지던 버그). */}
      <div className="sticky bottom-3 z-20 xl:col-span-5">
        {mode === "wizard" && !last ? (
          <ActionBar testId="compose-bar" note={`${step + 1} / ${steps.length} · ${STEP_META[stepKey].title}${!stepOk[stepKey] ? (stepKey === "book" ? " · 단어장을 고르세요" : stepKey === "range" ? " · DAY를 고르세요" : stepKey === "cond" ? " · 마감을 시작 뒤로" : "") : sel.length ? ` · ${summary}` : ""}`}>
            {step > 0 && (
              <button key="prev" type="button" className="btn-ghost" onClick={(e) => { e.preventDefault(); setStep(step - 1); }} data-testid="compose-prev">
                ← {STEP_META[steps[step - 1]].title}
              </button>
            )}
            <button key="next" type="button" className={stepOk[stepKey] ? "btn-primary" : "btn-secondary"} disabled={!stepOk[stepKey]} onClick={(e) => { e.preventDefault(); setStep(step + 1); }} data-testid="compose-next">
              다음 · {STEP_META[steps[step + 1]].title} →
            </button>
          </ActionBar>
        ) : (
          <ActionBar testId="compose-bar" note={sel.length === 0 ? `${no("range")} · 범위에서 DAY를 고르세요` : dueError ? `${no("cond")} · 마감을 시작 뒤로 잡아 주세요` : targets === 0 ? `${no("target")} · 대상 반을 골라야 출제돼요 (초안은 저장 가능)` : summary}>
            {mode === "wizard" && (
              <button key="prev" type="button" className="btn-ghost" onClick={(e) => { e.preventDefault(); setStep(step - 1); }} data-testid="compose-prev">
                ← {STEP_META[steps[step - 1]].title}
              </button>
            )}
            <button key="draft" type="submit" className="btn-ghost" disabled={!canDraft} name="publishNow" value="off" data-testid="compose-draft">
              초안만 저장
            </button>
            <button key="submit" type="submit" className="btn-primary" disabled={!canSubmit} name="publishNow" value="on" data-testid="compose-submit" title={targets === 0 ? "대상 반을 골라야 출제할 수 있어요" : undefined}>
              {pending ? "출제 중…" : targets ? `출제 · ${targets}명에게 →` : "대상을 고르면 출제 →"}
            </button>
          </ActionBar>
        )}
      </div>
    </form>
  );
}
