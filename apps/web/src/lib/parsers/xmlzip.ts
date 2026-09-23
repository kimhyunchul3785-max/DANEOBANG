import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { FILE_LIMITS } from "../constants";
import type { DocBlock } from "./common";

export type ZipDoc = { zip: JSZip; entries: string[] };

/** ZIP 안전 검사 후 열기: 엔트리 수, 총 해제 크기, 경로 탈출 */
export async function openZipSafely(buf: Buffer): Promise<ZipDoc> {
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files);
  if (entries.length > FILE_LIMITS.zipMaxEntries) throw new Error("zip_too_many_entries");
  let total = 0;
  for (const name of entries) {
    if (name.includes("..") || name.startsWith("/") || name.includes("\\")) throw new Error("zip_path_traversal");
    const f = zip.files[name] as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
    total += f._data?.uncompressedSize ?? 0;
  }
  if (total > FILE_LIMITS.zipTotalMaxBytes) throw new Error("zip_bomb");
  return { zip, entries };
}

export const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: false, // DTD/외부 엔티티 처리 금지
  trimValues: false,
});

// preserveOrder 트리 노드 형태: { [tag]: Node[], ":@"?: attrs } | { "#text": string }
export type XNode = Record<string, unknown>;

export function tagOf(n: XNode): string | null {
  for (const k of Object.keys(n)) if (k !== ":@" && k !== "#text") return k;
  return null;
}

export function children(n: XNode): XNode[] {
  const t = tagOf(n);
  return t ? ((n[t] as XNode[]) ?? []) : [];
}

export function textOf(n: XNode, textTag: string, stopTag?: string): string {
  let out = "";
  const walk = (x: XNode) => {
    if ("#text" in x) return;
    const t = tagOf(x);
    if (!t || t === stopTag) return;
    if (t === textTag) {
      for (const c of x[t] as XNode[]) if ("#text" in c) out += String(c["#text"]);
      return;
    }
    for (const c of x[t] as XNode[]) walk(c);
  };
  walk(n);
  return out;
}

/** 일치하는 노드에서 더 내려가지 않는 탐색 (중첩 표 중복 방지) */
export function findTop(n: XNode, tag: string, out: XNode[] = []): XNode[] {
  const t = tagOf(n);
  if (!t) return out;
  if (t === tag) {
    out.push(n);
    return out;
  }
  for (const c of n[t] as XNode[]) findTop(c, tag, out);
  return out;
}

export function findAll(n: XNode, tag: string, out: XNode[] = []): XNode[] {
  const t = tagOf(n);
  if (!t) return out;
  if (t === tag) out.push(n);
  for (const c of n[t] as XNode[]) findAll(c, tag, out);
  return out;
}

/**
 * 문단/표 태그 이름을 받아 원문 순서의 블록 목록으로 변환.
 * 표 안의 문단은 셀 텍스트로만 사용하고, 표 밖 문단은 문단 블록으로 사용한다.
 */
export function walkBlocks(root: XNode[], names: { p: string; tbl: string; tr: string; tc: string; t: string }, sourcePrefix: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let pIdx = 0;
  let tIdx = 0;
  const visit = (nodes: XNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (!tag) continue;
      if (tag === names.tbl) {
        tIdx++;
        const rows: string[][] = [];
        for (const tr of findTop(n, names.tr)) {
          const cells: string[] = [];
          for (const tc of children(tr)) {
            if (tagOf(tc) !== names.tc) continue;
            // 셀 안의 중첩 표는 경고 대상: 텍스트만 평탄화
            const paras = findTop(tc, names.p);
            cells.push(paras.map((p) => textOf(p, names.t)).join("\n").trim() || textOf(tc, names.t).trim());
          }
          rows.push(cells);
        }
        blocks.push({ kind: "table", rows, source: `${sourcePrefix}/table${tIdx}` });
        continue;
      }
      if (tag === names.p) {
        const inner = findTop(n, names.tbl);
        if (inner.length) {
          // HWPX: 표가 문단 안 run 에 들어있음. 표 앞뒤 텍스트도 문단으로 취급
          const text = textOf(n, names.t, names.tbl).trim();
          if (text) {
            pIdx++;
            blocks.push({ kind: "paragraph", text, source: `${sourcePrefix}/p${pIdx}` });
          }
          visit(inner);
          continue;
        }
        const text = textOf(n, names.t).trim();
        pIdx++;
        if (text) blocks.push({ kind: "paragraph", text, source: `${sourcePrefix}/p${pIdx}` });
        continue;
      }
      visit(n[tag] as XNode[]);
    }
  };
  visit(root);
  return blocks;
}
