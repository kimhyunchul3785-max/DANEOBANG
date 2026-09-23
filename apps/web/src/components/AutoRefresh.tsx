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
