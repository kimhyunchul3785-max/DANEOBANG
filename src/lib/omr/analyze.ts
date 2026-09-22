import sharp from "sharp";
import jsQR from "jsqr";
import { PAGE, FIDUCIAL, type PageManifest } from "./layout";

export type ItemDetection = {
  itemId: string;
  position: number;
  status: "single_mark" | "blank" | "multiple_marks" | "uncertain";
  optionPosition: number | null;
  fills: number[]; // 보기별 채움 점수 (0~1)
};

export type AnalyzeResult = {
  token: string | null;
  detections: ItemDetection[];
  corrected: Buffer | null; // 보정 이미지 (PNG)
  warnings: string[];
  debug: Record<string, unknown>;
};

type Gray = { data: Uint8Array; w: number; h: number };

async function toGray(input: Buffer, maxW: number): Promise<{ gray: Gray; img: sharp.Sharp }> {
  const img = sharp(input, { failOn: "none", limitInputPixels: 40_000_000 }).rotate(); // EXIF 방향 반영
  const meta = await img.metadata();
  const w = Math.min(maxW, meta.width ?? maxW);
  const { data, info } = await img.clone().resize({ width: w }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { gray: { data: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height }, img };
}

function toRGBA(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < g.w * g.h; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g.data[i];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** QR 판독: 전체 → 각 사분면 확대 순으로 시도 */
async function readQR(gray: Gray): Promise<{ token: string; cx: number; cy: number } | null> {
  const tryDecode = (g: Gray, ox: number, oy: number, scale: number) => {
    const r = jsQR(toRGBA(g), g.w, g.h, { inversionAttempts: "dontInvert" });
    if (!r || !r.data) return null;
    const loc = r.location;
    const cx = ((loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2) * scale + ox;
    const cy = ((loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2) * scale + oy;
    return { token: r.data, cx, cy };
  };
  const full = tryDecode(gray, 0, 0, 1);
  if (full) return full;
  // 사분면 크롭
  const halfW = Math.floor(gray.w / 2);
  const halfH = Math.floor(gray.h / 2);
  for (const [ox, oy] of [
    [halfW, 0],
    [0, 0],
    [halfW, halfH],
    [0, halfH],
  ]) {
    const crop = cropGray(gray, ox, oy, halfW, halfH);
    const up = upscale(crop, 2);
    const r = tryDecode(up, ox, oy, 0.5);
    if (r) return r;
  }
  return null;
}

function cropGray(g: Gray, x: number, y: number, w: number, h: number): Gray {
  const out = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++) out.set(g.data.subarray((y + yy) * g.w + x, (y + yy) * g.w + x + w), yy * w);
  return { data: out, w, h };
}
function upscale(g: Gray, f: number): Gray {
  const w = g.w * f;
  const h = g.h * f;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = g.data[Math.floor(y / f) * g.w + Math.floor(x / f)];
  return { data: out, w, h };
}

function otsu(g: Gray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i += 4) hist[g.data[i]]++;
  const total = Math.floor(g.data.length / 4);
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > max) {
      max = v;
      thr = t;
    }
  }
  return thr;
}

type Blob = { x0: number; y0: number; x1: number; y1: number; area: number; cx: number; cy: number };

/** 이진화 후 연결 성분 중 정사각형·채워진·고립된 블롭 = 기준점 후보 */
export function findFiducials(g: Gray, expectedSize: number): { blobs: Blob[]; thr: number } {
  const thr = Math.min(otsu(g), 110);
  const bin = new Uint8Array(g.w * g.h);
  for (let i = 0; i < bin.length; i++) bin[i] = g.data[i] < thr ? 1 : 0;
  const seen = new Uint8Array(g.w * g.h);
  const blobs: Blob[] = [];
  const minArea = (expectedSize * 0.55) ** 2;
  const maxArea = (expectedSize * 1.8) ** 2;
  const stack: number[] = [];
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || seen[i]) continue;
    let x0 = g.w,
      y0 = g.h,
      x1 = 0,
      y1 = 0,
      area = 0,
      sx = 0,
      sy = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % g.w;
      const y = (p - x) / g.w;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (area > maxArea * 4) {
        stack.length = 0; // 큰 배경 블롭은 중단하고 스택을 비운다 (다음 블롭 오염 방지)
        break;
      }
      const nb = [p - 1, p + 1, p - g.w, p + g.w];
      for (const q of nb) {
        if (q < 0 || q >= bin.length) continue;
        if (Math.abs((q % g.w) - x) > 1) continue;
        if (bin[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area < minArea || area > maxArea) continue;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const aspect = bw / bh;
    if (aspect < 0.7 || aspect > 1.4) continue;
    if (area / (bw * bh) < 0.72) continue;
    // 고립성: 주변 테두리(블롭 폭의 40%)에 어두운 픽셀이 적어야 함 (QR 파인더 패턴 배제)
    const pad = Math.round(bw * 0.4);
    let dark = 0;
    let cnt = 0;
    for (let y = Math.max(0, y0 - pad); y <= Math.min(g.h - 1, y1 + pad); y++) {
      for (let x = Math.max(0, x0 - pad); x <= Math.min(g.w - 1, x1 + pad); x++) {
        if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) continue;
        cnt++;
        if (bin[y * g.w + x]) dark++;
      }
    }
    if (cnt && dark / cnt > 0.12) continue;
    blobs.push({ x0, y0, x1, y1, area, cx: sx / area, cy: sy / area });
  }
  return { blobs, thr };
}

