import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import { PAGE, MARGIN, FIDUCIAL, QR, BUBBLE, FONT, TEMPLATE_VERSION, fiducialCenters, type PrintManifest, type PageManifest } from "./layout";

const FONT_PATH = path.join(process.cwd(), "assets", "fonts", "NotoSansKR-Regular.otf");

export type RenderItem = { itemId: string; position: number; prompt: string; options: { position: number; text: string; isCorrect?: boolean; chosen?: boolean }[] };

export type RenderInput = {
  kind: "exam" | "answer_key" | "wrong_note";
  title: string;
  subtitle: string; // 범위 등
  studentName: string;
  items: RenderItem[];
  pageTokens?: string[]; // exam 일 때 페이지별 QR 토큰 (부족하면 생성 시 오류)
  qrUrlBase?: string; // QR 에 넣을 주소의 앞부분 (예: https://host/q) — 있으면 `${base}/${token}`, 없으면 토큰만
  note?: string;
  logo?: Buffer | null; // 학원 로고 (PNG/JPG) — 헤더 왼쪽
  academyName?: string;
};

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/**
 * A4 세로, 왼쪽 영어 · 오른쪽 한국어 보기 2×2 + 독립 마킹 원.
 * 문항은 페이지 사이에서 나누지 않는다. PDF 와 manifest 는 같은 계산에서 나온다.
 */
