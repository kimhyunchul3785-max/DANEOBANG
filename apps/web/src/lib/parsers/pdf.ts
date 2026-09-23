import { blocksToRows, type DocBlock, type ExtractResult, type ExtractedRow, detectDay, detectSection, isPos, isEnglish, hasKorean, normalizePos, splitPosMeaning } from "./common";
import { FILE_LIMITS } from "../constants";

type TextItem = { str: string; transform: number[]; width: number; height: number };
type Item = { x: number; y: number; h: number; s: string };
type Line = { y: number; items: Item[]; text: string };

async function loadPdfjs() {
  // 서버 전용 (Node) — legacy 빌드, 워커 없이 동작
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return mod;
}

function groupLines(items: Item[]): Line[] {
  const lines: { y: number; items: Item[] }[] = [];
  for (const it of items) {
    let line = lines.find((l) => Math.abs(l.y - it.y) < 3);
    if (!line) {
      line = { y: it.y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    return { y: l.y, items: l.items, text: l.items.map((i) => i.s).join("  ").replace(/[ \t]{3,}/g, "  ").trim() };
  });
}

/**
 * 번호형 항목 프로필 (좌표 기반).
 * 왼쪽 열에 "001" 번호와 큰 글씨 표제어, 오른쪽 열에 "품사 + 뜻"(가장 큰 한국어 글씨)이 오는 레이아웃.
 * 예문·파생어·유의어 줄은 글씨가 작아 자동으로 제외된다. 문서에 DAY 제목이 있으면 그대로 따른다.
 */
function numberedFromPages(pages: { width: number; items: Item[] }[]): { rows: ExtractedRow[]; anchors: number; sections: number } {
  const rows: ExtractedRow[] = [];
  let anchors = 0;
  let day: { label: string; no: number } | null = null;
  let section: string | null = null;
  const sectionSet = new Set<string>();

  pages.forEach((page, pi) => {
    const leftMax = Math.min(...page.items.map((i) => i.x)) + page.width * 0.12;
    const isAnchor = (it: Item) => /^\d{1,3}$/.test(it.s.trim()) && it.x < leftMax && it.h <= 9.5;
    const lines = groupLines(page.items);
    const anchorLines = lines.map((l, idx) => ({ l, idx, a: l.items.find(isAnchor) })).filter((x): x is { l: Line; idx: number; a: Item } => !!x.a);
    // 페이지 순서대로 DAY/구획 제목 갱신 + 항목 처리
    let ai = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const d = detectDay(line.text);
      if (d) {
        day = d;
        continue;
      }
      const sec = detectSection(line.text) ?? detectSection(line.items.map((i) => i.s).join(" "));
      if (sec) {
        // 바로 아래 "19번" 같은 문항 번호가 있으면 함께 표기
        const q = lines[li + 1]?.text.replace(/\s+/g, "").match(/^(\d{1,2})번/);
        section = q ? `${sec} (${q[1]}번)` : sec;
        sectionSet.add(section);
        continue;
      }
      if (ai >= anchorLines.length || anchorLines[ai].idx !== li) continue;
      const { a } = anchorLines[ai];
      const next = anchorLines[ai + 1];
      ai++;
      const yTop = a.y + 6;
      const yBottom = next ? next.a.y + 6 : -Infinity;
      const band = page.items.filter((it) => it.y <= yTop && it.y > yBottom && it !== a);
      const left = band.filter((it) => it.x < leftMax && !/^\[/.test(it.s) && !/^\d{1,3}$/.test(it.s.trim()));
      if (!left.length) continue; // 쪽 번호 등: 표제어 없음
      const hMax = Math.max(...left.map((i) => i.h));
      if (hMax < 8) continue;
      const headLine = left.filter((i) => i.h >= hMax - 1);
      const headY = headLine[0].y;
      const english = headLine.filter((i) => Math.abs(i.y - headY) < 4).sort((x, y) => x.x - y.x).map((i) => i.s.trim()).join(" ").replace(/\s+/g, " ");
      if (!isEnglish(english)) continue;
      anchors++;
      const right = band.filter((it) => it.x >= leftMax);
      const korean = right.filter((it) => hasKorean(it.s));
      if (!korean.length) continue;
      const kMax = Math.max(...korean.map((i) => i.h));
      const meaningItems = korean.filter((i) => i.h >= kMax - 0.6).sort((p, q) => q.y - p.y || p.x - q.x);
      const m0 = meaningItems[0];
      // 같은 줄에 이어지는 뜻 조각 합치기
      const meaningLine = meaningItems.filter((i) => Math.abs(i.y - m0.y) < 4).sort((p, q) => p.x - q.x);
      let meaning = meaningLine.map((i) => i.s.trim()).join(" ").replace(/\s+/g, " ");
      let pos: string | null = null;
      const posItem = right.filter((i) => Math.abs(i.y - m0.y) < 7 && i.x < m0.x && isPos(i.s)).sort((p, q) => q.x - p.x)[0] ?? right.filter((i) => i.y >= m0.y - 8 && i.y <= yTop && isPos(i.s)).sort((p, q) => q.y - p.y)[0];
      if (posItem) pos = normalizePos(posItem.s);
      else {
        const pm = splitPosMeaning(meaning);
        pos = pm.pos;
        meaning = pm.meaning;
      }
      // 유의어: "유" 표시 바로 오른쪽 영어
      let synonyms: string | null = null;
      const syn = right.filter((i) => i.s.trim() === "유");
      const collected: string[] = [];
      for (const s of syn) {
        const after = right.filter((i) => Math.abs(i.y - s.y) < 4 && i.x > s.x).sort((p, q) => p.x - q.x);
        const first = after[0];
        if (first && isEnglish(first.s)) collected.push(first.s.trim());
      }
      if (collected.length) synonyms = [...new Set(collected)].join(", ");
      rows.push({
        dayLabel: day?.label ?? null,
        dayNo: day?.no ?? null,
        english,
        pos,
        meaning,
        synonyms,
        section,
        source: `page${pi + 1}/no.${a.s.trim()}`,
        warning: null,
      });
    }
  });
  return { rows, anchors, sections: sectionSet.size };
}

/** 텍스트 PDF 분석: 번호형(좌표) 프로필 → 표/한 줄 프로필 순으로 시도한다. 스캔 페이지는 needs_ocr 경고. */
export async function parsePdf(buf: Buffer): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise.catch((e: Error) => {
    if (/password/i.test(e.message) || e.name === "PasswordException") throw new Error("encrypted");
    throw new Error("no_text");
  });
  if (doc.numPages > FILE_LIMITS.pdfMaxPages) throw new Error("pdf_too_many_pages");
  const pages: { width: number; items: Item[] }[] = [];
  const emptyPages: number[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items as unknown as TextItem[]) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      items.push({ x: raw.transform[4], y: raw.transform[5], h: Math.abs(raw.height || raw.transform[3] || 0), s: raw.str });
    }
    if (items.length === 0) emptyPages.push(pageNo);
    pages.push({ width, items });
  }
  await doc.destroy();
  const warnings: string[] = [];
  if (emptyPages.length) warnings.push(`텍스트가 없는 페이지 ${emptyPages.join(", ")} (needs_ocr): 스캔 이미지로 보입니다. OCR은 지원하지 않으므로 해당 페이지는 수동 입력이 필요합니다.`);
  if (emptyPages.length === pages.length) throw new Error("no_text");

  // 1) 번호형 (좌표) 프로필
  const numbered = numberedFromPages(pages);
  if (numbered.anchors >= 5 && numbered.rows.length >= numbered.anchors * 0.6) {
    return { rows: numbered.rows, warnings, meta: { pages: pages.length, emptyPages, profile: "numbered", anchors: numbered.anchors, sections: numbered.sections } };
  }

  // 2) 줄 → 블록. 한 줄에 여러 쌍이 있을 수 있어 표 행처럼 취급 (공백 2칸 이상 또는 탭으로 셀 분리 시도)
  const blocks: DocBlock[] = [];
  pages.forEach((page, pi) => {
    groupLines(page.items).forEach((l, li) => {
      const line = l.text;
      if (detectDay(line) || detectSection(line)) {
        blocks.push({ kind: "paragraph", text: line, source: `page${pi + 1}/line${li + 1}` });
        return;
      }
      const parts = line.split(/\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const cells: string[] = [];
        for (const p of parts) {
          const m = p.match(/^([A-Za-z][A-Za-z'’\-. ]{0,59}?)\s+((?:\(?(?:n|v|a|ad|adj|adv|prep|conj|pron|int|vi|vt)\.?\)?\s+)?.*[가-힣].*)$/);
          if (m) cells.push(m[1].trim(), m[2].trim());
          else cells.push(p);
        }
        blocks.push({ kind: "table", rows: [cells], source: `page${pi + 1}/line${li + 1}` });
      } else {
        blocks.push({ kind: "paragraph", text: line, source: `page${pi + 1}/line${li + 1}` });
      }
    });
  });
  const { rows, warnings: w2, profile } = blocksToRows(blocks);
  return { rows, warnings: [...warnings, ...w2], meta: { pages: pages.length, emptyPages, profile } };
}
