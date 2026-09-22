// 시험지 레이아웃 상수 · manifest 타입. PDF 와 OMR 판독이 같은 값을 사용한다.
export const PAGE = { w: 595.28, h: 841.89 }; // A4 pt (top-left origin, pdfkit 기준)
export const MARGIN = 44; // 좌우 여백을 살린 심플 레이아웃
export const FIDUCIAL = { size: 24, inset: 30 }; // 네 모서리 검은 정사각형 (중심 좌표 = inset+size/2)
export const QR = { size: 64 };
export const BUBBLE = { r: 6 }; // 마킹 원 반지름 pt
export const FONT = { prompt: 11, option: 9.5, header: 9, small: 7.5 }; // Noto Sans KR, 작고 심플하게
export const TEMPLATE_VERSION = "v2";

export type BubbleSpec = { position: number; cx: number; cy: number; r: number };
export type ItemSpec = { itemId: string; position: number; bubbles: BubbleSpec[] };
export type PageManifest = {
  pageNo: number;
  token: string;
  fiducials: { x: number; y: number }[]; // TL, TR, BR, BL 중심
  qr: { x: number; y: number; size: number };
  items: ItemSpec[];
};
export type PrintManifest = {
  templateVersion: string;
  page: { w: number; h: number };
  pages: PageManifest[];
};

export function fiducialCenters() {
  const c = FIDUCIAL.inset + FIDUCIAL.size / 2;
  return [
    { x: c, y: c },
    { x: PAGE.w - c, y: c },
    { x: PAGE.w - c, y: PAGE.h - c },
    { x: c, y: PAGE.h - c },
  ];
}
