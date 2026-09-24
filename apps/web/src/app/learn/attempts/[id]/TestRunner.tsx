"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SpeakButton } from "@/components/Speak";

type DTO = {
  attemptId: string;
  status: string;
  revision: number;
  deadlineAt: string | null;
  serverTime: string;
  exam: { title: string; questionCount: number; timeLimitMin: number | null; secondsPerItem?: number };
  items: { itemId: string; position: number; prompt: string; options: { optionId: string; position: number; text: string }[] }[];
  answers: Record<string, string | null>;
};

type SaveState = "idle" | "saving" | "saved" | "error" | "offline";
const KEYS = ["1", "2", "3", "4"];

/**
 * 게임형 응시 화면 — 단어 하나씩, 크게.
 * - 준비 화면(문항 수 · 초/단어 · 규칙) → [시작] → 3·2·1 → 첫 단어. 새로고침으로 이어 풀 때도 준비 화면을 거친다 (타이머가 갑자기 돌지 않게).
 * - 단어마다 secondsPerItem(기본 7초) 카운트다운 링. 고르면 0.4초 뒤 다음 단어 — 그 사이에 다른 보기를 누르면 바꿀 수 있다. 시간이 다 되면 "시간 초과" 플래시 뒤 무응답으로 넘어간다.
 * - 뒤로 가기 없음. 마지막 단어 뒤 자동 제출.
 * - 탭 반응: 타일 눌림·플래시·진동(모바일), 키보드 1~4.
 * - 답은 고르는 즉시 서버 저장(revision 잠금), 새로고침·재로그인 시 첫 미응답 단어부터 이어진다. 마감은 서버 시각 기준.
 */
