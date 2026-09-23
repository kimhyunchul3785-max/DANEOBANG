import { detectFormat, type ExtractResult } from "./common";
import { parseHwpx } from "./hwpx";
import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";

export type { ExtractResult, ExtractedRow } from "./common";
export { detectFormat, detectImage } from "./common";

export const PARSER_ERRORS: Record<string, string> = {
  hwp_not_supported: "HWP 파일은 지원하지 않습니다. 한글에서 HWPX로 다시 저장한 파일을 올려 주세요.",
  not_hwpx: "HWPX 구조가 아닙니다. 확장자만 바꾼 파일은 지원하지 않습니다.",
  not_docx: "DOCX 구조가 아닙니다.",
  unknown_format: "지원하지 않는 형식입니다. HWPX, DOCX, PDF, 사진(JPG/PNG/WEBP)만 업로드할 수 있습니다.",
  no_text: "본문 텍스트를 찾지 못했습니다. 스캔(사진을 합친) PDF 라면 .env 에 OPENAI_API_KEY 를 넣으면 OCR 로 자동으로 읽습니다.",
  ocr_not_configured: "사진·스캔 PDF 를 읽으려면 .env 에 OPENAI_API_KEY 가 필요합니다.",
  no_sections: "HWPX 본문 섹션이 없습니다.",
  zip_bomb: "압축 해제 크기가 제한을 초과합니다.",
  zip_too_many_entries: "압축 항목 수가 제한을 초과합니다.",
  zip_path_traversal: "압축 파일 경로가 올바르지 않습니다.",
  xml_dtd_not_allowed: "외부 참조(DTD/ENTITY)가 포함된 XML은 처리하지 않습니다.",
  pdf_too_many_pages: "PDF 페이지 수가 제한(200)을 초과합니다.",
  encrypted: "암호가 걸린 문서는 처리할 수 없습니다.",
};

export async function extractDocument(buf: Buffer, fileName: string): Promise<{ type: "hwpx" | "docx" | "pdf"; result: ExtractResult }> {
  const fmt = detectFormat(buf, fileName);
  if (fmt === "hwp") throw new Error("hwp_not_supported");
  if (fmt === "unknown" || fmt === "zip") throw new Error("unknown_format");
  if (fmt === "image") throw new Error("image_single"); // 이미지는 job-handlers 의 OCR 경로로
  try {
    if (fmt === "hwpx") return { type: "hwpx", result: await parseHwpx(buf) };
    if (fmt === "docx") return { type: "docx", result: await parseDocx(buf) };
    return { type: "pdf", result: await parsePdf(buf) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/password|encrypt/i.test(msg)) throw new Error("encrypted");
    throw e;
  }
}
