"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { setClassJoinCodeAction } from "./actions";

/** 학생에게 보낼 안내문 */
export function joinText(academyName: string, className: string, code: string) {
  return `단어방에서 ${academyName} ${className}에 참여하세요.\n\n1. 단어방에 로그인 (Google 또는 카카오)\n2. 학생으로 시작\n3. 반 코드 ${code} 입력`;
}

/**
 * 반 코드 카드: 코드 큰 글씨 · [안내문 복사] [새 코드 만들기] [코드 끄기].
 * compact = 오늘 화면(온보딩) 옆에 두는 작은 버전.
 */
export function ClassCodeCard({ cls, academyName, compact }: { cls: { id: string; name: string; joinCode: string | null }; academyName: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (mode: "new" | "off") =>
    start(async () => {
      const r = await setClassJoinCodeAction(cls.id, mode);
      toast(r.message ?? "", r.ok);
      router.refresh();
    });
  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text).then(() => toast(msg, true));
  };
  const code = cls.joinCode;
  return (
    // 코드가 켜져 있을 때만 강조색 — 꺼진 반 코드는 경고처럼 보이지 않게 흐린 카드
    <section className={`${code ? "card-accent" : "card"} card-body flex flex-col ${compact || !code ? "" : "min-h-[190px]"}`} data-testid="class-code" data-class={cls.id} data-code={code ?? ""}>
      <div className="flex items-center justify-between">
        <div className={code ? "lbl-on" : "lbl"}>학생 초대 · {cls.name}</div>
        {!compact && (
          <Link href="/app/students" className={`${code ? "lbl-on" : "lbl-ink"} hover:underline`}>
            명단 →
          </Link>
        )}
      </div>
      {code ? (
        <>
          <button type="button" className="mt-3 text-left" onClick={() => copy(code, "반 코드를 복사했습니다.")} title="코드 복사" data-testid="class-code-value">
            <span className="digital-lg" style={{ fontSize: compact ? 34 : 40, letterSpacing: "0.18em" }}>
              {code.slice(0, 3)} {code.slice(3)}
            </span>
          </button>
          <p className="mt-1 text-[12.5px]" style={{ color: "rgba(255,244,240,0.85)" }}>
            학생에게 이 코드를 알려주세요. 로그인 → 학생으로 시작 → 코드 입력.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" style={{ background: "#fff4f0", color: "var(--accent)" }} onClick={() => copy(joinText(academyName, cls.name, code), "안내문을 복사했습니다.")} data-testid="class-code-copy">
              안내문 복사
            </button>
            <button type="button" className="btn btn-sm" style={{ background: "rgba(255,244,240,0.18)", color: "#fff4f0" }} disabled={pending} onClick={() => confirm("새 코드를 만들면 지금 코드는 더 이상 쓸 수 없습니다.") && run("new")}>
              새 코드 만들기
            </button>
            <button type="button" className="btn-ghost btn-sm" style={{ color: "rgba(255,244,240,0.8)" }} disabled={pending} onClick={() => run("off")}>
              코드 끄기
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
            반 코드가 꺼져 있어요. 켜면 학생이 코드로 이 반에 들어올 수 있어요.
          </p>
          <div className="mt-3">
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run("new")} data-testid="class-code-on">
              반 코드 켜기
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** 반이 여러 개일 때: 첫 반은 펼치고 나머지는 접힌 목록 */
export function ClassCodeList({ classes, academyName, initialId }: { classes: { id: string; name: string; joinCode: string | null; count: number }[]; academyName: string; initialId?: string }) {
  const [openId, setOpenId] = useState<string | null>(initialId ?? classes[0]?.id ?? null);
  if (!classes.length) return null;
  const open = classes.find((c) => c.id === openId) ?? classes[0];
  return (
    <div className="space-y-2">
      <ClassCodeCard cls={open} academyName={academyName} />
      {classes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="반 선택">
          {classes.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === open.id} className={`chip${c.id === open.id ? " on" : ""}`} onClick={() => setOpenId(c.id)}>
              {c.name}
              <span className="chip-sub">{c.joinCode ? `${c.joinCode.slice(0, 3)} ${c.joinCode.slice(3)}` : "off"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
