"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { SortHeader } from "@/components/Motion";
import { moveStudentsAction, setStudentsStatusAction, deleteStudentsAction, assignTeacherBulkAction } from "./actions";

export type RosterRow = { id: string; name: string; className: string | null; classId: string | null; school: string | null; grade: string | null; teachers: string; linked: boolean; invited: boolean; pending: number; avg: number | null; retake: number; status: string };

/** 명단 표: 체크해서 반 이동 · 담당 지정 · 비활성 · 삭제 */
export function RosterTable({ rows, classes, members, isOwner }: { rows: RosterRow[]; classes: { id: string; name: string }[]; members: { id: string; name: string }[]; isOwner: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState<string>("");
  const [teacher, setTeacher] = useState<string>(members[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.map((r) => r.id);
  const allOn = sel.length > 0 && sel.length === all.length;
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const selectedNames = useMemo(() => rows.filter((r) => sel.includes(r.id)).map((r) => r.name), [rows, sel]);

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; message?: string }>, extra: Record<string, string>, confirmText?: string) => {
    if (!sel.length) return toast("학생을 먼저 선택하세요.", false);
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const fd = new FormData();
      for (const id of sel) fd.append("studentIds", id);
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
      const r = await fn(fd);
      toast(r.message ?? (r.ok ? "완료" : "실패"), r.ok);
      if (r.ok) {
        setSel([]);
        router.refresh();
      }
    });
  };

  return (
    <div>
      {/* 일괄 작업 바 */}
      <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 transition-colors ${sel.length ? "card-dark" : "card-2"}`} data-testid="bulk-bar" aria-live="polite">
        <span className="digital" style={{ color: sel.length ? "#fff4f0" : "var(--ink-3)" }}>
          {String(sel.length).padStart(2, "0")} SELECTED
        </span>
        {sel.length > 0 && (
          <>
            <span className="max-w-[260px] truncate text-[12px]" style={{ color: "rgba(236,233,227,0.7)" }}>
              {selectedNames.join(", ")}
            </span>
            <span className="mx-1 h-4 w-px" style={{ background: "rgba(236,233,227,0.25)" }} />
            <select className="input w-40" style={{ padding: "6px 30px 6px 10px", background: "var(--surface-2)" }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="이동할 반">
              <option value="">반 없음</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(moveStudentsAction, { classId: moveTo })}>
              반 이동
            </button>
            {isOwner && members.length > 0 && (
              <>
                <span className="mx-1 h-4 w-px" style={{ background: "rgba(236,233,227,0.25)" }} />
                <select className="input w-40" style={{ padding: "6px 30px 6px 10px", background: "var(--surface-2)" }} value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="담당 선생님">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(assignTeacherBulkAction, { memberId: teacher, mode: "add" })}>
                  담당 추가
                </button>
                <button type="button" className="btn-ghost btn-sm" style={{ color: "rgba(236,233,227,0.8)" }} disabled={pending} onClick={() => run(assignTeacherBulkAction, { memberId: teacher, mode: "replace" }, "선택 학생의 기존 담당 선생님을 모두 이 선생님으로 교체할까요?")}>
                  담당 교체
                </button>
              </>
            )}
            <span className="mx-1 h-4 w-px" style={{ background: "rgba(236,233,227,0.25)" }} />
            <button type="button" className="btn-ghost btn-sm" style={{ color: "rgba(236,233,227,0.8)" }} disabled={pending} onClick={() => run(setStudentsStatusAction, { status: "inactive" }, "선택 학생을 비활성으로 바꿀까요? 기록은 유지되고 목록·배정에서만 빠집니다.")}>
              비활성
            </button>
            <button type="button" className="btn-ghost btn-sm" style={{ color: "rgba(236,233,227,0.8)" }} disabled={pending} onClick={() => run(setStudentsStatusAction, { status: "active" })}>
              활성
            </button>
            {isOwner && (
              <button type="button" className="btn-ghost btn-sm" style={{ color: "#ff8a6a" }} disabled={pending} onClick={() => run(deleteStudentsAction, {}, `선택한 ${sel.length}명을 삭제할까요?\n배정·응시·성적·재시험 기록이 함께 삭제되며 되돌릴 수 없습니다.`)}>
                삭제
              </button>
            )}
          </>
        )}
        {sel.length === 0 && <span className="muted">체크하면 반 이동 · 담당 지정 · 비활성 · 삭제를 할 수 있습니다.</span>}
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th className="w-8">
              <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : all)} aria-label="전체 선택" />
            </th>
            <th>이름</th>
            <th>반</th>
            <th>학교 · 학년</th>
            <th>담당</th>
            <th className="whitespace-nowrap">
              <SortHeader target="#roster-body" attr="avg">4주 평균</SortHeader>
            </th>
            <th>재시험</th>
            <th>계정</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody id="roster-body">
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center" style={{ color: "var(--ink-3)" }}>
                학생이 없습니다. 오른쪽에서 양식을 내려받아 올리거나 한 명씩 등록하세요.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} data-avg={r.avg ?? ""} className={r.status !== "active" ? "opacity-50" : ""} style={sel.includes(r.id) ? { background: "rgba(27,26,24,0.05)" } : undefined}>
              <td>
                <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.name} 선택`} />
              </td>
              <td className="whitespace-nowrap">
                <Link href={`/app/students/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="whitespace-nowrap">{r.className ?? <span className="muted">-</span>}</td>
              <td className="whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                {r.school ?? ""} {r.grade ?? ""}
              </td>
              <td className="max-w-[160px] truncate text-[12px]" style={{ color: "var(--ink-3)" }} title={r.teachers}>
                {r.teachers || "-"}
              </td>
              <td className="num-md" style={{ fontSize: 18, color: r.avg !== null && r.avg < 70 ? "var(--accent)" : undefined }}>
                {r.avg ?? "–"}
              </td>
              <td>{r.retake ? <span className="badge-red">{r.retake}</span> : <span className="muted">-</span>}</td>
              <td>{r.linked ? <span className="badge-green">ACTIVE</span> : r.pending ? <span className="badge-amber">승인 대기 {r.pending}</span> : r.invited ? <span className="badge-amber">INVITED</span> : <span className="badge-gray">REGISTERED</span>}</td>
              <td>{r.status === "active" ? <span className="badge-gray">ACTIVE</span> : <span className="badge-amber">OFF</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