/** 네 모서리에 가장 가까운 후보 선택 */
export function pickCorners(blobs: Blob[], w: number, h: number): Blob[] | null {
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const out: Blob[] = [];
  const used = new Set<Blob>();
  for (const [cx, cy] of corners) {
    let best: Blob | null = null;
    let bd = Infinity;
    for (const b of blobs) {
      if (used.has(b)) continue;
      const d = Math.hypot(b.cx - cx, b.cy - cy);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best || bd > Math.hypot(w, h) * 0.35) return null;
    used.add(best);
    out.push(best);
  }
  return out;
}

/** 4점 대응 → 3x3 호모그래피 (DLT, 8 미지수 가우스 소거) */
export function homography(src: { x: number; y: number }[], dst: { x: number; y: number }[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // 풀이: 8x8 시스템
  const M = A.map((r) => r.slice(0, 8));
  const b = A.map((r) => r[8]);
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k < n; k++) M[r][k] -= f * M[c][k];
      b[r] -= f * b[c];
    }
  }
  const hvec = b.map((v, i) => v / (M[i][i] || 1e-12));
  return [...hvec, 1];
}
export function applyH(H: number[], x: number, y: number) {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
}

/** 페이지 좌표계로 보정한 이미지 생성 (역매핑, 최근접) */
function warpToPage(g: Gray, H: number[], outW: number): Gray {
  const outH = Math.round((outW * PAGE.h) / PAGE.w);
  const out = new Uint8Array(outW * outH).fill(255);
  const sx = PAGE.w / outW;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = applyH(H, x * sx, y * sx);
      const ix = Math.round(p.x);
      const iy = Math.round(p.y);
      if (ix >= 0 && iy >= 0 && ix < g.w && iy < g.h) out[y * outW + x] = g.data[iy * g.w + ix];
    }
  }
  return { data: out, w: outW, h: outH };
}

/** 원 내부 채움 점수: 주변 고리 밝기 대비 내부 어두움 */
function bubbleFill(g: Gray, cx: number, cy: number, r: number): number {
  let inSum = 0,
    inN = 0,
    ringSum = 0,
    ringN = 0;
  const R = r * 2.2;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const d = Math.hypot(x - cx, y - cy);
      const v = g.data[y * g.w + x];
      if (d <= r * 0.75) {
        inSum += v;
        inN++;
      } else if (d >= r * 1.5 && d <= R) {
        ringSum += v;
        ringN++;
      }
    }
  }
  if (!inN || !ringN) return 0;
  const inMean = inSum / inN;
  const ringMean = ringSum / ringN;
  // 고리(종이 바탕+글자 일부)보다 얼마나 어두운지. 0=동일, 1=완전 검정
  return Math.max(0, Math.min(1, (ringMean - inMean) / Math.max(60, ringMean)));
}

export function classify(fills: number[]): { status: ItemDetection["status"]; optionPosition: number | null } {
  const sorted = fills.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
  const top = sorted[0];
  const second = sorted[1];
  if (!top) return { status: "uncertain", optionPosition: null };
  if (top.f >= 0.45 && (!second || second.f < 0.25)) return { status: "single_mark", optionPosition: top.i + 1 };
  if (top.f >= 0.45 && second && second.f >= 0.35) return { status: "multiple_marks", optionPosition: null };
  if (top.f < 0.18) return { status: "blank", optionPosition: null };
  return { status: "uncertain", optionPosition: null };
}

