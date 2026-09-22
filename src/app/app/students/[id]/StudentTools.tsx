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
  student: { id: string; userId: string | null; userEmail: string | null; hasInvite: boolean; inviteExpiresAt: string | null };
  linkRequests: { id: string; user: { name: string; email: string } | null; createdAt: string }[];
  isOwner: boolean;
  members: { id: string; name: string; role: string }[];
  assignedMemberIds: string[];
}) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>(assignedMemberIds);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <>
      <div className="card card-body">
        <h2 className="h2 mb-2">학생 계정 연결</h2>
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
            <p className="muted">학생이 가입 후 초대 링크를 열면 연결 요청이 오고, 선생님이 승인하면 기존 성적과 연결됩니다. 이름만 같다고 자동 연결하지 않습니다.</p>
            <ActionButton
              action={issueStudentInviteAction.bind(null, student.id)}
              className="btn-primary btn-sm"
              onDone={(r) => {
                const url = (r.data as { url?: string } | undefined)?.url;
                if (url) setInviteUrl(url);
              }}
            >
              {student.hasInvite ? "초대 링크 재발급" : "초대 링크 발급"}
            </ActionButton>
            {student.hasInvite && !inviteUrl && (
              <p className="text-xs text-slate-500">
                발급된 링크가 있습니다 (만료 {student.inviteExpiresAt ? new Date(student.inviteExpiresAt).toLocaleDateString("ko-KR") : "-"}). 링크는 발급 시 한 번만 표시됩니다.
                <ActionButton action={revokeStudentInviteAction.bind(null, student.id)} className="btn-ghost btn-sm ml-1">
                  취소
                </ActionButton>
              </p>
            )}
            {inviteUrl && (
              <div className="rounded bg-slate-50 p-2">
                <div className="mb-1 text-xs text-slate-500">7일간 유효 · 1회 사용. 학생에게 전달하세요.</div>
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
