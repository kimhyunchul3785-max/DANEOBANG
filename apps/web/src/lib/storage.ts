import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export function storageDir() {
  const d = process.env.STORAGE_DIR || "./storage";
  return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
}

/** 업로드/생성 파일 저장. 반환값은 storage 루트 기준 상대 경로 */
export async function saveFile(kind: "uploads" | "scans" | "pdf" | "wrongnotes" | "scans-corrected" | "logos", academyId: string, ext: string, data: Buffer) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "bin";
  const rel = path.join(kind, academyId, `${crypto.randomUUID()}.${safeExt}`);
  const abs = path.join(storageDir(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export function absPath(rel: string) {
  const abs = path.join(storageDir(), rel);
  if (!abs.startsWith(storageDir())) throw new Error("bad_path");
  return abs;
}

export async function readFile(rel: string) {
  return fs.readFile(absPath(rel));
}
