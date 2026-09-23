"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Ev = { event: string; path: string; detail?: unknown; t: number };
const queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 100);
  const body = JSON.stringify({ events });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/v1/log", new Blob([body], { type: "application/json" }));
    else fetch("/api/v1/log", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => null);
  } catch {}
}
function push(e: Omit<Ev, "t" | "path">) {
  queue.push({ ...e, path: location.pathname + location.search, t: Date.now() });
  if (!timer) timer = setTimeout(flush, 1500);
}

/** 모든 클릭(버튼·링크)·폼 제출·페이지 진입을 서버 로그로 보낸다 (디버깅용). 입력값은 보내지 않는다. */
export function ClientLogger() {
  const pathname = usePathname();
  useEffect(() => {
    push({ event: "page" });
  }, [pathname]);
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement | null)?.closest("button, a, [role=button], input[type=checkbox], input[type=radio], select") as HTMLElement | null;
      if (!el) return;
      const text = (el.textContent || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
      push({ event: "click", detail: { tag: el.tagName.toLowerCase(), text, name: el.getAttribute("name") ?? undefined, href: el.getAttribute("href") ?? undefined } });
    };
    const onSubmit = (ev: SubmitEvent) => {
      const f = ev.target as HTMLFormElement;
      const fields = Array.from(f.elements).map((x) => (x as HTMLInputElement).name).filter((n) => n && !n.startsWith("$ACTION"));
      push({ event: "submit", detail: { id: f.id || undefined, fields } });
    };
    const onError = (ev: ErrorEvent) => push({ event: "js_error", detail: { message: ev.message } });
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("error", onError);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return null;
}
