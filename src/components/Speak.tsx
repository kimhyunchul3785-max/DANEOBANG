"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** 브라우저 TTS 로 영어 단어 발음. 지원하지 않는 브라우저에서는 버튼이 흐려진다. */
export function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.92;
  const voices = synth.getVoices();
  const v = voices.find((x) => x.lang === lang && /Google|Samantha|Daniel|Karen|Natural|Neural/i.test(x.name)) ?? voices.find((x) => x.lang === lang) ?? voices.find((x) => x.lang.startsWith("en"));
  if (v) u.voice = v;
  synth.speak(u);
  return true;
}

export function SpeakButton({ text, size = 36, light = false, autoKey, className }: { text: string; size?: number; light?: boolean; autoKey?: string; className?: string }) {
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const last = useRef<string | null>(null);
  useEffect(() => {
    setOk(typeof window !== "undefined" && "speechSynthesis" in window);
    if (autoKey) {
      try {
        setAuto(localStorage.getItem("db_autospeak") === "1");
      } catch {}
    }
  }, [autoKey]);
  const play = useCallback(() => {
    if (!speak(text)) return;
    setBusy(true);
    setTimeout(() => setBusy(false), 700);
  }, [text]);
  // 자동 발음: 단어가 바뀔 때마다
  useEffect(() => {
    if (!auto || !autoKey || last.current === text) return;
    last.current = text;
    const t = setTimeout(play, 150);
    return () => clearTimeout(t);
  }, [auto, autoKey, text, play]);
  const toggleAuto = () => {
    const n = !auto;
    setAuto(n);
    try {
      localStorage.setItem("db_autospeak", n ? "1" : "0");
    } catch {}
  };
  const fg = light ? "#fff4f0" : "var(--ink)";
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={play}
        disabled={!ok}
        aria-label={`${text} 발음 듣기`}
        title={ok ? "발음 듣기" : "이 브라우저는 음성을 지원하지 않습니다"}
        className="inline-flex items-center justify-center rounded-full transition-transform active:scale-95"
        style={{ width: size, height: size, background: light ? "rgba(255,244,240,0.18)" : "rgba(27,26,24,0.06)", color: fg, opacity: ok ? 1 : 0.35 }}
        data-testid="speak"
      >
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" className={busy ? "anim-fade" : ""} />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" className={busy ? "anim-fade" : ""} style={{ opacity: busy ? 1 : 0.5 }} />
        </svg>
      </button>
      {autoKey && (
        <button type="button" onClick={toggleAuto} className="lbl" style={{ color: auto ? fg : light ? "rgba(255,244,240,0.55)" : "var(--ink-3)", fontSize: 9.5 }} aria-pressed={auto} title="단어가 바뀔 때 자동으로 읽기">
          AUTO {auto ? "ON" : "OFF"}
        </button>
      )}
    </span>
  );
}