export function TestRunner({ attemptId }: { attemptId: string }) {
  const [dto, setDto] = useState<DTO | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [left, setLeft] = useState(7); // 현재 단어 남은 초 (소수)
  const [picked, setPicked] = useState<string | null>(null); // 방금 고른 보기 (플래시)
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [timeouts, setTimeouts] = useState(0);
  const [stage, setStage] = useState<"ready" | "countdown" | "run">("ready");
  const [count, setCount] = useState(3);
  const [flash, setFlash] = useState<"timeout" | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 고른 뒤 바꿀 수 있는 짧은 시간
  const pickedRef = useRef<string | null>(null);
  const revision = useRef(0);
  const pendingQueue = useRef<Map<string, string | null>>(new Map());
  const flushing = useRef(false);
  const clockOffset = useRef(0);
  const itemStart = useRef<number>(0);
  const advancing = useRef(false);
  const router = useRouter();
  const perItem = Math.max(3, dto?.exam.secondsPerItem ?? 7);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/attempts/${attemptId}`);
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error?.message ?? "불러오지 못했습니다.");
      return null;
    }
    const d = j.data as DTO;
    if (d.status !== "in_progress") {
      router.replace(`/learn/results/${attemptId}`);
      return null;
    }
    setDto(d);
    setAnswers(d.answers);
    revision.current = d.revision;
    clockOffset.current = new Date(d.serverTime).getTime() - Date.now();
    const first = d.items.findIndex((it) => !d.answers[it.itemId]);
    setIdx(first === -1 ? d.items.length - 1 : first);
    itemStart.current = Date.now();
    return d;
  }, [attemptId, router]);

  useEffect(() => {
    load();
  }, [load]);

  // 전체 마감 (서버 시각)
  useEffect(() => {
    if (!dto?.deadlineAt) return;
    const dl = new Date(dto.deadlineAt).getTime();
    const t = setInterval(() => {
      const now = Date.now() + clockOffset.current;
      const rem = Math.max(0, Math.floor((dl - now) / 1000));
      setRemaining(rem);
      if (rem === 0) {
        clearInterval(t);
        submit(true);
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto?.deadlineAt]);

  const flush = useCallback(async () => {
    if (flushing.current || pendingQueue.current.size === 0) return;
    flushing.current = true;
    setSave("saving");
    const batch = [...pendingQueue.current.entries()];
    pendingQueue.current.clear();
    try {
      const r = await fetch(`/api/v1/attempts/${attemptId}/answers`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_request_id: crypto.randomUUID(), expected_revision: revision.current, answers: batch.map(([item_id, option_id]) => ({ item_id, option_id })) }),
      });
      const j = await r.json();
      if (r.status === 409 && j.error?.code === "revision_conflict") {
        for (const [k, v] of batch) pendingQueue.current.set(k, v);
        await load();
        flushing.current = false;
        return flush();
      }
      if (r.status === 409) {
        setErr(j.error?.message ?? "저장할 수 없습니다.");
        router.replace(`/learn/results/${attemptId}`);
        return;
      }
      if (!r.ok) throw new Error(j.error?.message ?? "save_failed");
      revision.current = j.data.revision;
      setSave("saved");
    } catch {
      for (const [k, v] of batch) if (!pendingQueue.current.has(k)) pendingQueue.current.set(k, v);
      setSave(navigator.onLine ? "error" : "offline");
      setTimeout(() => {
        flushing.current = false;
        flush();
      }, 3000);
      return;
    }
    flushing.current = false;
    if (pendingQueue.current.size) flush();
  }, [attemptId, load, router]);

  const submit = async (auto = false) => {
    if (!dto || submitting) return;
    setSubmitting(true);
    const pending = [...pendingQueue.current.entries()];
    pendingQueue.current.clear();
    try {
      const r = await fetch(`/api/v1/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expected_revision: revision.current, answers: pending.map(([item_id, option_id]) => ({ item_id, option_id })) }),
      });
      const j = await r.json();
      if (!r.ok && !(r.status === 409 && (j.error?.code === "expired" || j.error?.code === "not_in_progress"))) {
        if (r.status === 409 && j.error?.code === "revision_conflict") {
          await load();
          for (const [k, v] of pending) pendingQueue.current.set(k, v);
          setSubmitting(false);
          return submit(auto);
        }
        throw new Error(j.error?.message ?? "submit_failed");
      }
      router.replace(`/learn/results/${attemptId}`);
    } catch (e) {
      for (const [k, v] of pending) pendingQueue.current.set(k, v);
      setErr(e instanceof Error ? e.message : "제출 실패. 네트워크를 확인하고 다시 시도하세요.");
      setSubmitting(false);
    }
  };

  /** 다음 단어로 (마지막이면 제출) */
  const advance = useCallback(
    (fromIdx: number) => {
      if (!dto || advancing.current) return;
      advancing.current = true;
      if (graceTimer.current) clearTimeout(graceTimer.current);
      graceTimer.current = null;
      setPhase("out");
      setTimeout(() => {
        if (fromIdx >= dto.items.length - 1) {
          submit(true);
          return;
        }
        setIdx(fromIdx + 1);
        setPicked(null);
        pickedRef.current = null;
        setFlash(null);
        itemStart.current = Date.now();
        setLeft(perItem);
        setPhase("in");
        advancing.current = false;
      }, 220);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dto, perItem],
  );

  // 3 · 2 · 1 → 시작
  useEffect(() => {
    if (stage !== "countdown") return;
    if (count <= 0) {
      setStage("run");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [stage, count]);

  // 단어별 카운트다운 (응시 중일 때만 · 이미 고른 단어는 멈춤)
  useEffect(() => {
    if (!dto || submitting || stage !== "run") return;
    itemStart.current = Date.now();
    setLeft(perItem);
    const t = setInterval(() => {
      if (pickedRef.current) return; // 고른 뒤 넘어가는 중
      const l = perItem - (Date.now() - itemStart.current) / 1000;
      setLeft(Math.max(0, l));
      if (l <= 0) {
        clearInterval(t);
        setTimeouts((n) => n + 1);
        setFlash("timeout"); // 놓쳤어요 — 빨간 플래시 + 문구
        try {
          navigator.vibrate?.([30, 40, 30]);
        } catch {}
        setTimeout(() => advance(idx), 320); // 시간 초과: 무응답으로 다음
      }
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto, idx, submitting, stage]);

  const GRACE_MS = 400;
  const choose = (itemId: string, optionId: string) => {
    if (advancing.current || submitting || stage !== "run" || flash) return;
    setAnswers((a) => ({ ...a, [itemId]: optionId }));
    pendingQueue.current.set(itemId, optionId);
    flush();
    setPicked(optionId);
    pickedRef.current = optionId;
    try {
      navigator.vibrate?.(18);
    } catch {}
    // 잘못 눌렀으면 GRACE_MS 안에 다른 보기를 눌러 바꿀 수 있다 — 다시 누르면 시간을 다시 잰다
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = setTimeout(() => advance(idx), GRACE_MS);
  };

  const start = () => {
    setCount(3);
    setStage("countdown");
  };

  // 키보드 1~4 (준비 화면에선 Enter·Space 로 시작)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!dto) return;
      if (stage === "ready" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        start();
        return;
      }
      const k = KEYS.indexOf(e.key);
      if (k === -1) return;
      const it = dto.items[idx];
      const o = it?.options[k];
      if (o) choose(it.itemId, o.optionId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto, idx, stage, flash]);

  if (err && !dto) return <div className="card card-body text-sm" style={{ color: "var(--accent)" }}>{err}</div>;
  if (!dto) return <div className="card card-body text-sm">불러오는 중…</div>;
  const it = dto.items[idx];
  const answered = dto.items.filter((x) => answers[x.itemId]).length;
  const total = dto.items.length;
  const fmt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}H${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  const ringR = 26;
  const ringC = 2 * Math.PI * ringR;
  const frac = Math.max(0, Math.min(1, left / perItem));
  const urgent = left <= 2;
  const resuming = idx > 0 || answered > 0;

  if (stage !== "run") {
    return (
      <div className="mx-auto w-full space-y-3 select-none lg:max-w-[560px]" data-testid="runner-ready" data-stage={stage}>
        <div className="card card-body text-center" style={{ minHeight: 360 }}>
          <div className="lbl">{dto.exam.title}</div>
          {stage === "countdown" ? (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 280 }} aria-live="assertive">
              <div key={count} className="anim-fade-up" style={{ fontFamily: "var(--font-num)", fontWeight: 200, fontSize: 120, lineHeight: 1 }} data-testid="runner-count">
                {count > 0 ? count : "GO"}
              </div>
              <div className="muted mt-4">{count > 0 ? "곧 첫 단어가 나와요" : "시작!"}</div>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-end justify-center gap-6">
                <div>
                  <div className="num-xl">{total}</div>
                  <div className="lbl mt-1">문항</div>
                </div>
                <div>
                  <div className="num-xl">{perItem}</div>
                  <div className="lbl mt-1">초 / 단어</div>
                </div>
                {dto.exam.timeLimitMin ? (
                  <div>
                    <div className="num-xl">{dto.exam.timeLimitMin}</div>
                    <div className="lbl mt-1">분 전체</div>
                  </div>
                ) : null}
              </div>
              <ul className="mx-auto mt-6 max-w-[360px] space-y-1.5 text-left text-[14px]" style={{ color: "var(--ink-2)" }}>
                <li>· 단어가 하나씩 크게 나와요. 뜻을 고르세요 (키보드 1–4).</li>
                <li>· 한 번 고르면 다음 단어로 넘어가요. 잘못 눌렀으면 <b>바로</b> 다른 보기를 누르면 바뀌어요.</li>
                <li>· {perItem}초가 지나면 답 없이 넘어가요. 뒤로 갈 수 없어요.</li>
                <li>· 마지막 단어 뒤에 자동으로 제출돼요.</li>
              </ul>
              {resuming && (
                <p className="mt-4 text-[13px]" style={{ color: "var(--accent)" }}>
                  이어서 풀어요 · {answered}/{total} 답함 · {idx + 1}번부터
                </p>
              )}
              <button type="button" className="btn-primary mt-7 w-full max-w-[360px]" onClick={start} data-testid="runner-start" autoFocus>
                {resuming ? "이어서 시작 →" : "시작 →"}
              </button>
              <p className="muted mt-3">시작을 누르면 3초 뒤 첫 단어가 나와요.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full space-y-3 select-none lg:max-w-[720px]" data-testid="runner">
      {/* 상단: 제목 · 저장 상태 · 전체 남은 시간 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="lbl min-w-0 truncate">{dto.exam.title}</span>
        <span className="flex shrink-0 items-center gap-2">
          <SpeakButton text={it.prompt} size={32} autoKey="runner" />
          <span className="lbl-ink" style={{ letterSpacing: 0.4 }}>
            {remaining !== null && (
              <span className="digital mr-1" style={remaining < 60 ? { color: "var(--accent)" } : undefined}>
                {fmt(remaining)}
              </span>
            )}
            {save === "saving" && "저장 중"}
            {save === "saved" && "저장됨"}
            {save === "error" && <span style={{ color: "var(--accent)" }}>저장 재시도</span>}
            {save === "offline" && <span style={{ color: "var(--accent)" }}>오프라인</span>}
            {save === "idle" && "응시 중"}
          </span>
        </span>
      </div>
      {/* 진행 바: 단어 수 기준 */}
      <div className="flex gap-[3px] px-1" aria-hidden>
        {dto.items.map((x, i) => (
          <div key={x.itemId} className="h-[5px] flex-1 rounded-full" style={{ background: i < idx ? (answers[x.itemId] ? "var(--ink)" : "rgba(232,67,26,0.6)") : i === idx ? "var(--accent)" : "rgba(27,26,24,0.10)", transition: "background-color 200ms" }} />
        ))}
      </div>

      {/* 단어 카드 */}
      <div className={`card card-body relative overflow-hidden ${phase === "in" ? "anim-fade-up" : ""}`} style={{ minHeight: 300, opacity: phase === "out" ? 0 : 1, transform: phase === "out" ? "translateX(-14px)" : "none", transition: "opacity 200ms ease, transform 200ms ease, box-shadow 150ms", boxShadow: flash ? "inset 0 0 0 3px var(--accent)" : undefined, background: flash ? "rgba(232,67,26,0.08)" : undefined }} key={it.itemId} data-flash={flash ?? undefined}>
        {flash === "timeout" && (
          <div className="absolute inset-x-0 top-3 z-10 text-center" aria-live="polite">
            <span className="inline-block rounded-full px-3 py-1 text-[12.5px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }} data-testid="runner-timeout">
              시간 초과 · 놓쳤어요
            </span>
          </div>
        )}
        <div className="flex items-start justify-between">
          <span className="digital-lg">
            {String(it.position).padStart(2, "0")}
            <span style={{ color: "var(--ink-3)" }}>/{String(total).padStart(2, "0")}</span>
          </span>
          {/* 단어별 카운트다운 링 */}
          <div className="relative" style={{ width: 60, height: 60 }} aria-label={`남은 시간 ${Math.ceil(left)}초`}>
            <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
              <circle cx="30" cy="30" r={ringR} fill="none" stroke="rgba(27,26,24,0.10)" strokeWidth="5" />
              <circle cx="30" cy="30" r={ringR} fill="none" stroke={urgent ? "var(--accent)" : "var(--ink)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - frac)} style={{ transition: "stroke-dashoffset 100ms linear, stroke 200ms" }} />
            </svg>
            <span className="digital absolute inset-0 flex items-center justify-center" style={{ fontSize: 18, color: urgent ? "var(--accent)" : "var(--ink)" }}>
              {Math.ceil(left)}
            </span>
          </div>
        </div>
        <div className="my-7 text-center font-bold tracking-tight" style={{ fontFamily: "var(--font-num)", fontWeight: 300, fontSize: "clamp(40px, 12vw, 64px)", lineHeight: 1, wordBreak: "break-word" }}>
          {it.prompt}
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {it.options.map((o, i) => {
            const sel = picked === o.optionId || answers[it.itemId] === o.optionId;
            return (
              <button
                key={o.optionId}
                type="button"
                aria-pressed={sel}
                onPointerDown={(e) => e.currentTarget.classList.add("pressed")}
                onPointerUp={(e) => e.currentTarget.classList.remove("pressed")}
                onPointerLeave={(e) => e.currentTarget.classList.remove("pressed")}
                onClick={() => choose(it.itemId, o.optionId)}
                className="tile flex min-h-[64px] w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left text-[17px] font-medium"
                style={sel ? { background: "var(--accent)", color: "var(--accent-ink)" } : { background: "var(--surface-2)", color: "var(--ink)" }}
              >
                <span className="digital shrink-0" style={{ color: sel ? "rgba(255,244,240,0.8)" : "var(--ink-3)", width: 18 }}>
                  {i + 1}
                </span>
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="lbl-ink" style={{ letterSpacing: 0.4 }}>
          {answered}개 답함 · {timeouts}개 놓침
        </span>
        <span className="lbl-ink" style={{ letterSpacing: 0.4 }}>단어당 {perItem}초 · 키보드 1–4</span>
      </div>
      {err && <p className="px-1 text-xs" style={{ color: "var(--accent)" }}>{err}</p>}
      {submitting && (
        <div className="card-dark card-body text-center">
          <span className="text-[15px] font-semibold" style={{ color: "#ece9e3" }}>제출 중…</span>
        </div>
      )}
    </div>
  );
}
