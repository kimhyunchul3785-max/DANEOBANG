import { prisma } from "./db";
import { saveFile } from "./storage";
import { enqueueJob } from "./jobs";
import { sha256 } from "./util";
import { FILE_LIMITS } from "./constants";
import { readPageToken, tokenFromQr } from "./omr/analyze";
import { ApiError } from "./attempts";

const IMAGE_MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "jpg"],
  [[0x89, 0x50, 0x4e, 0x47], "png"],
  [[0x52, 0x49, 0x46, 0x46], "webp"],
];

/** 토큰으로 시험지 페이지 + 학생·시험 조회 */
export async function findPrintPage(token: string) {
  return prisma.printPage.findUnique({
    where: { token },
    include: { print: { include: { pages: { orderBy: { pageNo: "asc" } }, attempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { select: { id: true, title: true, academyId: true, passScore: true, answerVisibility: true, answersReleased: true } }, student: { select: { id: true, name: true, userId: true, user: { select: { passwordHash: true, name: true } } } } } } } } } } },
  });
}

/**
 * 학생 본인이 종이 시험지 사진을 제출. QR 을 먼저 읽어 어느 시험지인지 확인하고(본인 것만), 분석 job 을 건다.
 * expectToken 이 있으면(QR 페이지에서 제출) 그 시험지의 페이지만 받는다.
 */
export async function submitStudentScan(params: { buf: Buffer; fileName: string; userId: string; expectToken?: string }) {
  const { buf, fileName, userId } = params;
  if (buf.length > FILE_LIMITS.imageMaxBytes) throw new ApiError(413, "too_large", "20MB 이하 사진만 올릴 수 있습니다.");
  const kind = IMAGE_MAGIC.find(([m]) => m.every((b, i) => buf[i] === b))?.[1];
  if (!kind) throw new ApiError(415, "unsupported", "JPG/PNG/WebP 사진만 지원합니다. (아이폰은 설정 → 카메라 → 포맷을 '높은 호환성'으로)");
  const { token: raw } = await readPageToken(buf);
  const token = tokenFromQr(raw);
  if (!token) throw new ApiError(422, "qr_not_found", "QR 코드를 읽지 못했습니다. 시험지 전체가 선명하게 나오도록 다시 찍어 주세요.");
  const page = await findPrintPage(token);
  if (!page) throw new ApiError(404, "unknown_paper", "등록된 시험지가 아닙니다.");
  if (params.expectToken && page.print.pages.every((p) => p.token !== params.expectToken)) throw new ApiError(409, "other_paper", "이 QR 의 시험지가 아닙니다.");
  const student = page.print.attempt.assignment.student;
  if (student.userId !== userId) throw new ApiError(403, "not_owner", "본인 시험지만 제출할 수 있습니다.");
  if (page.print.status !== "active") throw new ApiError(409, "print_void", "무효화된 시험지입니다. 선생님에게 문의하세요.");
  if (page.print.attempt.status === "graded") throw new ApiError(409, "already_graded", "이미 채점된 시험입니다.");
  const academyId = page.print.attempt.assignment.exam.academyId;
  const hash = sha256(buf);
  const dup = await prisma.scanUpload.findFirst({ where: { academyId, sha256: hash } });
  if (dup) throw new ApiError(409, "duplicate", "이미 제출한 사진입니다.");
  const rel = await saveFile("scans", academyId, kind, buf);
  const scan = await prisma.scanUpload.create({ data: { academyId, uploadedById: userId, filePath: rel, fileName, sha256: hash, source: "student", pageId: page.id } });
  await enqueueJob("analyze_scan", scan.id, academyId, { forcePageId: page.id });
  return { scanId: scan.id, pageNo: page.pageNo, pages: page.print.pages.length, attemptId: page.print.attempt.id, examTitle: page.print.attempt.assignment.exam.title };
}

/** 학생의 최근 제출 사진과 상태 */
export async function listStudentScans(userId: string) {
  const scans = await prisma.scanUpload.findMany({
    where: { uploadedById: userId, source: "student" },
    include: { page: { include: { print: { include: { attempt: { include: { grades: { where: { current: true } }, assignment: { include: { exam: { select: { id: true, title: true } } } } } } } } } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return scans.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.createdAt,
    fileName: s.fileName,
    note: s.reviewNotes,
    pageNo: s.page?.pageNo ?? null,
    examTitle: s.page?.print.attempt.assignment.exam.title ?? null,
    attemptId: s.page?.print.attempt.id ?? null,
    attemptStatus: s.page?.print.attempt.status ?? null,
    score: s.page?.print.attempt.grades[0] ? Math.round(s.page.print.attempt.grades[0].score) : null,
    passed: s.page?.print.attempt.grades[0]?.passed ?? null,
  }));
}
