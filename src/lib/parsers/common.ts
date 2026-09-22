export type ExtractedRow = {
  dayLabel: string | null;
  dayNo: number | null;
  english: string;
  pos: string | null;
  meaning: string;
  synonyms: string | null;
  section: string | null;
  source: string;
  warning: string | null;
};

export type ExtractResult = {
  rows: ExtractedRow[];
  warnings: string[];
  meta: Record<string, unknown>;
};

/** 문서에서 읽어낸 구조: 문단 또는 표 (원문 순서 유지) */
export type DocBlock =
  | { kind: "paragraph"; text: string; source: string }
  | { kind: "table"; rows: string[][]; source: string };

/**
 * DAY 감지는 엄격하게: "DAY 3", "Day 3", "DAY-3", "[DAY 3]", "3일차" 만 인정한다.
 * "9월 17일" 같은 날짜, "D-3", "3일" 은 DAY 로 보지 않는다 (예전 정규식이 전체 문서를 DAY 17 로 묶던 원인).
 */
const DAY_RE = /(?:^|[\s[(])(?:DAY|Day)\s*[-.]?\s*(\d{1,3})(?:\s*(?:일차|차))?(?:[\])\s:.·-]|$)/;
const DAY_RE_KO = /^\s*(\d{1,3})\s*일차\s*$/;
const POS_ONE = "(?:n|v|a|ad|adj|adv|prep|conj|pron|int|interj|aux|art|det|vi|vt|num|phr|명|동|형|부|전|접|대|감)";
const POS_RE = new RegExp(`^${POS_ONE}\\.?(?:\\s*[/,]\\s*${POS_ONE}\\.?)*$`, "i");
const POS_PREFIX_RE = new RegExp(`^\\(?(${POS_ONE}\\.?(?:\\s*[/,]\\s*${POS_ONE}\\.?)*)\\)?\\s+(.*[가-힣].*)$`, "i");
const ENGLISH_RE = /^[A-Za-z][A-Za-z'’\-. /()]*$/;
const KOREAN_RE = /[가-힣]/;
const SECTION_RE = /^\s*(?:P\s*A\s*S\s*S\s*A\s*G\s*E|PASSAGE|Passage|지문|UNIT|Unit|CHAPTER|Chapter|LESSON|Lesson|단원|Part|PART)\s*[-.:]?\s*(\d{1,3})\s*$/;

export function detectDay(text: string): { label: string; no: number } | null {
  const t = text.trim();
  if (!t || t.length > 40) return null;
  let m = t.match(DAY_RE);
  if (m) return { label: `DAY ${Number(m[1])}`, no: Number(m[1]) };
  m = t.match(DAY_RE_KO);
  if (m) return { label: `DAY ${Number(m[1])}`, no: Number(m[1]) };
  return null;
}

/** 지문/단원 구획 제목 ("PASSAGE 01", "P A S S A G E  0 1", "Unit 3") */
export function detectSection(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 30) return null;
  // "P A S S A G E  0 1" 처럼 자간이 벌어진 제목도 인식
  const m = t.match(SECTION_RE) ?? t.replace(/\s+/g, "").match(SECTION_RE);
  if (!m) return null;
  const kind = t.replace(/\s/g, "").replace(/\d+$/, "").replace(/[-.:]$/, "").toUpperCase();
  return `${kind} ${String(Number(m[1])).padStart(2, "0")}`;
}

export function isPos(text: string) {
  return POS_RE.test(text.trim());
}
export function normalizePos(p: string | null | undefined) {
  if (!p) return null;
  const t = p.trim().replace(/\s+/g, "").replace(/\.$/, "");
  if (!t) return null;
  return t + ".";
}
export function isEnglish(text: string) {
  const t = text.trim();
  return t.length >= 1 && t.length <= 60 && ENGLISH_RE.test(t) && /[A-Za-z]{2,}/.test(t) && !/^(day|no|num|number|passage|unit)\.?$/i.test(t) && !isPos(t);
}
export function hasKorean(text: string) {
  return KOREAN_RE.test(text);
}
/** 짧은 항목 번호: "001", "12", "12." */
export function isEntryNumber(text: string) {
  return /^\s*\d{1,3}\s*[.)]?\s*$/.test(text);
}

/** "품사 뜻" 형태에서 품사 분리 */
export function splitPosMeaning(text: string): { pos: string | null; meaning: string } {
  const m = text.trim().match(POS_PREFIX_RE);
  if (m) return { pos: normalizePos(m[1]), meaning: m[2].trim() };
  return { pos: null, meaning: text.trim() };
}

