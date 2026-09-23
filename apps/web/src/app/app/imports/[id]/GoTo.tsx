"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function GoTo({ href, delay = 700 }: { href: string; delay?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(href), delay);
    return () => clearTimeout(t);
  }, [href, delay, router]);
  return null;
}
