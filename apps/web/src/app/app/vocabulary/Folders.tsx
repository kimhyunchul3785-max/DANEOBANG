"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { Icon } from "@/components/Icon";
import { createFolderAction, renameFolderAction, deleteFolderAction, toggleBookTagAction, trashBookAction } from "./actions";

/** v5.6 — 폴더 → 태그 (한 단어장에 여러 개). 데이터는 BookFolder · VocabBookTag */
export type Folder = { id: string; name: string; count: number };

/**
 * 태그 줄: 전체 · #태그 칩 · 태그 없음 · [+ 태그].
 * 태그를 고르면 ✎ 이름 바꾸기 · 🗑 태그 지우기 (단어장은 그대로).
 */
export function FolderBar({ folders, current, total, noFolder }: { folders: Folder[]; current: string | null; total: number; noFolder: number }) {
  const [mode, setMode] = useState<"idle" | "new" | "rename">("idle");
  const [pending, start] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cur = folders.find((f) => f.id === current) ?? null;
  useEffect(() => {
    if (mode !== "idle") inputRef.current?.focus();
  }, [mode]);
  const submit = (fd: FormData) =>
    start(async () => {
      const r = mode === "new" ? await createFolderAction(fd) : await renameFolderAction(fd);
      toast(r.message ?? "", r.ok);
      if (r.ok) {
        setMode("idle");
        const id = (r.data as { folderId?: string } | undefined)?.folderId;
        if (mode === "new" && id) router.push(`/app/vocabulary?tag=${id}`);
        else router.refresh();
      }
    });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="folder-bar">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="태그">
        <Link href="/app/vocabulary" className={`chip${!current ? " on" : ""}`} role="tab" aria-selected={!current} data-folder="all">
          전체
          <span className="chip-sub">{total}</span>
        </Link>
        {folders.map((f) => (
          <Link key={f.id} href={`/app/vocabulary?tag=${f.id}`} className={`chip${current === f.id ? " on" : ""}`} role="tab" aria-selected={current === f.id} data-folder={f.name}>
            #{f.name}
            <span className="chip-sub">{f.count}</span>
          </Link>
        ))}
        {folders.length > 0 && noFolder > 0 && (
          <Link href="/app/vocabulary?tag=none" className={`chip${current === "none" ? " on" : ""}`} role="tab" aria-selected={current === "none"} data-folder="none">
            태그 없음
            <span className="chip-sub">{noFolder}</span>
          </Link>
        )}
      </div>
      {mode === "idle" ? (
        <span className="flex items-center gap-1">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("new")} data-testid="folder-new">
            + 태그
          </button>
          {cur && (
            <>
              <button type="button" className="icon-btn" onClick={() => setMode("rename")} title={`#${cur.name} 이름 바꾸기`} aria-label="태그 이름 바꾸기" data-testid="folder-rename">
                <Icon name="pencil" />
              </button>
              <button
                type="button"
                className="icon-btn danger"
                disabled={pending}
                title={`#${cur.name} 태그 지우기`}
                aria-label="태그 지우기"
                data-testid="folder-delete"
                onClick={() => {
                  if (!confirm(`#${cur.name} 태그를 지울까요? 단어장 ${cur.count}개는 그대로 남아요.`)) return;
                  start(async () => {
                    const r = await deleteFolderAction(cur.id);
                    toast(r.message ?? "", r.ok);
                    if (r.ok) router.push("/app/vocabulary");
                  });
                }}
              >
                <Icon name="trash" />
              </button>
            </>
          )}
        </span>
      ) : (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
          data-testid="folder-form"
        >
          {mode === "rename" && cur && <input type="hidden" name="folderId" value={cur.id} />}
          <input ref={inputRef} className="input" name="name" maxLength={30} defaultValue={mode === "rename" ? cur?.name : ""} placeholder="태그 이름" style={{ padding: "6px 10px", width: 160 }} onKeyDown={(e) => e.key === "Escape" && setMode("idle")} />
          <button className="btn-primary btn-sm" disabled={pending} data-testid="folder-save">
            {mode === "new" ? "만들기" : "저장"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("idle")}>
            취소
          </button>
        </form>
      )}
    </div>
  );
}

/** 카드의 ⋯ 메뉴: 태그(여러 개 체크) · 휴지통으로 */
export function BookMenu({ bookId, title, tagIds, folders }: { bookId: string; title: string; tagIds: string[]; folders: Folder[] }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(tagIds);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const key = tagIds.join(",");
  useEffect(() => setOn(key ? key.split(",") : []), [key]);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  const toggle = (tagId: string, next: boolean) => {
    const prev = on;
    setOn(next ? [...on, tagId] : on.filter((x) => x !== tagId)); // 바로 체크 표시, 실패하면 되돌림
    start(async () => {
      const fd = new FormData();
      fd.set("bookId", bookId);
      fd.set("tagId", tagId);
      fd.set("on", next ? "1" : "0");
      const r = await toggleBookTagAction(fd);
      if (!r.ok) {
        setOn(prev);
        toast(r.message ?? "실패했습니다.", false);
      } else router.refresh();
    });
  };
  return (
    <div className="relative z-10" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`${title} 메뉴`} onClick={() => setOpen(!open)} data-testid="book-menu">
        <Icon name="more" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl p-1.5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }} data-testid="book-menu-open">
          <div className="lbl px-2 pb-1 pt-1">태그</div>
          {folders.map((f) => {
            const checked = on.includes(f.id);
            return (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-[var(--fill)]" data-testid="book-move" data-folder={f.name}>
                <input type="checkbox" checked={checked} onChange={() => toggle(f.id, !checked)} style={{ width: 16, height: 16 }} />#{f.name}
              </label>
            );
          })}
          {folders.length === 0 && <p className="muted px-2 py-1 text-[12.5px]">태그가 없어요.</p>}
          <div className="my-1.5" style={{ height: 1, background: "var(--line)" }} />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--accent)" }}
            disabled={pending}
            data-testid="book-delete"
            onClick={() => {
              if (!confirm(`"${title}"을 휴지통으로 옮길까요?`)) return;
              start(async () => {
                const r = await trashBookAction(bookId);
                toast(r.message ?? "", r.ok);
                setOpen(false);
                if (r.ok) router.refresh();
              });
            }}
          >
            <Icon name="trash" size={16} />
            휴지통으로
          </button>
        </div>
      )}
    </div>
  );
}
