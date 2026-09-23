"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionForm";
import { issueStudentInviteAction, revokeStudentInviteAction, decideLinkRequestAction, unlinkStudentAction, setStudentTeachersAction, sendStudentCodeAction, type CodeResult } from "../actions";
import { fmtPhone } from "@/lib/phone";

export function StudentTools({
  student,
  linkRequests,
  isOwner,
  members,
  assignedMemberIds,
}: {
  student: { id: string; name: string; email: string | null; phone: string | null; userId: string | null; userEmail: string | null; hasInvite: boolean; inviteExpiresAt: string | null; inviteSentAt: string | null; codeSent: boolean; codeExpiresAt: string | null };
  linkRequests: { id: string; user: { name: string; email: string } | null; createdAt: string; name: string | null; className: string | null }[];
  isOwner: boolean;
  members: { id: string; name: string; role: string }[];
  assignedMemberIds: string[];
}) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [mailed, setMailed] = useState(false);
  const [code, setCode] = useState<CodeResult | null>(null);
  const accountState = student.userId ? "active" : student.hasInvite || student.codeSent ? "invited" : "registered";
  const [sel, setSel] = useState<string[]>(assignedMemberIds);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <>
      <div className="card card-body" data-account-state={accountState}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">학생 계정</h2>
          <span className={accountState === "active" ? "badge-green" : accountState === "invited" ? "badge-amber" : "badge-gray"}>{accountState === "active" ? "ACTIVE" : accountState === "invited" ? "INVITED" : "REGISTERED"}</span>
        </div>
        {student.userId ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="badge-green">연결됨</span> <span className="text-slate-600">{student.userEmail}</span>
            </p>
            <ActionButton action={unlinkStudentAction.bind(null, student.id)} confirm="계정 연결을 해제할까요? 성적 기록은 유지됩니다." className="btn-secondary btn-sm">
              연결 해제
            </ActionButton>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {/* 1순위: 문자 초대 (링크 + 인증번호) */}
            <div className="card-2 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">문자 초대</div>
                  <div className="muted text-[12px]">{student.phone ? `${fmtPhone(student.phone)} 로 연결 링크와 인증번호를 보냅니다. 학생은 로그인 뒤 링크를 열거나 번호를 입력.` : "휴대폰 번호를 먼저 정보에 입력해주세요."}</div>
                </div>
                <ActionButton
                  action={sendStudentCodeAction.bind(null, student.id)}
                  className="btn-primary btn-sm whitespace-nowrap"
                  onDone={(r) => {
                    const d = r.data as { results?: CodeResult[] } | undefined;
                    setCode(d?.results?.[0] ?? null);
                  }}
                >
                  {student.codeSent ? "다시 보내기" : "문자 초대"}
                </ActionButton>
              </div>
              {code && !code.error && (
                <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--surface)" }} data-testid="student-code">
                  <span className="muted text-[12px]">{code.sent ? "문자를 보냈습니다" : "문자 업체가 없어 직접 전달하세요 (7일 유효)"}</span>
                  {!code.sent && (
                    <span className="digital" style={{ fontSize: 20, letterSpacing: "0.25em" }}>
                      {code.code}
                    </span>
                  )}
                </div>
              )}
              {!code && student.codeSent && <p className="muted mt-2 text-[12px]">초대를 보냈습니다 (만료 {student.codeExpiresAt ? new Date(student.codeExpiresAt).toLocaleDateString("ko-KR") : "-"}). 학생이 아직 연결하지 않았습니다.</p>}
            </div>
            <div className="lbl mt-3">또는 · 초대 링크</div>
            <p className="muted">학생이 로그인한 뒤 링크를 열면 바로 연결됩니다.{student.email ? ` 링크는 ${student.email} 로 보냅니다.` : " 이메일을 적어 두면 메일로 보낼 수 있습니다."} 반 코드는 학생 탭에 있습니다.</p>
            <ActionButton
              action={issueStudentInviteAction.bind(null, student.id)}
              className="btn-secondary btn-sm"
              onDone={(r) => {
                const d = r.data as { url?: string; mailed?: boolean } | undefined;
                if (d?.url) setInviteUrl(d.url);
                setMailed(!!d?.mailed);
              }}
            >
              {student.hasInvite ? "초대 링크 다시 만들기" : student.email ? "초대 링크 보내기" : "초대 링크 만들기"}
            </ActionButton>
            {student.hasInvite && !inviteUrl && (
              <p className="text-xs text-slate-500">
                {student.inviteSentAt ? "메일을 보냈습니다" : "링크를 만들었습니다"} (만료 {student.inviteExpiresAt ? new Date(student.inviteExpiresAt).toLocaleDateString("ko-KR") : "-"}). 링크는 만들 때 한 번만 표시됩니다.
                <ActionButton action={revokeStudentInviteAction.bind(null, student.id)} className="btn-ghost btn-sm ml-1">
                  취소
                </ActionButton>
              </p>
            )}
            {inviteUrl && (
              <div className="rounded bg-slate-50 p-2" data-testid="student-invite-url">
                <div className="mb-1 text-xs text-slate-500">{mailed ? "메일로 보냈습니다. 직접 전달하려면 아래 링크를 복사하세요." : "7일간 유효 · 1회 사용. 학생에게 전달하세요 (메일 서버가 없어 직접 전달)."}</div>
                <input className="input font-mono text-xs" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
                  복사
                </button>
              </div>
            )}
            {linkRequests.length > 0 && (
              <div className="card-accent rounded-2xl p-3" data-testid="link-requests">
                <div className="lbl-on mb-1">참여 요청</div>
                {linkRequests.map((r) => (
                  <div key={r.id} className="py-1.5 text-[13px]">
                    <div>
                      <b>{r.name ?? r.user?.name}</b> 학생이 {r.className ? `${r.className} ` : ""}참여를 요청했습니다.
                      <span className="block text-[12px]" style={{ color: "rgba(255,244,240,0.8)" }}>
                        계정 {r.user?.name} · {r.user?.email} · 기존 명단 {student.name}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ActionButton action={decideLinkRequestAction.bind(null, r.id, "link")} className="btn btn-sm" style={{ background: "#fff4f0", color: "var(--accent)" }} testId="link-existing">
                        기존 학생과 연결
                      </ActionButton>
                      <ActionButton action={decideLinkRequestAction.bind(null, r.id, "new")} className="btn btn-sm" style={{ background: "rgba(255,244,240,0.18)", color: "#fff4f0" }} testId="link-new">
                        새 학생으로 추가
                      </ActionButton>
                      <ActionButton action={decideLinkRequestAction.bind(null, r.id, "reject")} className="btn-ghost btn-sm" style={{ color: "rgba(255,244,240,0.8)" }}>
                        거절
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="card card-body">
          <h2 className="h2 mb-2">담당 선생님</h2>
          <div className="space-y-1 text-sm">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sel.includes(m.id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))}
                />
                {m.name} <span className="text-xs text-slate-400">{m.role === "OWNER" ? "학원장" : "선생님"}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm mt-2"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setStudentTeachersAction(student.id, sel);
                router.refresh();
              })
            }
          >
            저장
          </button>
        </div>
      )}
    </>
  );
}
