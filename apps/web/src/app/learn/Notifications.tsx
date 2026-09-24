"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type N = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

/**
 * 학생 알림: 헤더 종 아이콘 + 펼침 목록. 열면 읽음 처리. 20초마다 새로 확인.
 * 탭이 열려 있으면 새 알림을 브라우저 알림(OS 배너)으로도 띄운다 — 예약 시험이 시작될 때 "시험이 시작됐어요".
 */
export function Notifications() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const seen = useRef<Set<string> | null>(null);
  const unread = items.filter((n) => !n.read).length;
  const load = async () => {
    try {
      const r = await fetch("/api/v1/learn/notifications");
      if (!r.ok) return;
      const list = (await r.json()).data.items as N[];
      setItems(list);
      // 처음 불러온 뒤부터 새로 생긴 안 읽은 알림만 브라우저 알림으로
      if (seen.current) {
        const fresh = list.filter((n) => !n.read && !seen.current!.has(n.id));
        if (fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const n of fresh.slice(0, 3)) {
            try {
              const note = new Notification(n.title, { body: n.body, tag: n.id });
              note.onclick = () => {
                window.focus();
                if (n.link) location.href = n.link;
              };
            } catch {}
          }
          try {
            navigator.vibrate?.([40, 30, 40]);
          } catch {}
        }
      }
      seen.current = new Set(list.map((n) => n.id));
    } catch {}
  };
  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    load();
    const t = setInterval(load, 20000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const askPerm = async () => {
    try {
      setPerm(await Notification.requestPermission());
    } catch {}
  };
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      await fetch("/api/v1/learn/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }).catch(() => null);
      setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    }
  };
  return (
    <div className="relative">
      <button type="button" className="btn-ghost btn-sm relative min-h-[40px] min-w-[40px]" onClick={toggle} aria-label={`알림 ${unread}개`} data-testid="bell">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="digital absolute -right-1 -top-1 rounded-full px-1.5" style={{ background: "var(--accent)", color: "#fff4f0", fontSize: 10, lineHeight: "14px" }}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card-2 absolute right-0 z-30 mt-1 w-[300px] p-2 anim-fade-up" style={{ boxShadow: "0 12px 30px rgba(27,26,24,0.16)" }}>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="lbl">알림</span>
            {perm === "default" && (
              <button type="button" className="lbl-ink hover:underline" onClick={askPerm} data-testid="notif-enable">
                기기 알림 켜기
              </button>
            )}
            {perm === "denied" && <span className="lbl" title="브라우저 설정에서 알림을 허용하면 예약 시험 시작을 바로 알려드려요">기기 알림 꺼짐</span>}
          </div>
          {items.length === 0 && <p className="muted px-2 py-2">알림이 없습니다.</p>}
          <ul className="max-h-[320px] overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="row px-2">
                <div className="min-w-0">
                  {n.link ? (
                    <Link href={n.link} className="block text-[13.5px] font-semibold hover:underline" onClick={() => setOpen(false)}>
                      {n.title}
                    </Link>
                  ) : (
                    <div className="text-[13.5px] font-semibold">{n.title}</div>
                  )}
                  <div className="muted text-[12px]">{n.body}</div>
                </div>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
