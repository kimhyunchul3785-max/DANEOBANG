"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { uploadRosterAction } from "./actions";

/** 엑셀 등록: 양식 내려받기 → 파일 올리면 끝 (고르는 순간 바로 등록) */
export function RosterUpload() {
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const upload = (f: File | null) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const r = await uploadRosterAction(fd);
      toast(r.message ?? (r.ok ? "등록했습니다." : "실패했습니다."), r.ok);
      if (input.current) input.current.value = "";
      if (r.ok) router.refresh();
    });
  };
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="roster-upload">
      <a href="/api/files/roster-template" className="tile flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-4 text-center" style={{ background: "#fff4f0", color: "var(--accent)" }} download>
        <span className="digital" style={{ fontSize: 18 }}>
          1
        </span>
        <span className="text-[13px] font-semibold">양식 내려받기</span>
      </a>
      <input ref={input} type="file" name="file" accept=".xlsx" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0] ?? null)} />
      <div
        role="button"
        tabIndex={0}
        aria-label="작성한 양식 올리기"
        aria-busy={pending}
        className={`dropzone !min-h-0 !gap-1 !rounded-2xl !px-3 !py-4${over ? " over" : ""}`}
        onClick={() => !pending && input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files?.[0] ?? null);
        }}
        data-testid="roster-dropzone"
      >
        <span className="digital" style={{ fontSize: 18 }}>
          2
        </span>
        <span className="text-[13px] font-semibold">{pending ? "등록 중…" : "파일 올리기"}</span>
      </div>
    </div>
  );
}
