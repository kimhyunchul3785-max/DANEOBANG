import { openZipSafely, xmlParser, walkBlocks, type XNode } from "./xmlzip";
import { blocksToRows, type ExtractResult } from "./common";

/** HWPX(OWPML) 분석: Contents/section*.xml 의 문단·표를 원문 순서로 읽는다. */
export async function parseHwpx(buf: Buffer): Promise<ExtractResult> {
  const { zip, entries } = await openZipSafely(buf);
  const warnings: string[] = [];
  const mimetype = zip.file("mimetype") ? (await zip.file("mimetype")!.async("string")).trim() : "";
  const hasContent = entries.some((e) => e === "Contents/content.hpf" || e.startsWith("Contents/section"));
  if (!hasContent) throw new Error("not_hwpx");
  if (mimetype && !mimetype.includes("hwp")) warnings.push(`mimetype 이 예상과 다릅니다: ${mimetype}`);

  // 섹션 순서: content.hpf 의 spine 이 있으면 그 순서, 없으면 section 번호 순
  let sectionFiles = entries.filter((e) => /^Contents\/section\d+\.xml$/.test(e));
  const hpf = zip.file("Contents/content.hpf");
  if (hpf) {
    const x = await hpf.async("string");
    const ordered = [...x.matchAll(/href="([^"]*section\d+\.xml)"/g)].map((m) => "Contents/" + m[1].replace(/^Contents\//, ""));
    if (ordered.length) sectionFiles = ordered.filter((f) => entries.includes(f));
  } else {
    sectionFiles.sort((a, b) => Number(a.match(/(\d+)/)?.[1] ?? 0) - Number(b.match(/(\d+)/)?.[1] ?? 0));
  }
  if (!sectionFiles.length) throw new Error("no_sections");

  const blocks = [];
  let textChars = 0;
  for (const [i, f] of sectionFiles.entries()) {
    const xml = await zip.file(f)!.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("xml_dtd_not_allowed");
    const tree = xmlParser.parse(xml) as XNode[];
    const b = walkBlocks(tree, { p: "hp:p", tbl: "hp:tbl", tr: "hp:tr", tc: "hp:tc", t: "hp:t" }, `section${i + 1}`);
    for (const x of b) textChars += x.kind === "paragraph" ? x.text.length : x.rows.flat().join("").length;
    blocks.push(...b);
    // 미지원 요소 경고
    if (/<hp:pic\b/.test(xml)) warnings.push(`${f}: 이미지 개체가 있습니다. 이미지 안의 글자는 추출되지 않습니다.`);
    if (/<hp:textBox|<hp:drawText/.test(xml)) warnings.push(`${f}: 글상자가 있습니다. 글상자 내부 텍스트는 문단으로 취급되며 표 구조가 아닐 수 있습니다.`);
  }
  if (textChars === 0) throw new Error("no_text");
  const { rows, warnings: w2 } = blocksToRows(blocks);
  return { rows, warnings: [...warnings, ...w2], meta: { sections: sectionFiles.length, tables: blocks.filter((b) => b.kind === "table").length, paragraphs: blocks.filter((b) => b.kind === "paragraph").length } };
}
