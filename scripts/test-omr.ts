// 합성 OMR 테스트: PDF 렌더 → 이미지화 → 마킹 합성 → 판독 → 기대값 비교
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import sharp from "sharp";
import { renderPdf } from "../src/lib/omr/pdf";
import { readPageToken, analyzeWithManifest } from "../src/lib/omr/analyze";
import { PAGE } from "../src/lib/omr/layout";

const OUT = path.join(process.cwd(), "fixtures", "omr");
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const items = Array.from({ length: 40 }, (_, i) => ({
    itemId: `item${i + 1}`,
    position: i + 1,
    prompt: ["abandon", "comprehensive", "deteriorate", "facilitate", "vulnerable"][i % 5],
    options: [1, 2, 3, 4].map((p) => ({ position: p, text: ["버리다, 포기하다", "포괄적인, 종합적인 (긴 뜻 테스트용 문장입니다)", "악화되다", "촉진하다, 용이하게 하다"][(p + i) % 4] })),
  }));
  const tokens = Array.from({ length: 10 }, (_, i) => `TESTTOKEN${i}`);
  const { pdf, manifest } = await renderPdf({ kind: "exam", title: "합성 테스트 시험", subtitle: "DAY 14, 17, 20 · 40문항", studentName: "테스트학생", items, pageTokens: tokens });
  fs.writeFileSync(path.join(OUT, "exam.pdf"), pdf);
  console.log("pages:", manifest.pages.length, "items/page:", manifest.pages.map((p) => p.items.length));

  // 150dpi 래스터
  execSync(`pdftoppm -r 150 -png "${path.join(OUT, "exam.pdf")}" "${path.join(OUT, "page")}"`);
  const pngs = fs.readdirSync(OUT).filter((f) => /^page-?\d+\.png$/.test(f)).sort();
  let totalItems = 0;
  let match = 0;
  let statusOk = 0;
  const scale = 150 / 72;
  for (const [pi, png] of pngs.entries()) {
    const pm = manifest.pages[pi];
    // 기대 답안: 문항 위치에 따라 1~4, 5번째마다 blank, 7번째마다 multiple
    const expected: Record<number, { opt: number | null; status: string }> = {};
    const circles: string[] = [];
    for (const it of pm.items) {
      const kind = it.position % 7 === 0 ? "multi" : it.position % 5 === 0 ? "blank" : "single";
      const opt = (it.position % 4) + 1;
      if (kind === "single") {
        const b = it.bubbles.find((x) => x.position === opt)!;
        circles.push(`<circle cx="${b.cx * scale}" cy="${b.cy * scale}" r="${b.r * scale * 0.95}" fill="#111"/>`);
        expected[it.position] = { opt, status: "single_mark" };
      } else if (kind === "multi") {
        for (const p of [opt, (opt % 4) + 1]) {
          const b = it.bubbles.find((x) => x.position === p)!;
          circles.push(`<circle cx="${b.cx * scale}" cy="${b.cy * scale}" r="${b.r * scale * 0.9}" fill="#222"/>`);
        }
        expected[it.position] = { opt: null, status: "multiple_marks" };
      } else expected[it.position] = { opt: null, status: "blank" };
    }
    const meta = await sharp(path.join(OUT, png)).metadata();
    const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">${circles.join("")}</svg>`;
    const marked = await sharp(path.join(OUT, png)).composite([{ input: Buffer.from(svg) }]).toBuffer();
    // 촬영 흉내: 회전 + 약간 어둡게 + 여백(배경) 추가 + 축소
    const photo = await sharp(marked)
      .rotate(pi === 0 ? 3 : 180 + 2, { background: "#8a8a8a" })
      .extend({ top: 60, bottom: 90, left: 40, right: 70, background: "#7a7a7a" })
      .modulate({ brightness: 0.85 })
      .resize({ width: 1500 })
      .jpeg({ quality: 70 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT, `photo-${pi + 1}.jpg`), photo);

    const { token, gray, qr } = await readPageToken(photo);
    console.log(`\npage ${pi + 1}: token=${token} qr=${qr ? `${qr.cx.toFixed(0)},${qr.cy.toFixed(0)}` : "none"}`);
    if (token !== pm.token) {
      console.log("  ✗ token mismatch");
      totalItems += pm.items.length;
      continue;
    }
    const r = await analyzeWithManifest(gray, qr, pm);
    console.log("  debug:", JSON.stringify(r.debug), "warnings:", r.warnings);
    if (r.corrected) fs.writeFileSync(path.join(OUT, `corrected-${pi + 1}.png`), r.corrected);
    for (const d of r.detections) {
      totalItems++;
      const e = expected[d.position];
      const okStatus = d.status === e.status;
      const okOpt = d.optionPosition === e.opt;
      if (okStatus) statusOk++;
      if (okStatus && okOpt) match++;
      else console.log(`  #${d.position} expected ${e.status}/${e.opt} got ${d.status}/${d.optionPosition} fills=${d.fills.join(",")}`);
    }
  }
  console.log(`\nRESULT: ${match}/${totalItems} exact (${((100 * match) / totalItems).toFixed(1)}%), status ${statusOk}/${totalItems}`);
  process.exit(match === totalItems ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
