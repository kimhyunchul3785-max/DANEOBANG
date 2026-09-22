"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemDetection } from "@/lib/omr/analyze";
import { reviewScanItemAction } from "../actions";

type Item = { position: number; prompt: string; options: { position: number; text: string }[]; bubbles: { position: number; cx: number; cy: number; r: number }[] };

const STATUS_LABEL: Record<string, [string, string]> = {
  single_mark: ["badge-green", "단일 마킹"],
  blank: ["badge-gray", "무응답"],
  multiple_marks: ["badge-red", "복수 마킹"],
  uncertain: ["badge-amber", "불확실"],
};

export function ScanReview({ scanId, accepted, correctedUrl, originalUrl, detections, reviewed, items, page, acceptedPages, totalPages, children }: { scanId: string; accepted: boolean; correctedUrl: string | null; originalUrl: string; detections: ItemDetection[]; reviewed: Record<string, number | null>; items: Item[]; page: { w: number; h: number }; acceptedPages: number[]; totalPages: number; children: React.ReactNode }) {
  const [focus, setFocus] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (position: number, opt: number | null) =>
    start(async () => {
      await reviewScanItemAction(scanId, position, opt);
      router.refresh();
    });
  const focused = items.find((i) => i.position === focus);
  const unresolved = detections.filter((d) => !(String(d.position) in reviewed) && (d.status === "multiple_marks" || d.status === "uncertain")).length;
  // 확대: 보정 이미지(1000px 폭) 기준 문항 영역
  const zoom = focused
    ? (() => {
        const xs = focused.bubbles.map((b) => b.cx);
        const ys = focused.bubbles.map((b) => b.cy);
        const x0 = Math.max(0, Math.min(...xs) - 20);
        const x1 = Math.min(page.w, Math.max(...xs) + 170);
        const y0 = Math.max(0, Math.min(...ys) - 16);
        const y1 = Math.min(page.h, Math.max(...ys) + 16);
        const s = 1000 / page.w;
        return { x: x0 * s, y: y0 * s, w: (x1 - x0) * s, h: (y1 - y0) * s };
      })()
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card card-body">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">보정 이미지</h2>
          <a className="btn-ghost btn-sm" href={originalUrl} target="_blank">
            원본 보기
          </a>
        </div>
        {correctedUrl ? (
          <div className="overflow-auto rounded border border-slate-200">
            {zoom ? (
              <div className="relative overflow-hidden" style={{ width: "100%", aspectRatio: `${zoom.w} / ${zoom.h}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={correctedUrl} alt="확대" className="absolute max-w-none" style={{ width: `${(1000 / zoom.w) * 100}%`, left: `${(-zoom.x / zoom.w) * 100}%`, top: `${(-zoom.y / zoom.h) * 100}%` }} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={correctedUrl} alt="보정 이미지" className="w-full" />
            )}
          </div>
        ) : (
          <p className="muted">보정 이미지가 없습니다.</p>
        )}
        {focused && (
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setFocus(null)}>
            전체 보기
          </button>
        )}
      </div>

      <div className="card card-body">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">문항별 판독</h2>
          <span className="muted">
            확정 페이지 {acceptedPages.filter(Boolean).sort().join(", ") || "없음"} / {totalPages}
          </span>
        </div>
        {!accepted && unresolved > 0 && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">확인이 필요한 문항 {unresolved}개: 문항을 클릭해 확대 이미지를 보고 답을 지정하세요. 불확실은 자동으로 오답 처리하지 않습니다.</p>}
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>단어</th>
              <th>판독</th>
              <th>채움</th>
              <th>확정 답</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const d = detections.find((x) => x.position === it.position);
              const [cls, label] = STATUS_LABEL[d?.status ?? "uncertain"];
              const manual = String(it.position) in reviewed;
              const finalOpt = manual ? reviewed[String(it.position)] : d?.optionPosition ?? null;
              const needs = !manual && d && (d.status === "multiple_marks" || d.status === "uncertain");
              return (
                <tr key={it.position} className={`${focus === it.position ? "bg-blue-50" : needs ? "bg-amber-50/60" : ""} cursor-pointer`} onClick={() => setFocus(it.position)}>
                  <td>{it.position}</td>
                  <td className="font-medium">{it.prompt}</td>
                  <td>
                    <span className={cls}>{label}</span>
                  </td>
                  <td className="whitespace-nowrap font-mono text-[10px] text-slate-400">{d?.fills.map((f) => f.toFixed(2)).join(" ")}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((p) => (
                        <button key={p} type="button" disabled={accepted || pending} className={`h-7 w-7 rounded-full border text-xs ${finalOpt === p ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 hover:bg-slate-100"}`} onClick={() => set(it.position, p)} title={it.options.find((o) => o.position === p)?.text}>
                          {p}
                        </button>
                      ))}
                      <button type="button" disabled={accepted || pending} className={`h-7 rounded-full border px-2 text-xs ${finalOpt === null && (manual || d?.status === "blank") ? "border-slate-600 bg-slate-600 text-white" : "border-slate-300 hover:bg-slate-100"}`} onClick={() => set(it.position, null)}>
                        무응답
                      </button>
                      {manual && <span className="ml-1 text-[10px] text-blue-600">수정됨</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
