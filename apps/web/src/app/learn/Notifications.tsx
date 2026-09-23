"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type N = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

/** 학생 알림: 헤더 종 아이콘 + 펼침 목록. 열면 읽음 처리. 30초마다 새로 확인 */
export function Notifications() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read).length;
  const load = async () => {
    try {
      const r = await fetch("/api/v1/learn/notifications");
      if (r.ok) setItems((await r.json()).data.items);
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
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
      <button type="button" className="btn-ghost btn-sm relative" onClick={toggle} aria-label={`알림 ${unread}개`} data-testid="bell">
        ◔
        {unread > 0 && (
          <span className="digital absolute -right-1 -top-1 rounded-full px-1.5" style={{ background: "var(--accent)", color: "#fff4f0", fontSize: 10, lineHeight: "14px" }}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card-2 absolute right-0 z-30 mt-1 w-[300px] p-2 anim-fade-up" style={{ boxShadow: "0 12px 30px rgba(27,26,24,0.16)" }}>
          <div className="lbl px-2 py-1">Notifications</div>
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
