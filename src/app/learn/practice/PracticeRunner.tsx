"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SpeakButton, speak } from "@/components/Speak";
import type { PracticeWord } from "@/lib/practice";

/**
 * 개인 연습 — 틀린 단어만 모은 random test.
 * - 전부 브라우저 안에서만 돈다. 서버에 아무것도 저장하지 않으므로 선생님 대시보드에는 보이지 않는다.
 * - 시간 제한 없음. 고르면 바로 맞음/틀림을 보여주고 정답을 표시한 뒤 다음 단어로.
 * - 영→한(뜻 고르기) / 한→영(단어 고르기), 한 바퀴 끝나면 틀린 것만 다시 · 전부 다시(섞기).
 * - 우측 상단 스피커: 발음 듣기 · AUTO 면 단어가 바뀔 때마다 자동 재생.
 */
type Mode = "en2ko" | "ko2en";
type Q = { w: PracticeWord; prompt: string; options: string[]; answer: string };
const KEYS = ["1", "2", "3", "4"];

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function buildRound(words: PracticeWord[], mode: Mode, meaningPool: string[], englishPool: string[]): Q[] {
  return shuffle(words).map((w) => {
    if (mode === "en2ko") {
      const own = shuffle(w.distractors.filter((d) => d !== w.meaning)).slice(0, 2);
      const rest = shuffle(meaningPool.filter((m) => m !== w.meaning && !own.includes(m))).slice(0, 3 - own.length);
      return { w, prompt: w.english, answer: w.meaning, options: shuffle([w.meaning, ...own, ...rest]) };
    }
    const rest = shuffle(englishPool.filter((e) => e.toLowerCase() !== w.english.toLowerCase())).slice(0, 3);
    return { w, prompt: w.meaning, answer: w.english, options: shuffle([w.english, ...rest]) };
  });
}

