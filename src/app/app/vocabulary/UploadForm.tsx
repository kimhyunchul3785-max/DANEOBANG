"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, type ActionResult } from "@/components/ActionForm";

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/**
 * 업로드 폼: 드롭존(끌어다 놓기·클릭) → 저장 위치(새 단어장 / 기존에 이어 붙이기) → 업로드.
 * 설명은 제목 옆 ⓘ 툴팁으로.
 */
export function UploadForm({ action, books, ocr = false }: { action: (f: FormData) => Promise<ActionResult>; books: { id: string; title: string }[]; ocr?: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const isImages = files.length > 0 && files.every((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState<"new" | "append">("new");
  const [bookId, setBookId] = useState<string>(books[0]?.id ?? "");
  const input = useRef<HTMLInputElement>(null);
  const bad = file ? /\.hwp$/i.test(file.name) : false;
  const uploadDisabled = !file || bad || (isImages && !ocr) || (files.length > 1 && !isImages);
  const ext = file?.name.split(".").pop()?.toUpperCase();

  const pick = (list: File[]) => {
    setFiles(list);
    if (input.current) {
      const dt = new DataTransfer();
      for (const f of list) dt.items.add(f);
      input.current.files = dt.files;
    }
  };

  return (
    <ActionForm
      action={action}
      className="space-y-3"
      onSuccess={(r) => {
        const id = (r.data as { id?: string })?.id;
        if (id) router.push(`/app/imports/${id}`);
      }}
    >
      <input ref={input} type="file" name="file" accept=".hwpx,.docx,.pdf,image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      <input type="hidden" name="bookId" value={mode === "append" ? bookId : ""} />

      <div
        role="button"
        tabIndex={0}
        aria-label="단어장 파일 선택 (HWPX, DOCX, PDF, 사진 여러 장)"
        className={`dropzone${over ? " over" : ""}${file ? " has" : ""}`}
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
          const list = Array.from(e.dataTransfer.files ?? []);
          if (list.length) pick(list);
        }}
      >
        {files.length > 1 ? (
          <>
            <span className="digital" style={{ fontSize: 13 }}>
              {isImages ? "PHOTOS" : "FILES"} · {files.length} · {fmtSize(files.reduce((a, f) => a + f.size, 0))}
            </span>
            <span className="max-w-full truncate text-[14px] font-semibold">{files.map((f) => f.name).join(", ")}</span>
            <span className="lbl" style={{ color: isImages ? "rgba(232,67,26,0.7)" : "var(--accent)" }}>
              {isImages ? (ocr ? "사진 OCR 로 읽습니다 · 다른 파일 선택" : "OCR 사용 불가 · .env 에 OPENAI_API_KEY 필요") : "문서는 한 번에 하나만"}
            </span>
          </>
        ) : file ? (
          <>
            <span className="digital" style={{ fontSize: 13 }}>
              {ext} · {fmtSize(file.size)}
            </span>
            <span className="max-w-full truncate text-[14px] font-semibold">{file.name}</span>
            <span className="lbl" style={{ color: bad ? "var(--accent)" : "rgba(232,67,26,0.7)" }}>
              {bad ? ".hwp 는 지원하지 않음 → HWPX 로 저장" : isImages && !ocr ? "OCR 사용 불가 · .env 에 OPENAI_API_KEY 필요" : "다른 파일 선택"}
            </span>
          </>
        ) : (
          <>
            <span className="text-[26px] leading-none" aria-hidden>
              ↑
            </span>
            <span className="text-[14px] font-semibold">파일을 끌어다 놓거나 클릭</span>
            <span className="lbl-on">HWPX · DOCX · PDF · 사진 여러 장{ocr ? " (OCR)" : ""}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="seg" style={{ background: "rgba(255,244,240,0.18)" }}>
          <button type="button" className="seg-item" style={mode === "new" ? { background: "#fff4f0", color: "var(--accent)" } : { color: "rgba(255,244,240,0.9)" }} onClick={() => setMode("new")} aria-pressed={mode === "new"}>
            새 단어장
          </button>
          <button type="button" className="seg-item" style={mode === "append" ? { background: "#fff4f0", color: "var(--accent)" } : { color: "rgba(255,244,240,0.9)" }} onClick={() => setMode("append")} aria-pressed={mode === "append"} disabled={books.length === 0} title={books.length === 0 ? "이어 붙일 단어장이 없습니다" : undefined}>
            기존에 이어 붙이기
          </button>
        </div>
      </div>
      {mode === "append" && (
        <select className="input" value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="이어 붙일 단어장" style={{ background: "rgba(255,244,240,0.95)" }}>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      )}
      {mode === "new" && (
        <p className="text-[12px]" style={{ color: "rgba(255,244,240,0.75)" }}>
          제목은 파일 이름으로 만들어지고, 나중에 바꿀 수 있습니다.
        </p>
      )}

      {/* 비활성 모양은 globals.css 의 .card-accent 버튼 규칙이 맡는다 */}
      <button className="btn w-full py-3 text-[13px]" style={!uploadDisabled ? { background: "#fff4f0", color: "var(--accent)" } : undefined} disabled={uploadDisabled}>
        {isImages ? `사진 ${files.length}장 OCR · 자동 저장 →` : "업로드 · 자동 저장 →"}
      </button>
    </ActionForm>
  );
}