/** "영어 (품사) 뜻" 한 줄 파싱 */
export function parseInlineEntry(line: string): { english: string; pos: string | null; meaning: string } | null {
  const t = line.replace(/^\s*\d{1,3}[.)]\s*/, "").trim();
  const m = t.match(new RegExp(`^([A-Za-z][A-Za-z'’\\-. ]{0,59}?)\\s+(?:\\(?(${POS_ONE}\\.?(?:\\s*[/,]\\s*${POS_ONE}\\.?)*)\\)?\\s+)?(.*[가-힣].*)$`, "i"));
  if (!m) return null;
  const english = m[1].trim();
  if (!/[A-Za-z]{2,}/.test(english) || isPos(english)) return null;
  return { english, pos: normalizePos(m[2]), meaning: m[3].trim() };
}

function row(base: Partial<ExtractedRow> & Pick<ExtractedRow, "english" | "meaning" | "source">, day: { label: string; no: number } | null, section: string | null): ExtractedRow {
  return {
    dayLabel: day?.label ?? null,
    dayNo: day?.no ?? null,
    english: base.english,
    pos: base.pos ?? null,
    meaning: base.meaning,
    synonyms: base.synonyms ?? null,
    section,
    source: base.source,
    warning: base.warning ?? null,
  };
}

/**
 * 번호형 항목 프로필 (모의고사 단어장 등):
 *   001 / grip / [발음] / v 꽉 붙잡다 / 예문… / 유 clutch … 반 release …
 * 문단 순서 기준으로 번호 → 표제어 → (품사) 뜻 을 찾는다. 예문·파생어·유의어 줄은 표제어로 쓰지 않는다.
 */
