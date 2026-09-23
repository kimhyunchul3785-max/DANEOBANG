"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import type { ActionResult } from "@/components/ActionForm";

export type UploadBook = { id: string; title: string; words: number; days: number };

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const FORMATS: [string, string][] = [
  ["HWPX", ""],
  ["DOCX", ""],
  ["PDF", ""],
  ["사진", "여러 장"],
];

/**
 * 업로드 폼 (강조 카드 안): 드롭존 → 저장 위치(새 단어장 / 기존에 이어 붙이기 → 단어장 목록에서 고르기) → 업로드.
 *  - 고른 파일은 흰 카드로 바뀌고 ×로 바로 취소할 수 있다.
 *  - 이어 붙일 단어장은 네이티브 select 대신 단어 수·DAY 가 보이는 목록에서 고른다 (6개 넘으면 검색).
 */
export function UploadForm({ action, books, ocr = false, tip }: { action: (f: FormData) => Promise<ActionResult>; books: UploadBook[]; ocr?: boolean; tip?: React.ReactNode }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const isImages = files.length > 0 && files.every((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState<"new" | "append">("new");
  const [bookId, setBookId] = useState<string>(books[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [existingBookId, setExistingBookId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const bad = file ? /\.hwp$/i.test(file.name) : false;
  const mixed = files.length > 1 && !isImages;
  const problem = bad ? ".hwp 는 지원하지 않아요 → 한글에서 HWPX 로 저장" : isImages && !ocr ? "OCR 사용 불가 · .env 에 OPENAI_API_KEY 필요" : mixed ? "문서는 한 번에 하나만 (사진은 여러 장 가능)" : null;
  const uploadDisabled = !file || !!problem || (mode === "append" && !bookId) || pending;
  const ext = file?.name.split(".").pop()?.toUpperCase() ?? "";
  const totalSize = files.reduce((a, f) => a + f.size, 0);
  const visibleBooks = useMemo(() => (q.trim() ? books.filter((b) => b.title.toLowerCase().includes(q.trim().toLowerCase())) : books), [books, q]);
  const state = pending ? "UPLOADING" : files.length === 0 ? "READY" : isImages ? `${files.length} PHOTO${files.length > 1 ? "S" : ""}` : "1 FILE";

  const pick = (list: File[]) => {
    setFiles(list);
    setError(null);
    setExistingBookId(null);
    if (input.current) {
      const dt = new DataTransfer();
      for (const f of list) dt.items.add(f);
      input.current.files = dt.files;
    }
  };
  const clear = () => {
    pick([]);
    if (input.current) input.current.value = "";
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="lbl-on">Upload</div>
        <span className="digital" style={{ color: "rgba(255,244,240,0.85)" }} data-testid="upload-state" aria-live="polite">
          {state}
        </span>
      </div>
      <div className="mt-1.5 mb-4 flex items-center gap-2">
        <div className="text-[20px] font-semibold leading-tight">파일 올리면 끝</div>
        {tip}
      </div>
    <form
      className="space-y-3"
      data-testid="upload-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          toast(r.message ?? (r.ok ? "" : "실패했습니다."), r.ok);
          if (!r.ok) {
            setError(r.message ?? "실패했습니다.");
            setExistingBookId((r.data as { existingBookId?: string } | undefined)?.existingBookId ?? null);
            return;
          }
          const id = (r.data as { id?: string })?.id;
          if (id) router.push(`/app/imports/${id}`);
          else router.refresh();
        });
      }}
    >
      <input ref={input} type="file" name="file" accept=".hwpx,.docx,.pdf,image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(Array.from(e.target.files ?? []))} />
      <input type="hidden" name="bookId" value={mode === "append" ? bookId : ""} />

      <div
        role="button"
        tabIndex={0}
        aria-label="단어장 파일 선택 (HWPX, DOCX, PDF, 사진 여러 장)"
        className={`dropzone${over ? " over" : ""}${file ? " has" : ""}${problem ? " bad" : ""}`}
        data-testid="dropzone"
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
        {file ? (
          <div className="dz-file">
            <span className="dz-ext digital" aria-hidden>
              {isImages ? (files.length > 1 ? `×${files.length}` : "IMG") : ext.slice(0, 4)}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px] font-semibold" title={files.map((f) => f.name).join(", ")}>
                {files.length > 1 ? `${file.name} 외 ${files.length - 1}장` : file.name}
              </span>
              <span className={`block text-[12px]${problem ? " font-semibold" : ""}`} style={{ color: problem ? "var(--accent)" : "var(--ink-3)" }}>
                {problem ?? `${fmtSize(totalSize)} · ${isImages ? "사진을 OCR 로 읽어요" : "누르면 다른 파일로"}`}
              </span>
            </span>
            <button
              type="button"
              className="dz-clear"
              aria-label="선택 취소"
              title="선택 취소"
              data-testid="dropzone-clear"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <span className="dz-icon" aria-hidden>
              ↑
            </span>
            <span className="text-[14px] font-semibold">파일을 끌어다 놓거나 클릭</span>
            <span className="dz-fmts" aria-hidden>
              {FORMATS.map(([k, sub]) => (
                <span key={k} className="dz-fmt">
                  {k}
                  {sub && <em>{sub}</em>}
                </span>
              ))}
            </span>
          </>
        )}
      </div>

      <div>
        <div className="lbl-on mb-1.5">Save to · 저장 위치</div>
        <div className="seg seg-on-accent w-full" role="radiogroup" aria-label="저장 위치">
          <button type="button" className={`seg-item flex-1${mode === "new" ? " on" : ""}`} onClick={() => setMode("new")} role="radio" aria-checked={mode === "new"} data-testid="mode-new">
            새 단어장
          </button>
          <button
            type="button"
            className={`seg-item flex-1${mode === "append" ? " on" : ""}`}
            onClick={() => setMode("append")}
            role="radio"
            aria-checked={mode === "append"}
            disabled={books.length === 0}
            title={books.length === 0 ? "이어 붙일 단어장이 없습니다" : undefined}
            data-testid="mode-append"
          >
            기존에 이어 붙이기
          </button>
        </div>
      </div>

      {mode === "new" ? (
        <p className="text-[12px] leading-snug" style={{ color: "rgba(255,244,240,0.78)" }}>
          제목은 파일 이름 그대로 · 나중에 바꿀 수 있어요
        </p>
      ) : (
        <div className="book-pick" data-testid="book-pick">
          {books.length > 6 && <input className="book-pick-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="단어장 이름 검색" aria-label="단어장 검색" />}
          <div className="book-pick-list" role="radiogroup" aria-label="이어 붙일 단어장">
            {visibleBooks.map((b) => {
              const on = b.id === bookId;
              return (
                <button key={b.id} type="button" role="radio" aria-checked={on} className={`book-pick-row${on ? " on" : ""}`} onClick={() => setBookId(b.id)} data-testid="book-pick-row">
                  <span className="book-pick-dot" aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate" title={b.title}>
                      {b.title}
                    </span>
                    <span className="digital block" style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>
                      {b.words} W · DAY {b.days}
                    </span>
                  </span>
                </button>
              );
            })}
            {visibleBooks.length === 0 && <p className="px-3 py-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>검색 결과가 없어요.</p>}
          </div>
          <p className="px-1 pt-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>새 단어는 마지막 DAY 뒤에 이어 붙습니다.</p>
        </div>
      )}

      {error && (
        <p className="text-[12.5px] font-semibold" style={{ color: "#fff4f0" }} role="alert" data-testid="upload-error">
          {error}
          {existingBookId && (
            <a href={`/app/vocabulary/${existingBookId}`} className="ml-1 underline" data-testid="upload-existing-link">
              그 단어장 열기 →
            </a>
          )}
        </p>
      )}

      {/* 비활성 모양은 globals.css 의 .card-accent 버튼 규칙이 맡는다 */}
      <button className="btn w-full py-3 text-[13px]" style={!uploadDisabled ? { background: "#fff4f0", color: "var(--accent)" } : undefined} disabled={uploadDisabled} data-testid="upload-submit">
        {pending ? "올리는 중…" : isImages ? `사진 ${files.length}장 OCR · 자동 저장 →` : mode === "append" ? "업로드 · 이어 붙이기 →" : "업로드 · 자동 저장 →"}
      </button>
    </form>
    </>
  );
}
