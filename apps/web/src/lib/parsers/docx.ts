import { openZipSafely, xmlParser, walkBlocks, type XNode } from "./xmlzip";
import { blocksToRows, type ExtractResult } from "./common";

export async function parseDocx(buf: Buffer): Promise<ExtractResult> {
  const { zip } = await openZipSafely(buf);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("not_docx");
  const xml = await doc.async("string");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("xml_dtd_not_allowed");
  const warnings: string[] = [];
  if (zip.file("word/vbaProject.bin")) warnings.push("매크로가 포함된 문서입니다. 매크로는 실행하지 않습니다.");
  const tree = xmlParser.parse(xml) as XNode[];
  const blocks = walkBlocks(tree, { p: "w:p", tbl: "w:tbl", tr: "w:tr", tc: "w:tc", t: "w:t" }, "body");
  if (/<w:txbxContent/.test(xml)) warnings.push("텍스트 상자가 있습니다. 상자 안 텍스트는 문단으로 취급됩니다.");
  if (/<w:drawing|<pic:pic/.test(xml)) warnings.push("이미지가 있습니다. 이미지 안의 글자는 추출되지 않습니다.");
  const total = blocks.reduce((n, b) => n + (b.kind === "paragraph" ? b.text.length : b.rows.flat().join("").length), 0);
  if (total === 0) throw new Error("no_text");
  const { rows, warnings: w2 } = blocksToRows(blocks);
  return { rows, warnings: [...warnings, ...w2], meta: { tables: blocks.filter((b) => b.kind === "table").length, paragraphs: blocks.filter((b) => b.kind === "paragraph").length } };
}