export async function renderPdf(input: RenderInput): Promise<{ pdf: Buffer; manifest: PrintManifest }> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, info: { Title: input.title } });
  const done = collect(doc);
  doc.registerFont("KR", FONT_PATH);
  doc.font("KR");

  const colLeftX = MARGIN + 4;
  const colLeftW = 140;
  const rightX = colLeftX + colLeftW + 8;
  const rightW = PAGE.w - MARGIN - 4 - rightX;
  const optW = rightW / 2;
  const bubbleGap = 20; // 원 + 번호 폭
  const optTextW = optW - bubbleGap - 8;
  const headerH = 66;
  const footerH = 36;
  const contentTop = MARGIN + headerH;
  const contentBottom = PAGE.h - MARGIN - footerH;

  // 문항별 높이 계산 (보기 텍스트 줄 수 기준)
  doc.fontSize(FONT.option);
  const itemHeights = input.items.map((it) => {
    let maxH = 0;
    for (const o of it.options) maxH = Math.max(maxH, doc.heightOfString(o.text, { width: optTextW, lineGap: 1 }));
    const rowH = Math.max(16, maxH + 3);
    return rowH * 2 + 9; // 2행 + 여백 (구분선 없음)
  });

  // 페이지 분할
  const pages: { items: RenderItem[]; heights: number[] }[] = [];
  let cur: { items: RenderItem[]; heights: number[] } = { items: [], heights: [] };
  let y = contentTop;
  input.items.forEach((it, i) => {
    const h = itemHeights[i];
    if (y + h > contentBottom && cur.items.length) {
      pages.push(cur);
      cur = { items: [], heights: [] };
      y = contentTop;
    }
    cur.items.push(it);
    cur.heights.push(h);
    y += h;
  });
  if (cur.items.length || pages.length === 0) pages.push(cur);

  if (input.kind === "exam" && (!input.pageTokens || input.pageTokens.length < pages.length)) throw new Error(`page_tokens_required:${pages.length}`);

  const manifest: PrintManifest = { templateVersion: TEMPLATE_VERSION, page: { w: PAGE.w, h: PAGE.h }, pages: [] };

  for (const [pi, pg] of pages.entries()) {
    doc.addPage({ size: "A4", margin: 0 });
    const token = input.kind === "exam" ? input.pageTokens![pi] : "";
    const pm: PageManifest = { pageNo: pi + 1, token, fiducials: fiducialCenters(), qr: { x: PAGE.w - FIDUCIAL.inset - FIDUCIAL.size - 16 - QR.size, y: MARGIN - 4, size: QR.size }, items: [] };

    // 기준점 (검은 정사각형)
    if (input.kind === "exam") {
      doc.fillColor("#000");
      for (const f of pm.fiducials) doc.rect(f.x - FIDUCIAL.size / 2, f.y - FIDUCIAL.size / 2, FIDUCIAL.size, FIDUCIAL.size).fill();
    }

    // 헤더: [로고] 제목 / 범위 / 이름 — 구분선 없음
    let hx = MARGIN + (input.kind === "exam" ? 22 : 0);
    if (input.logo) {
      try {
        doc.image(input.logo, hx, MARGIN - 2, { fit: [90, 30] });
        hx += 98;
      } catch {
        /* 로고 디코딩 실패 시 무시 */
      }
    }
    const textW = PAGE.w - 200 - hx;
    doc.fillColor("#000").fontSize(FONT.header + 3).text(input.title, hx, MARGIN, { width: textW });
    doc.fontSize(FONT.header).fillColor("#333").text(input.subtitle, hx, MARGIN + 16, { width: textW });
    doc.fontSize(FONT.header + 1).fillColor("#000").text(`이름: ${input.studentName}`, hx, MARGIN + 30, { width: textW });
    doc.fontSize(FONT.small).fillColor("#555").text(input.kind === "exam" ? "등록 단어장에 수록된 뜻을 고르세요. 정답 번호 옆의 원을 검게 칠하세요." : input.kind === "answer_key" ? "교사용 정답지 — 학생에게 배부하지 마세요." : "복습용 오답노트 — 채점용 시험지가 아닙니다.", hx, MARGIN + 46, { width: textW });
    doc.fillColor("#000");
    doc.fontSize(FONT.small).fillColor("#555").text(`${pi + 1} / ${pages.length}`, PAGE.w - MARGIN - 150, MARGIN + 46, { width: 60, align: "right" });
    doc.fillColor("#000");

    if (input.kind === "exam") {
      const qrPng = await QRCode.toBuffer(input.qrUrlBase ? `${input.qrUrlBase}/${token}` : token, { errorCorrectionLevel: "M", margin: 2, width: 256 });
      doc.image(qrPng, pm.qr.x, pm.qr.y, { width: QR.size, height: QR.size });
    } else if (input.kind === "wrong_note") {
      doc.fontSize(FONT.small).text("QR 로 채점 확인", PAGE.w - MARGIN - QR.size - 8, MARGIN + 10, { width: QR.size + 16, align: "center" });
    }

    let yy = contentTop;
    pg.items.forEach((it, idx) => {
      const h = pg.heights[idx];
      const rowH = (h - 10) / 2;
      // 영어
      doc.fontSize(FONT.prompt).fillColor("#000").text(`${it.position}. ${it.prompt}`, colLeftX, yy + 4, { width: colLeftW });
      const spec = { itemId: it.itemId, position: it.position, bubbles: [] as { position: number; cx: number; cy: number; r: number }[] };
      it.options
        .slice()
        .sort((a, b) => a.position - b.position)
        .forEach((o, oi) => {
          const col = oi % 2;
          const row = Math.floor(oi / 2);
          const ox = rightX + col * optW;
          const oy = yy + 4 + row * rowH;
          const cx = ox + BUBBLE.r + 1;
          const cy = oy + FONT.option / 2 + 1;
          // 마킹 원
          doc.circle(cx, cy, BUBBLE.r).lineWidth(0.8).strokeColor("#000");
          const fill = (input.kind === "answer_key" && o.isCorrect) || (input.kind === "wrong_note" && o.isCorrect);
          if (fill) doc.fillAndStroke("#000", "#000");
          else doc.stroke();
          doc.fillColor("#000").fontSize(FONT.option).text(`${o.position}`, cx + BUBBLE.r + 2, oy, { width: 10, lineBreak: false });
          doc.text(o.text, ox + bubbleGap + 2, oy, { width: optTextW, lineGap: 1 });
          if (input.kind === "wrong_note" && o.chosen && !o.isCorrect) {
            doc.fontSize(FONT.option).fillColor("#c00").text("✗", cx - 3.5, oy - 1, { lineBreak: false });
            doc.fillColor("#000");
          }
          spec.bubbles.push({ position: o.position, cx, cy, r: BUBBLE.r });
        });
      pm.items.push(spec);
      yy += h;
    });

    // 푸터
    doc.fontSize(FONT.small).fillColor("#888").text(input.note ?? `${input.academyName ? input.academyName + " · " : ""}단어방 ${TEMPLATE_VERSION}`, MARGIN + (input.kind === "exam" ? 22 : 0), PAGE.h - MARGIN - 12, { width: 300 });
    manifest.pages.push(pm);
  }
  doc.end();
  const pdf = await done;
  return { pdf, manifest };
}
