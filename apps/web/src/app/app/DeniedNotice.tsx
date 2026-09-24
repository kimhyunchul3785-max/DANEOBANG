"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/Toaster";

/** 선생님이 학원장 전용 화면(선생님·학원 설정·요금제)을 열었을 때: 튕기지 말고 이유를 말해 준다 */
export function DeniedNotice() {
  const sp = useSearchParams();
  const router = useRouter();
  const denied = sp.get("denied");
  useEffect(() => {
    if (!denied) return;
    toast(denied === "owner" ? "학원장만 볼 수 있는 화면이에요. 필요하면 학원장에게 요청해 주세요." : "볼 수 없는 화면이에요.", false);
    router.replace("/app", { scroll: false });
  }, [denied, router]);
  return null;
}