export function numberedEntriesFromBlocks(blocks: DocBlock[]): { rows: ExtractedRow[]; anchors: number } {
  const paras: { text: string; source: string }[] = [];
  for (const b of blocks) {
    if (b.kind === "paragraph") paras.push({ text: b.text.trim(), source: b.source });
    else b.rows.forEach((r, i) => paras.push({ text: r.map((c) => c.trim()).filter(Boolean).join("  "), source: `${b.source}/row${i + 1}` }));
  }
  const rows: ExtractedRow[] = [];
  let day: { label: string; no: number } | null = null;
  let section: string | null = null;
  let anchors = 0;
  for (let i = 0; i < paras.length; i++) {
    const t = paras[i].text;
    if (!t) continue;
    const d = detectDay(t);
    if (d) {
      day = d;
      continue;
    }
    const sec = detectSection(t);
    if (sec) {
      section = sec;
      continue;
    }
    if (!isEntryNumber(t)) continue;
    anchors++;
    // 표제어: 번호 다음 4줄 안의 첫 영어 전용 줄 (발음기호 [..] 제외)
    let english: string | null = null;
    let j = i + 1;
    for (; j < Math.min(paras.length, i + 5); j++) {
      const c = paras[j].text;
      if (!c || /^\[.*\]$/.test(c) || isEntryNumber(c)) continue;
      if (isEnglish(c)) {
        english = c;
        break;
      }
      // "grip  v 꽉 붙잡다" 처럼 한 줄에 합쳐진 경우
      const inline = parseInlineEntry(c);
      if (inline) {
        rows.push(row({ ...inline, source: paras[j].source, warning: day ? null : null }, day, section));
        english = "";
        break;
      }
    }
    if (english === "") continue;
    if (!english) continue;
    // 뜻: 표제어 앞뒤 5줄 안에서 "품사 한국어" 또는 한국어 짧은 줄 (예문처럼 길거나 마침표로 끝나는 줄은 제외)
    let pos: string | null = null;
    let meaning: string | null = null;
    const cand = [...Array.from({ length: 6 }, (_, k) => j + 1 + k), ...Array.from({ length: 3 }, (_, k) => i + 1 + k)].filter((k) => k < paras.length && k !== j);
    for (const k of cand) {
      const c = paras[k].text;
      if (!c || !hasKorean(c) || isEntryNumber(c)) continue;
      const pm = splitPosMeaning(c);
      const looksSentence = /[.!?]$/.test(pm.meaning) || pm.meaning.length > 28 || /\s(?:은|는|이|가|을|를)\s/.test(pm.meaning);
      if (pm.pos || !looksSentence) {
        pos = pm.pos;
        meaning = pm.meaning;
        break;
      }
    }
    if (!meaning) continue;
    // 유의어: "유 clutch 움켜잡다" 줄
    let synonyms: string | null = null;
    for (let k = j + 1; k < Math.min(paras.length, j + 8); k++) {
      const c = paras[k].text;
      if (isEntryNumber(c)) break;
      const m = c.match(/(?:^|\s)유\s+([A-Za-z][A-Za-z' -]*?)(?=\s+[가-힣]|\s+반\s|$)/);
      if (m) {
        synonyms = m[1].trim();
        break;
      }
    }
    rows.push(row({ english, pos, meaning, synonyms, source: paras[j].source }, day, section));
  }
  return { rows, anchors };
}

/** 표/문단 블록 → 후보 행. DAY 문맥은 문단 제목 또는 셀 값에서 추적한다. */
export function blocksToRows(blocks: DocBlock[]): { rows: ExtractedRow[]; warnings: string[]; profile: "numbered" | "table" } {
  // 1) 번호형 프로필 시도
  const numbered = numberedEntriesFromBlocks(blocks);
  if (numbered.anchors >= 5 && numbered.rows.length >= numbered.anchors * 0.6) {
    return { rows: numbered.rows, warnings: [], profile: "numbered" };
  }

  // 2) 표/한 줄 프로필
  const rows: ExtractedRow[] = [];
  const warnings: string[] = [];
  let currentDay: { label: string; no: number } | null = null;
  let section: string | null = null;
  let unmatchedCells = 0;

  for (const b of blocks) {
    if (b.kind === "paragraph") {
      const d = detectDay(b.text);
      if (d) {
        currentDay = d;
        continue;
      }
      const sec = detectSection(b.text);
      if (sec) {
        section = sec;
        continue;
      }
      const e = parseInlineEntry(b.text);
      if (e) rows.push(row({ ...e, source: b.source }, currentDay, section));
      continue;
    }
    // table
    for (let ri = 0; ri < b.rows.length; ri++) {
      const cells = b.rows[ri].map((c) => c.replace(/\s+/g, " ").trim());
      // 행 안의 DAY 셀 (DAY 열 양식)
      let rowDay = currentDay;
      for (const c of cells) {
        const d = detectDay(c);
        if (d) {
          rowDay = d;
          // 표 전체가 하나의 DAY 제목 행인 경우 (셀 1개 또는 나머지 비어있음)
          if (cells.filter((x) => x).length === 1) currentDay = d;
        }
      }
      const nonEmpty = cells.filter((x) => x);
      if (nonEmpty.length <= 1 && rowDay && detectDay(nonEmpty[0] ?? "")) continue;
      if (nonEmpty.length === 1 && detectSection(nonEmpty[0])) {
        section = detectSection(nonEmpty[0]);
        continue;
      }
      // 헤더 행 건너뛰기
      if (cells.some((c) => /^(영어|단어|word|english|뜻|의미|meaning|품사|pos)$/i.test(c))) continue;

      let found = 0;
      for (let ci = 0; ci < cells.length; ci++) {
        const c = cells[ci];
        if (!isEnglish(c) || isPos(c) || isEntryNumber(c)) continue;
        let pos: string | null = null;
        let meaning: string | null = null;
        let j = ci + 1;
        if (j < cells.length && isPos(cells[j])) {
          pos = normalizePos(cells[j]);
          j++;
        }
        if (j < cells.length && hasKorean(cells[j])) {
          const pm = splitPosMeaning(cells[j]);
          meaning = pm.meaning;
          if (pm.pos && !pos) pos = pm.pos;
        }
        if (meaning) {
          rows.push(row({ english: c, pos, meaning, source: `${b.source}/row${ri + 1}` }, rowDay, section));
          found++;
          ci = j;
        }
      }
      if (found === 0 && cells.some(hasKorean) && cells.some(isEnglish)) unmatchedCells++;
    }
  }
  if (unmatchedCells > 0) warnings.push(`영어·뜻 연결을 확정하지 못한 표 행이 ${unmatchedCells}개 있습니다. 원본을 확인하세요.`);
  return { rows, warnings, profile: "table" };
}

export function detectFormat(buf: Buffer, fileName: string): "hwpx" | "docx" | "pdf" | "hwp" | "zip" | "unknown" {
  const head = buf.subarray(0, 8);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "hwp"; // OLE(HWP 5.x)
  if (buf.subarray(0, 17).toString("latin1").startsWith("HWP Document File")) return "hwp"; // HWP 3.x
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext === "hwpx") return "hwpx";
    if (ext === "docx") return "docx";
    return "zip";
  }
  return "unknown";
}
