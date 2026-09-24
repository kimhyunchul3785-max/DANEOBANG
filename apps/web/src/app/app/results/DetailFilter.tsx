"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** 시험별 상세 성적 필터 — 고르는 즉시 URL 을 바꿔 다시 렌더 ([조회] 없음). #detail 로 그 자리에 머문다 */
export function DetailFilter({ exams, classes, examId, classId, studentId, studentName }: { exams: { id: string; title: string }[]; classes: { id: string; name: string }[]; examId?: string; classId?: string; studentId?: string; studentName?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (patch: { examId?: string; classId?: string; studentId?: string }) => {
    const next = { examId: examId ?? "", classId: classId ?? "", studentId: studentId ?? "", ...patch };
    const p = new URLSearchParams({ tab: "exams" });
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    start(() => router.replace(`/app/results?${p}#detail`, { scroll: false }));
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" id="detail" data-testid="detail-filter" aria-busy={pending}>
      <select className="input w-64" value={examId ?? ""} onChange={(e) => go({ examId: e.target.value })} aria-label="시험" data-testid="detail-exam">
        <option value="">모든 시험</option>
        {exams.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title}
          </option>
        ))}
      </select>
      <select className="input w-40" value={classId ?? ""} onChange={(e) => go({ classId: e.target.value })} aria-label="반" data-testid="detail-class">
        <option value="">현재 모든 반</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {studentId && (
        <button type="button" className="chip on" onClick={() => go({ studentId: "" })} title="학생 필터 해제" data-testid="detail-student-chip">
          {studentName ?? "학생"} ×
        </button>
      )}
      {pending && <span className="digital" style={{ fontSize: 11, color: "var(--ink-3)" }}>…</span>}
    </div>
  );
}
