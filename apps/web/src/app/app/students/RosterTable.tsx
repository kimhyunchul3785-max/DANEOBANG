"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { SortHeader } from "@/components/Motion";
import { moveStudentsAction, setStudentsStatusAction, deleteStudentsAction, assignTeacherBulkAction, sendStudentCodesBulkAction, type CodeResult } from "./actions";
import { fmtPhone } from "@/lib/phone";

export type RosterRow = { id: string; name: string; className: string | null; classId: string | null; school: string | null; grade: string | null; phone: string | null; teachers: string; linked: boolean; invited: boolean; pending: number; avg: number | null; retake: number; status: string };

/** 명단 표: 체크해서 반 이동 · 담당 지정 · 비활성 · 삭제 */
export function RosterTable({ rows, classes, members, isOwner, emptyText }: { rows: RosterRow[]; classes: { id: string; name: string }[]; members: { id: string; name: string }[]; isOwner: boolean; emptyText?: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState<string>("");
  const [teacher, setTeacher] = useState<string>(members[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [codes, setCodes] = useState<CodeResult[] | null>(null);
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
      <div className={`mb-2 flex flex-wrap items-center gap-2 rounded-xl py-2 transition-colors ${sel.length ? "card-dark px-4" : "px-1"}`} data-testid="bulk-bar" aria-live="polite">
        <span className="digital" style={{ color: sel.length ? "#fff4f0" : "var(--ink-3)" }}>
          {sel.length}명 선택
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
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              disabled={pending}
              data-testid="bulk-send-codes"
              onClick={() =>
                start(async () => {
                  const r = await sendStudentCodesBulkAction(sel);
                  toast(r.message ?? "", r.ok);
                  const list = (r.data as { results?: CodeResult[] } | undefined)?.results ?? [];
                  setCodes(list);
                  router.refresh();
                })
              }
            >
              문자 초대
            </button>
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
      </div>

      {codes && (
        <div className="card-2 mb-3 rounded-2xl p-3" data-testid="code-results">
          <div className="mb-1 flex items-center justify-between">
            <span className="lbl">문자 초대 · 학생은 로그인 뒤 링크를 열거나 휴대폰 번호 + 인증번호로 연결</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCodes(null)}>
              닫기
            </button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {codes.map((c) => (
              <li key={c.studentId} className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5" style={{ background: "var(--surface)" }}>
                <span className="text-[13px]">
                  <b>{c.name}</b> <span className="muted">{fmtPhone(c.phone)}</span>
                </span>
                {c.error ? (
                  <span className="text-[12px]" style={{ color: "var(--accent)" }}>
                    {c.error}
                  </span>
                ) : c.sent ? (
                  <span className="badge-green">문자 발송</span>
                ) : (
                  <span className="digital" style={{ fontSize: 16, letterSpacing: "0.2em" }} title="문자 업체가 없어 직접 전달">
                    {c.code}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted mt-2">문자 업체(SMS_PROVIDER)를 설정하기 전에는 인증번호가 여기에만 표시됩니다. 카톡 등으로 학생에게 전달하세요. 7일간 유효.</p>
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="tbl tbl-cards roster">
        <thead>
          <tr className="[&>th]:whitespace-nowrap">
            <th className="w-8">
              <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : all)} aria-label="전체 선택" style={{ width: 18, height: 18 }} />
            </th>
            <th>이름 · 학교</th>
            <th className="w-[16%]">반</th>
            <th className="w-[18%]">휴대폰</th>
            <th>
              <SortHeader target="#roster-body" attr="avg">4주 평균</SortHeader>
            </th>
            <th className="w-[10%]">재시험</th>
          </tr>
        </thead>
        <tbody id="roster-body">
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center" style={{ color: "var(--ink-3)" }}>
                {emptyText ?? "학생이 없습니다. 반 코드를 학생에게 알려주거나, 아래에서 엑셀·한 명씩 등록하세요."}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} data-avg={r.avg ?? ""} className={r.status !== "active" ? "opacity-50" : ""} style={sel.includes(r.id) ? { background: "rgba(27,26,24,0.05)" } : undefined}>
              <td data-label="_check">
                <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.name} 선택`} style={{ width: 18, height: 18 }} />
              </td>
              <td className="whitespace-nowrap" data-label="_title">
                <div>
                  <Link href={`/app/students/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-[12px] font-normal" style={{ color: "var(--ink-3)" }}>
                    {r.school || r.grade ? `${r.school ?? ""} ${r.grade ?? ""}`.trim() : "학교 미입력"}
                    <span className="sm:hidden"> · {r.className ?? "반 없음"}</span>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap" data-label="반">{r.className ?? <span className="muted">반 없음</span>}</td>
              <td className="whitespace-nowrap text-[12.5px]" data-label="휴대폰" style={{ color: "var(--ink-2)" }} title={r.teachers ? `담당 ${r.teachers}` : undefined}>
                {r.phone ? fmtPhone(r.phone) : <span className="muted">-</span>}
                {!r.linked && r.status === "active" && (
                  <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {r.pending ? `참여 요청 ${r.pending}` : r.invited ? "초대함 · 연결 전" : "연결 전"}
                  </div>
                )}
              </td>
              <td className="text-[15px] font-bold tabular-nums" data-label="4주 평균" style={{ color: r.avg !== null && r.avg < 70 ? "var(--accent)" : undefined }}>
                {r.avg ?? "–"}
              </td>
              <td data-label="재시험" data-empty={r.retake ? undefined : "1"}>{r.retake ? <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{r.retake}<span className="sm:hidden">&nbsp;재시험</span></span> : <span className="muted">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