/**
 * 사진 1장 판독. manifest 를 모르는 상태에서 QR 로 페이지를 식별해야 하므로
 * 1) QR 판독 → 호출자가 PageManifest 조회 → 2) analyzeWithManifest 순서로 쓴다.
 */
export async function readPageToken(input: Buffer): Promise<{ token: string | null; gray: Gray; qr: { cx: number; cy: number } | null }> {
  const { gray } = await toGray(input, 1600);
  const qr = await readQR(gray);
  return { token: qr?.token ?? null, gray, qr: qr ? { cx: qr.cx, cy: qr.cy } : null };
}

function rotateGray(g: Gray, k: number): Gray {
  // k: 시계방향 90도 회전 횟수
  if (k % 4 === 0) return g;
  let cur = g;
  for (let i = 0; i < k % 4; i++) {
    const out = new Uint8Array(cur.w * cur.h);
    const w = cur.h;
    const h = cur.w;
    for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) out[x * w + (w - 1 - y)] = cur.data[y * cur.w + x];
    cur = { data: out, w, h };
  }
  return cur;
}

export async function analyzeWithManifest(gray0: Gray, qr: { cx: number; cy: number } | null, page: PageManifest): Promise<AnalyzeResult> {
  const warnings: string[] = [];
  let gray = gray0;
  // 방향 보정: QR 은 오른쪽 위에 있어야 함
  if (qr) {
    const right = qr.cx > gray.w / 2;
    const top = qr.cy < gray.h / 2;
    let k = 0;
    if (right && top) k = 0;
    else if (right && !top) k = 3; // QR 오른쪽 아래 → 반시계 90 = 시계 270
    else if (!right && !top) k = 2;
    else k = 1;
    if (k) {
      gray = rotateGray(gray, k);
      warnings.push(`사진 방향을 ${k * 90}° 보정했습니다.`);
    }
  }
  const scaleGuess = gray.w / PAGE.w;
  const { blobs, thr } = findFiducials(gray, FIDUCIAL.size * scaleGuess);
  const corners = pickCorners(blobs, gray.w, gray.h);
  if (!corners) {
    return { token: page.token, detections: [], corrected: null, warnings: [...warnings, `기준점(모서리 사각형)을 4개 찾지 못했습니다 (후보 ${blobs.length}개). 시험지 네 모서리가 모두 나오도록 다시 촬영하세요.`], debug: { blobs: blobs.length, thr } };
  }
  const H = homography(page.fiducials, corners.map((c) => ({ x: c.cx, y: c.cy })));
  // 기준점 재투영 오차
  const err = page.fiducials.map((f, i) => Math.hypot(applyH(H, f.x, f.y).x - corners[i].cx, applyH(H, f.x, f.y).y - corners[i].cy));
  const detections: ItemDetection[] = [];
  const localScale = Math.hypot(applyH(H, 10, 0).x - applyH(H, 0, 0).x, applyH(H, 10, 0).y - applyH(H, 0, 0).y) / 10;
  for (const it of page.items) {
    const fills = it.bubbles.map((b) => {
      const p = applyH(H, b.cx, b.cy);
      return Number(bubbleFill(gray, p.x, p.y, b.r * localScale).toFixed(3));
    });
    const c = classify(fills);
    detections.push({ itemId: it.itemId, position: it.position, status: c.status, optionPosition: c.optionPosition, fills });
  }
  const warped = warpToPage(gray, H, 1000);
  const corrected = await sharp(Buffer.from(warped.data.buffer, warped.data.byteOffset, warped.data.length), { raw: { width: warped.w, height: warped.h, channels: 1 } }).png().toBuffer();
  const uncertain = detections.filter((d) => d.status === "uncertain").length;
  if (uncertain > detections.length * 0.3) warnings.push(`판독이 불확실한 문항이 ${uncertain}개입니다. 조명·초점을 확인하고 다시 촬영하는 것이 좋습니다.`);
  return { token: page.token, detections, corrected, warnings, debug: { thr, blobs: blobs.length, reprojErr: err.map((e) => Number(e.toFixed(1))), localScale: Number(localScale.toFixed(3)) } };
}

/** QR 내용에서 페이지 토큰만 뽑는다 (URL 형식 `…/q/<token>` 또는 토큰 자체) */
export function tokenFromQr(text: string | null): string | null {
  if (!text) return null;
  const m = text.trim().match(/\/q\/([A-Za-z0-9_-]{8,})\/?(?:[?#].*)?$/);
  return m ? m[1] : text.trim();
}
