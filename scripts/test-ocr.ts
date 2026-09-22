/* eslint-disable */
// OCR 파이프라인 검증 (실제 OpenAI 호출 없이 fetch 를 가짜로 바꿔서): 사진 3장 병렬 → 순서 유지·DAY 전파·중복 제거, 스캔 PDF → 페이지 묶음 분할·병렬
import fs from "fs";
import path from "path";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_CONCURRENCY = "2";
process.env.OCR_PAGES_PER_CHUNK = "2";
import { ocrImages, ocrPdf } from "../src/lib/ocr";

const calls: { label: string; at: number; kind: string }[] = [];
let inflight = 0;
let maxInflight = 0;
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  const parts = body.input[0].content as { type: string; filename?: string; image_url?: string }[];
  const img = parts.find((p) => p.type === "input_image");
  const file = parts.find((p) => p.type === "input_file");
  const label = file ? file.filename! : `img:${img!.image_url!.slice(5, 15)}`;
  inflight++;
  maxInflight = Math.max(maxInflight, inflight);
  await new Promise((r) => setTimeout(r, 120));
  inflight--;
  calls.push({ label, at: Date.now(), kind: file ? "pdf" : "image" });
  const n = calls.length;
  const rows = file
    ? [{ english: `pdfword${n}`, pos: "n", meaning: `뜻${n}`, day: null, section: null }]
    : n === 1
      ? [{ english: "apple", pos: "n", meaning: "사과", day: 1, section: null }, { english: "banana", pos: "n", meaning: "바나나", day: null, section: null }]
      : n === 2
        ? [{ english: "apple", pos: "n", meaning: "사과", day: null, section: null }, { english: "cherry", pos: "n", meaning: "체리", day: 2, section: null }]
        : [{ english: "3. durian", pos: null, meaning: "두리안", day: null, section: "지문 1" }];
  return new Response(JSON.stringify({ output_text: JSON.stringify({ rows, notes: "" }) }), { status: 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;

(async () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const r = await ocrImages([1, 2, 3].map((i) => ({ buf: Buffer.concat([png, Buffer.from(`img${i}`)]), mime: "image/png", name: `p${i}.png` })));
  const en = r.rows.map((x) => `${x.english}:${x.dayNo ?? "-"}`).join(",");
  if (en !== "apple:1,banana:1,cherry:2,durian:2") throw new Error("image rows/day propagation wrong: " + en);
  if (r.rows[3].section !== "지문 1") throw new Error("section lost");
  if (maxInflight < 2) throw new Error("images should run in parallel, max inflight " + maxInflight);
  console.log("[01] images: 3장 병렬(max inflight " + maxInflight + ") → 순서 유지 · DAY 전파 · 중복 제거 · 번호 제거 OK");

  const pdf = fs.readFileSync(path.join("fixtures", "mock-exam-numbered.pdf"));
  calls.length = 0;
  maxInflight = 0;
  const p = await ocrPdf(pdf);
  const chunks = calls.filter((c) => c.kind === "pdf").map((c) => c.label);
  if (!chunks.length || !chunks.every((c) => /^pages-\d+-\d+\.pdf$/.test(c))) throw new Error("pdf chunks wrong: " + chunks.join(","));
  if (p.rows.length !== chunks.length) throw new Error("one row per chunk expected");
  console.log(`[02] scanned pdf: ${p.meta.pages}쪽 → ${chunks.length}묶음(2쪽) 병렬(max inflight ${maxInflight}) → ${p.rows.length} rows OK`);
  console.log("\nTEST-OCR RESULT: PASS");
})().catch((e) => {
  console.error("TEST-OCR RESULT: FAIL —", e.message);
  process.exit(1);
});
