import type { ExtractResult, ExtractedRow } from "./parsers/common";
import { writeLog } from "./logger";

/**
 * 사진·스캔 PDF 단어장 OCR — OpenAI 비전 모델(기본 gpt-5.6-luna, .env OPENAI_MODEL 로 변경).
 *  - 이미지 여러 장: 장마다 병렬(OPENAI_CONCURRENCY, 기본 4)로 읽고 원래 순서로 합친다.
 *  - 스캔 PDF(텍스트 층 없음): pdf-lib 로 페이지를 묶음(기본 3쪽)으로 잘라 병렬로 보낸다.
 *  - 결과는 JSON 스키마(strict)로 받아 기존 파서와 같은 ExtractedRow 로 만든다. DAY 제목이 보이면 day 로 넘어온다.
 */
export function ocrConfigured() {
  return !!process.env.OPENAI_API_KEY;
}
export function ocrModel() {
  return process.env.OPENAI_MODEL || "gpt-5.6-luna";
}
const CONCURRENCY = () => Math.max(1, Math.min(8, Number(process.env.OPENAI_CONCURRENCY || 4)));
const PAGES_PER_CHUNK = () => Math.max(1, Math.min(10, Number(process.env.OCR_PAGES_PER_CHUNK || 3)));

const PROMPT = `이 자료는 영어 단어장(단어 목록) 페이지입니다. 표나 목록의 항목을 **보이는 순서대로** 모두 추출해 JSON 으로만 답하세요.
- english: 표제어(영어 단어·숙어). 번호·기호·발음기호는 제외.
- pos: 품사 약어(n, v, adj, adv, prep 등). 없으면 null.
- meaning: 한국어 뜻. 여러 뜻이면 원문처럼 쉼표로 이어서 한 문자열로.
- day: 페이지에 "DAY 3", "Day 12", "3일차" 같은 구획 제목이 있으면 그 이후 항목들에 그 번호를, 없으면 null.
- section: 지문·단원 제목(예: "지문 2", "Unit 5")이 있으면, 없으면 null.
예문·유의어·반의어·파생어 줄은 항목으로 만들지 마세요(그 단어의 뜻에도 넣지 마세요). 단어가 없는 페이지면 rows 를 빈 배열로.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          english: { type: "string" },
          pos: { type: ["string", "null"] },
          meaning: { type: "string" },
          day: { type: ["integer", "null"] },
          section: { type: ["string", "null"] },
        },
        required: ["english", "pos", "meaning", "day", "section"],
      },
    },
    notes: { type: "string" },
  },
  required: ["rows", "notes"],
} as const;

type OcrRow = { english: string; pos: string | null; meaning: string; day: number | null; section: string | null };
type Part = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail?: "auto" | "high" | "low" } | { type: "input_file"; filename: string; file_data: string };

async function callOpenAI(parts: Part[], label: string): Promise<{ rows: OcrRow[]; notes: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("ocr_not_configured");
  const body = {
    model: ocrModel(),
    input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, ...parts] }],
    text: { format: { type: "json_schema", name: "vocab_rows", schema: SCHEMA, strict: true } },
  };
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
      const json = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[]; error?: { message?: string }; output_text?: string };
      if (!res.ok) {
        lastErr = json.error?.message ?? `HTTP ${res.status}`;
        writeLog({ kind: "job", event: "ocr:error", detail: { label, attempt, status: res.status, error: lastErr } });
        if (res.status === 401 || res.status === 403 || res.status === 400) throw new Error(`ocr_api: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      const text = json.output_text ?? json.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "";
      const parsed = JSON.parse(text || "{}") as { rows?: OcrRow[]; notes?: string };
      writeLog({ kind: "job", event: "ocr:ok", detail: { label, ms: Date.now() - t0, rows: parsed.rows?.length ?? 0, model: ocrModel() } });
      return { rows: parsed.rows ?? [], notes: parsed.notes ?? "" };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("ocr_api:")) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      writeLog({ kind: "job", event: "ocr:retry", detail: { label, attempt, error: lastErr } });
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`ocr_failed: ${lastErr}`);
}

/** 제한 동시 실행 (순서 보존) */
async function parallel<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function toRows(chunks: { rows: OcrRow[]; source: string }[]): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  let lastDay: number | null = null;
  const seen = new Set<string>();
  for (const ch of chunks) {
    for (const r of ch.rows) {
      const english = (r.english ?? "").trim().replace(/^[\d.)\s]+/, "");
      const meaning = (r.meaning ?? "").trim();
      if (!english || !meaning) continue;
      if (r.day && r.day > 0) lastDay = r.day;
      const key = `${english.toLowerCase()}|${meaning}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ dayLabel: lastDay ? `DAY ${lastDay}` : null, dayNo: lastDay, english, pos: r.pos?.trim() || null, meaning, synonyms: null, section: r.section?.trim() || null, source: ch.source, warning: null });
    }
  }
  return rows;
}

/** 이미지 여러 장 (jpg/png/webp) → 단어 목록. 장마다 병렬 */
export async function ocrImages(images: { buf: Buffer; mime: string; name: string }[]): Promise<ExtractResult> {
  const t0 = Date.now();
  const results = await parallel(images, CONCURRENCY(), async (img, i) => {
    const r = await callOpenAI([{ type: "input_image", image_url: `data:${img.mime};base64,${img.buf.toString("base64")}`, detail: "high" }], `image ${i + 1}/${images.length} ${img.name}`);
    return { rows: r.rows, source: `사진 ${i + 1}`, notes: r.notes };
  });
  const rows = toRows(results);
  const warnings = results.filter((r) => r.rows.length === 0).map((r) => `${r.source}: 단어를 찾지 못했습니다${r.notes ? ` (${r.notes})` : ""}`);
  return { rows, warnings, meta: { profile: "ocr", ocr: true, model: ocrModel(), images: images.length, pages: images.length, ms: Date.now() - t0 } };
}

/** 스캔 PDF(텍스트 없음) → 페이지 묶음으로 잘라 병렬 OCR */
export async function ocrPdf(buf: Buffer): Promise<ExtractResult> {
  const t0 = Date.now();
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(buf, { ignoreEncryption: false });
  const n = src.getPageCount();
  const per = PAGES_PER_CHUNK();
  const chunks: { from: number; to: number; b64: string }[] = [];
  for (let from = 0; from < n; from += per) {
    const to = Math.min(n, from + per);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: to - from }, (_, k) => from + k));
    for (const p of pages) doc.addPage(p);
    chunks.push({ from: from + 1, to, b64: Buffer.from(await doc.save()).toString("base64") });
  }
  const results = await parallel(chunks, CONCURRENCY(), async (c) => {
    const r = await callOpenAI([{ type: "input_file", filename: `pages-${c.from}-${c.to}.pdf`, file_data: `data:application/pdf;base64,${c.b64}` }], `pdf p${c.from}-${c.to}`);
    return { rows: r.rows, source: c.from === c.to ? `p${c.from}` : `p${c.from}-${c.to}`, notes: r.notes };
  });
  const rows = toRows(results);
  const warnings = results.filter((r) => r.rows.length === 0).map((r) => `${r.source}: 단어를 찾지 못했습니다${r.notes ? ` (${r.notes})` : ""}`);
  return { rows, warnings, meta: { profile: "ocr", ocr: true, model: ocrModel(), pages: n, chunks: chunks.length, ms: Date.now() - t0 } };
}
