"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planDays, distribution, parseSizes, DEFAULT_SPLIT_DAYS, type SplitMode } from "@/lib/day-plan";
import { toast } from "@/components/Toaster";
import { resplitBookAction } from "../actions";

type Props = {
  bookId: string;
  items: { section: string | null }[]; // 원문 순서
  hasDocDays: boolean;
  currentDays: number;
  highlight?: boolean;
};

/** DAY 나누기 카드: 기준(일수·단어 수·지문별·문서 표기) + 미리보기 막대 + 적용 */
export function DaySplitPanel({ bookId, items, hasDocDays, currentDays, highlight }: Props) {
  const sections = useMemo(() => new Set(items.map((i) => i.section).filter(Boolean)).size, [items]);
  const [mode, setMode] = useState<SplitMode>("days");
  const [n, setN] = useState<number>(DEFAULT_SPLIT_DAYS);
  const [sizes, setSizes] = useState<string>("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = items.length;

  const preview = useMemo(() => {
    if (mode === "doc") return [];
    return distribution(planDays(items.map((i) => ({ dayNo: null, section: i.section })), mode, n, 0, mode === "custom" ? parseSizes(sizes) : undefined));
  }, [items, mode, n, sizes]);
  const maxCount = Math.max(1, ...preview.map((p) => p.count));
  const per = mode === "days" ? Math.ceil(total / Math.max(1, Math.min(n, total))) : mode === "perDay" ? n : null;

  const apply = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("bookId", bookId);
      fd.set("mode", mode);
      fd.set("n", String(n));
      fd.set("sizes", sizes);
      const r = await resplitBookAction(fd);
      toast(r.message ?? (r.ok ? "적용했습니다." : "실패했습니다."), r.ok);
      if (r.ok) router.replace(`/app/vocabulary/${bookId}?day=1`);
      router.refresh();
    });

  const segs: { key: SplitMode; label: string; show: boolean }[] = [
    { key: "days", label: "일수", show: true },
    { key: "perDay", label: "단어 수", show: true },
    { key: "section", label: "지문별", show: sections > 1 },
    { key: "custom", label: "직접", show: true },
    { key: "doc", label: "문서 표기", show: hasDocDays },
  ];
  const customSum = mode === "custom" ? parseSizes(sizes).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className={`${highlight ? "card-accent" : "card"} card-body flex flex-col`} data-testid="day-split">
      <div className="flex items-center justify-between">
        <div className={highlight ? "lbl-on" : "lbl"}>Split · DAY 나누기</div>
        <span className="digital">NOW {currentDays} DAYS</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="seg" style={highlight ? { background: "rgba(255,244,240,0.18)" } : undefined}>
          {segs
            .filter((s) => s.show)
            .map((s) => (
              <button key={s.key} type="button" className={`seg-item${mode === s.key ? (highlight ? " on-accent" : " on") : ""}`} style={highlight && mode === s.key ? { background: "#fff4f0", color: "var(--accent)" } : highlight ? { color: "rgba(255,244,240,0.85)" } : undefined} onClick={() => setMode(s.key)} aria-pressed={mode === s.key}>
                {s.label}
              </button>
            ))}
        </div>
        {mode === "custom" && (
          <label className="flex min-w-[240px] flex-1 items-center gap-2">
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} className="input flex-1" style={{ padding: "6px 10px" }} placeholder="DAY별 단어 수 · 예: 40, 40, 30" aria-label="DAY별 단어 수" data-testid="split-sizes" />
          </label>
        )}
        {(mode === "days" || mode === "perDay") && (
          <label className="flex items-center gap-2">
            <input type="number" min={1} max={mode === "days" ? 60 : 500} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} className="input w-20 text-center" style={{ padding: "6px 8px" }} aria-label={mode === "days" ? "일수" : "하루 단어 수"} />
            <span className={highlight ? "lbl-on" : "lbl"}>{mode === "days" ? "일" : "단어/일"}</span>
          </label>
        )}
      </div>
      <div className="mt-4 flex items-end gap-6">
        <div>
          <div className="num-lg" style={{ fontSize: 40 }}>
            {mode === "doc" ? "DOC" : preview.length}
          </div>
          <div className={`${highlight ? "lbl-on" : "lbl"} mt-1`}>{mode === "doc" ? "문서 DAY 표기대로" : mode === "section" ? `지문 ${sections}개 → DAY` : mode === "custom" ? (parseSizes(sizes).length ? `직접 · ${customSum >= total ? "지정한 대로" : `마지막 DAY 에 남은 ${total - customSum}개`}` : "쉼표로 DAY별 단어 수") : `DAY · 하루 ${per ?? "-"}단어`}</div>
        </div>
        {mode !== "doc" && (
          <div className="flex flex-1 items-end gap-[3px] overflow-hidden" style={{ height: 44 }} aria-hidden>
            {preview.slice(0, 60).map((p) => (
              <div key={p.dayNo} className="w-[6px] shrink-0 rounded-full" style={{ height: `${Math.max(14, (p.count / maxCount) * 100)}%`, background: highlight ? "#fff4f0" : "var(--ink)" }} title={`${p.label}: ${p.count}`} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className={`text-[12px] ${highlight ? "" : "muted"}`} style={highlight ? { color: "rgba(255,244,240,0.8)" } : undefined}>
          {total}단어 · 원문 순서 기준. 이미 발행된 시험은 바뀌지 않습니다.
        </span>
        <button type="button" onClick={apply} disabled={pending || total === 0} className="btn-primary" style={highlight ? { background: "#fff4f0", color: "var(--accent)" } : undefined}>
          {pending ? "적용 중…" : "적용"}
        </button>
      </div>
    </div>
  );
}
