"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DTO = {
  attemptId: string;
  status: string;
  revision: number;
  deadlineAt: string | null;
  serverTime: string;
  exam: { title: string; questionCount: number; timeLimitMin: number | null };
  items: { itemId: string; position: number; prompt: string; options: { optionId: string; position: number; text: string }[] }[];
  answers: Record<string, string | null>;
};

type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

/**
 * 학생 응시 화면 (최대 420px). 한 화면에 한 문항.
 * - 선택 즉시 서버 저장 (revision 낙관적 잠금), 실패 시 재시도, 오프라인 임시 보관
 * - 새로고침/재로그인 시 서버 저장값 복원
 * - 마감은 서버 시각 기준
 */
export function TestRunner({ attemptId }: { attemptId: string }) {
  const [dto, setDto] = useState<DTO | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const revision = useRef(0);
  const pendingQueue = useRef<Map<string, string | null>>(new Map());
  const flushing = useRef(false);
  const clockOffset = useRef(0);
  const router = useRouter();

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
    // 첫 미응답 문항으로 이동
    const first = d.items.findIndex((it) => !d.answers[it.itemId]);
    setIdx(first === -1 ? 0 : first);
    return d;
  }, [attemptId, router]);

  useEffect(() => {
    load();
  }, [load]);

  // 남은 시간
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
        // 다른 탭/기기에서 변경됨 → 최신 상태 다시 불러오고 로컬 미전송분 재적용
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
    } catch (e) {
      // 네트워크 단절 등: 큐에 되돌리고 재시도
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

  const choose = (itemId: string, optionId: string) => {
    setAnswers((a) => ({ ...a, [itemId]: optionId }));
    pendingQueue.current.set(itemId, optionId);
    flush();
  };

  const submit = async (auto = false) => {
    if (!dto || submitting) return;
    const unanswered = dto.items.filter((it) => !answers[it.itemId]).length;
    if (!auto && unanswered > 0 && !window.confirm(`답하지 않은 문항이 ${unanswered}개 있습니다. 그래도 제출할까요?`)) return;
    if (!auto && unanswered === 0 && !window.confirm("제출하면 수정할 수 없습니다. 제출할까요?")) return;
    setSubmitting(true);
    // 미전송 답안을 제출과 함께 원자적으로 처리
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

  if (err && !dto) return <div className="card card-body text-sm text-red-600">{err}</div>;
  if (!dto) return <div className="card card-body text-sm">불러오는 중…</div>;
  const it = dto.items[idx];
  const answered = dto.items.filter((x) => answers[x.itemId]).length;
  const fmt = (s: number) => (s >= 86400 ? `D-${Math.floor(s / 86400)}` : s >= 3600 ? `${Math.floor(s / 3600)}H${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="lbl truncate">{dto.exam.title}</span>
        <span className="digital">
          {remaining !== null && <span style={remaining < 60 ? { color: "var(--accent)" } : undefined}>{fmt(remaining)} </span>}
          {save === "saving" && "SAVING"}
          {save === "saved" && "SAVED"}
          {save === "error" && <span style={{ color: "var(--accent)" }}>RETRY</span>}
          {save === "offline" && <span style={{ color: "var(--accent)" }}>OFFLINE</span>}
          {save === "idle" && "READY"}
        </span>
      </div>
      <div className="h-[4px] w-full rounded-full" style={{ background: "rgba(27,26,24,0.10)" }}>
        <div className="h-full rounded-full tick" style={{ width: `${(answered / dto.items.length) * 100}%`, background: "var(--ink)" }} />
      </div>
      <div className="card card-body">
        <div className="flex items-baseline justify-between">
          <span className="digital-lg">
            {String(it.position).padStart(2, "0")}
            <span style={{ color: "var(--ink-3)" }}>/{String(dto.items.length).padStart(2, "0")}</span>
          </span>
          <span className="lbl">Choose meaning</span>
        </div>
        <div className="num-xl my-8 text-center" style={{ fontWeight: 300, fontSize: "clamp(36px, 10vw, 52px)" }}>
          {it.prompt}
        </div>
        <div className="space-y-2">
          {it.options.map((o) => {
            const sel = answers[it.itemId] === o.optionId;
            return (
              <button
                key={o.optionId}
                type="button"
                aria-pressed={sel}
                onClick={() => choose(it.itemId, o.optionId)}
                className="flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left text-[15px] transition-colors"
                style={sel ? { background: "var(--ink)", color: "var(--surface-2)" } : { background: "var(--surface-2)", color: "var(--ink)" }}
              >
                <span className="digital w-5 shrink-0" style={{ color: sel ? "rgba(250,249,246,0.7)" : "var(--ink-3)" }}>
                  {o.position}
                </span>
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1 py-3" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          Prev
        </button>
        {idx < dto.items.length - 1 ? (
          <button type="button" className="btn-primary flex-1 py-3" onClick={() => setIdx(idx + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn-accent flex-1 py-3" disabled={submitting} onClick={() => submit(false)}>
            {submitting ? "…" : "제출"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 px-1">
        {dto.items.map((x, i) => (
          <button key={x.itemId} type="button" onClick={() => setIdx(i)} className="digital h-7 w-7 rounded-full" style={i === idx ? { background: "var(--ink)", color: "var(--surface-2)" } : answers[x.itemId] ? { background: "rgba(27,26,24,0.12)", color: "var(--ink)" } : { color: "var(--ink-3)" }} aria-label={`${x.position}번 문항으로`}>
            {x.position}
          </button>
        ))}
      </div>
      {idx < dto.items.length - 1 && (
        <button type="button" className="btn-ghost w-full" disabled={submitting} onClick={() => submit(false)}>
          지금 제출 · {answered}/{dto.items.length}
        </button>
      )}
      {err && <p className="px-1 text-xs" style={{ color: "var(--accent)" }}>{err}</p>}
    </div>
  );
}
