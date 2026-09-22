"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionForm";
import { issueStudentInviteAction, revokeStudentInviteAction, decideLinkRequestAction, unlinkStudentAction, setStudentTeachersAction } from "../actions";

export function StudentTools({
  student,
  linkRequests,
  isOwner,
  members,
  assignedMemberIds,
}: {
  student: { id: string; name: string; email: string | null; userId: string | null; userEmail: string | null; hasInvite: boolean; inviteExpiresAt: string | null; inviteSentAt: string | null };
  linkRequests: { id: string; user: { name: string; email: string } | null; createdAt: string }[];
  isOwner: boolean;
  members: { id: string; name: string; role: string }[];
  assignedMemberIds: string[];
}) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [mailed, setMailed] = useState(false);
  const accountState = student.userId ? "active" : student.hasInvite ? "invited" : "registered";
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
            <p className="muted">학원이 먼저 등록하고, 학생은 계정 설정 링크에서 <b>비밀번호만</b> 정하면 바로 연결됩니다. 학교·학년·반은 다시 묻지 않습니다.{student.email ? ` 링크는 ${student.email} 로 보냅니다.` : " 이메일을 적어 두면 메일로 보낼 수 있습니다."}</p>
            <ActionButton
              action={issueStudentInviteAction.bind(null, student.id)}
              className="btn-primary btn-sm"
              onDone={(r) => {
                const d = r.data as { url?: string; mailed?: boolean } | undefined;
                if (d?.url) setInviteUrl(d.url);
                setMailed(!!d?.mailed);
              }}
            >
              {student.hasInvite ? "계정 설정 링크 다시 보내기" : student.email ? "계정 설정 링크 보내기" : "계정 설정 링크 만들기"}
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
              <div className="rounded border border-amber-200 bg-amber-50 p-2">
                <div className="mb-1 text-xs font-semibold text-amber-800">연결 요청</div>
                {linkRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1 text-xs">
                    <span>
                      {r.user?.name} ({r.user?.email})
                    </span>
                    <span className="flex gap-1">
                      <ActionButton action={decideLinkRequestAction.bind(null, r.id, true)} className="btn-primary btn-sm">
                        승인
                      </ActionButton>
                      <ActionButton action={decideLinkRequestAction.bind(null, r.id, false)} className="btn-ghost btn-sm">
                        거절
                      </ActionButton>
                    </span>
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
