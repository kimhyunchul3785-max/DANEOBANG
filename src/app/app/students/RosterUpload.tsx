"use client";
import { useRef, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { uploadRosterAction } from "./actions";

/** 학생 등록 엑셀 업로드 (드롭존) */
export function RosterUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = (f: File | null) => {
    setFile(f);
    if (input.current && f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  };
  return (
    <ActionForm action={uploadRosterAction} className="space-y-2" onSuccess={() => setFile(null)}>
      <input ref={input} type="file" name="file" accept=".xlsx" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div
        role="button"
        tabIndex={0}
        aria-label="학생 등록 엑셀 파일 선택"
        className={`dropzone${over ? " over" : ""}${file ? " has" : ""}`}
        style={{ minHeight: 84 }}
        onClick={() => input.current?.click()}
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
          const f = e.dataTransfer.files?.[0] ?? null;
          if (f) pick(f);
        }}
      >
        {file ? (
          <>
            <span className="max-w-full truncate text-[14px] font-semibold">{file.name}</span>
            <span className="lbl" style={{ color: "rgba(232,67,26,0.7)" }}>
              다른 파일 선택
            </span>
          </>
        ) : (
          <>
            <span className="text-[14px] font-semibold">작성한 양식(.xlsx)을 끌어다 놓거나 클릭</span>
            <span className="lbl-on">시트 = 반 · 이름 · 학교 · 학년</span>
          </>
        )}
      </div>
      <button className="btn w-full py-3 text-[13px]" style={{ background: file ? "#fff4f0" : "rgba(255,244,240,0.35)", color: "var(--accent)" }} disabled={!file}>
        업로드 · 학생 등록 →
      </button>
    </ActionForm>
  );
}
