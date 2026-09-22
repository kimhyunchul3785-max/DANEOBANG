"use client";
import { useEffect } from "react";

/** print 미디어로 비동기 로드한 웹폰트 스타일시트를 하이드레이션 후 활성화 */
export function FontSwap() {
  useEffect(() => {
    document.querySelectorAll<HTMLLinkElement>("link[data-font]").forEach((l) => {
      l.media = "all";
    });
  }, []);
  return null;
}