export function PracticeRunner({ title, words, meaningPool, englishPool, backHref, backLabel }: { title: string; words: PracticeWord[]; meaningPool: string[]; englishPool: string[]; backHref: string; backLabel: string }) {
  const [mode, setMode] = useState<Mode>("en2ko");
  const [round, setRound] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [rounds, setRounds] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const advancing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(
    (subset: PracticeWord[], m: Mode) => {
      if (timer.current) clearTimeout(timer.current);
      advancing.current = false;
      setRound(buildRound(subset, m, meaningPool, englishPool));
      setIdx(0);
      setPicked(null);
      setResults([]);
      setPhase("in");
      setRounds((n) => n + 1);
    },
    [meaningPool, englishPool],
  );

  // 첫 라운드는 클라이언트에서만 (섞기 때문에 SSR 과 다르면 안 됨)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("db_practice_mode") as Mode | null;
      if (saved === "en2ko" || saved === "ko2en") {
        setMode(saved);
        start(words, saved);
        return;
      }
    } catch {}
    start(words, "en2ko");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    try {
      localStorage.setItem("db_practice_mode", m);
    } catch {}
    start(words, m);
  };

  const q = round?.[idx];
  const done = !!round && idx >= round.length;
  const correctCount = results.filter(Boolean).length;
  const missed = useMemo(() => (round ? round.filter((_, i) => results[i] === false).map((x) => x.w) : []), [round, results]);

  const choose = (opt: string) => {
    if (!q || picked || advancing.current) return;
    const ok = opt === q.answer;
    setPicked(opt);
    setResults((r) => [...r, ok]);
    try {
      navigator.vibrate?.(ok ? 14 : [30, 40, 30]);
    } catch {}
    if (mode === "ko2en" && !ok) speak(q.answer); // 틀리면 정답 단어를 한 번 읽어 준다
    advancing.current = true;
    timer.current = setTimeout(
      () => {
        setPhase("out");
        timer.current = setTimeout(() => {
          setIdx((i) => i + 1);
          setPicked(null);
          setPhase("in");
          advancing.current = false;
        }, 180);
      },
      ok ? 550 : 1300,
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS.indexOf(e.key);
      if (k === -1 || !q) return;
      const o = q.options[k];
      if (o) choose(o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const speakText = q ? q.w.english : missed[0]?.english ?? words[0]?.english ?? "";

  return (
    <div className="mx-auto w-full space-y-3 select-none lg:max-w-[640px]" data-testid="practice">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <Link href={backHref} className="lbl-ink shrink-0">
            ← {backLabel}
          </Link>
          <span className="lbl min-w-0 truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {speakText && <SpeakButton text={speakText} size={32} autoKey="practice" />}
          <span className="digital">PRACTICE</span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <div className="seg" role="tablist" aria-label="연습 방향">
          <button type="button" role="tab" aria-selected={mode === "en2ko"} className={`seg-item${mode === "en2ko" ? " on" : ""}`} onClick={() => switchMode("en2ko")}>
            영 → 한
          </button>
          <button type="button" role="tab" aria-selected={mode === "ko2en"} className={`seg-item${mode === "ko2en" ? " on" : ""}`} onClick={() => switchMode("ko2en")}>
            한 → 영
          </button>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={() => start(words, mode)} title="순서와 보기를 다시 섞습니다">
          섞기 ↻
        </button>
      </div>

      {words.length === 0 ? (
        <div className="card card-body">
          <div className="lbl">Nothing to practice</div>
          <p className="muted mt-2">틀린 단어가 없습니다. 잘했어요!</p>
        </div>
      ) : !round ? (
        <div className="card card-body text-sm">준비 중…</div>
      ) : done ? (
        <div className={`${missed.length === 0 ? "card-dark" : "card-accent"} card-body anim-fade-up`} data-testid="practice-done">
          <div className="flex items-start justify-between">
            <div className="lbl" style={{ color: missed.length === 0 ? "rgba(236,233,227,0.55)" : "rgba(255,244,240,0.8)" }}>
              Round {rounds} · {mode === "en2ko" ? "영 → 한" : "한 → 영"}
            </div>
            <span className="digital">{Math.round((correctCount / round.length) * 100)}%</span>
          </div>
          <div className="num-xl mt-2">
            {correctCount}
            <span style={{ opacity: 0.45, fontSize: "0.5em" }}>/{round.length}</span>
          </div>
          <div className="mt-1 text-[13px]" style={{ opacity: 0.85 }}>
            {missed.length === 0 ? "전부 맞혔습니다. 한 번 더 섞어서 확인해 보세요." : `${missed.length}개를 아직 헷갈립니다.`}
          </div>
          <div className="mt-4 grid gap-2">
            {missed.length > 0 && (
              <button type="button" className="btn w-full py-3" style={{ background: "var(--accent-ink)", color: "var(--accent)" }} onClick={() => start(missed, mode)} data-testid="practice-missed">
                틀린 {missed.length}개만 다시
              </button>
            )}
            <button type="button" className={`${missed.length === 0 ? "btn" : "btn-secondary"} w-full py-3`} style={missed.length === 0 ? { background: "#ece9e3", color: "#1b1a18" } : undefined} onClick={() => start(words, mode)}>
              전부 다시 · 섞기
            </button>
          </div>
          {missed.length > 0 && (
            <ul className="mt-4">
              {missed.map((w) => (
                <li key={w.english} className="flex items-center justify-between gap-2 py-2" style={{ borderTop: "1px solid rgba(255,244,240,0.2)" }}>
                  <span className="min-w-0">
                    <span className="text-[15px] font-semibold">{w.english}</span>
                    <span className="ml-2 text-[12.5px]" style={{ opacity: 0.85 }}>
                      {w.meaning}
                    </span>
                  </span>
                  <SpeakButton text={w.english} size={28} light />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : q ? (
        <>
          <div className="flex gap-[3px] px-1" aria-hidden>
            {round.map((x, i) => (
              <div key={`${x.w.english}-${i}`} className="h-[5px] flex-1 rounded-full" style={{ background: i < idx ? (results[i] ? "var(--ok)" : "var(--accent)") : i === idx ? "var(--ink)" : "rgba(27,26,24,0.10)", transition: "background-color 200ms" }} />
            ))}
          </div>
          <div className={`card card-body relative overflow-hidden ${phase === "in" ? "anim-fade-up" : ""}`} style={{ minHeight: 300, opacity: phase === "out" ? 0 : 1, transform: phase === "out" ? "translateX(-14px)" : "none", transition: "opacity 180ms ease, transform 180ms ease" }} key={`${q.w.english}-${idx}`}>
            <div className="flex items-start justify-between">
              <span className="digital-lg">
                {String(idx + 1).padStart(2, "0")}
                <span style={{ color: "var(--ink-3)" }}>/{String(round.length).padStart(2, "0")}</span>
              </span>
              <span className="lbl" style={{ color: picked ? (picked === q.answer ? "var(--ok)" : "var(--accent)") : "var(--ink-3)" }}>
                {picked ? (picked === q.answer ? "CORRECT" : "WRONG") : "NO TIMER"}
              </span>
            </div>
            <div className="my-7 text-center tracking-tight" style={{ fontFamily: "var(--font-num)", fontWeight: 300, fontSize: mode === "en2ko" ? "clamp(40px, 12vw, 64px)" : "clamp(24px, 7vw, 36px)", lineHeight: 1.1, wordBreak: "keep-all" }}>
              {q.prompt}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {q.options.map((o, i) => {
                const isAns = o === q.answer;
                const isPick = picked === o;
                let style: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)" };
                if (picked && isAns) style = { background: "var(--ok)", color: "#fff" };
                else if (isPick && !isAns) style = { background: "var(--accent)", color: "var(--accent-ink)" };
                else if (picked) style = { background: "var(--surface-2)", color: "var(--ink-3)" };
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={isPick}
                    disabled={!!picked}
                    onPointerDown={(e) => e.currentTarget.classList.add("pressed")}
                    onPointerUp={(e) => e.currentTarget.classList.remove("pressed")}
                    onPointerLeave={(e) => e.currentTarget.classList.remove("pressed")}
                    onClick={() => choose(o)}
                    className="tile flex min-h-[64px] w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left text-[17px] font-medium"
                    style={style}
                  >
                    <span className="digital shrink-0" style={{ color: picked && isAns ? "rgba(255,255,255,0.8)" : isPick ? "rgba(255,244,240,0.8)" : "var(--ink-3)", width: 18 }}>
                      {i + 1}
                    </span>
                    <span>{o}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="lbl">
              {correctCount} correct · {results.length - correctCount} wrong
            </span>
            <span className="lbl">{q.w.from ? q.w.from : "1–4 keys"}</span>
          </div>
        </>
      ) : null}

      <p className="muted px-1 text-center" style={{ fontSize: 11.5 }}>
        개인 연습입니다. 기록은 저장되지 않고 선생님에게 보이지 않습니다.
      </p>
    </div>
  );
}
