"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 작업 상태 폴링용: 일정 간격으로 서버 컴포넌트를 새로고침 */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}

/**
 * 뒤로가기로 돌아온 화면이 떠날 때의 스냅샷(예: 응시 중인데 '응시 시작')으로 남지 않게:
 * 서버가 그린 시각(renderedAt)보다 오래된 화면으로 다시 보이면 한 번 새로 받는다.
 */
export function RefreshIfStale({ renderedAt, maxAgeMs = 3000 }: { renderedAt: number; maxAgeMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (Date.now() - renderedAt > maxAgeMs) router.refresh();
    const onShow = (e: PageTransitionEvent) => e.persisted && router.refresh();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router, renderedAt, maxAgeMs]);
  return null;
}
