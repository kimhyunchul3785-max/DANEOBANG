/**
 * 화면·API 가 같이 쓰는 지표 정의 — 웹 대시보드 · /api/v1/dashboard(모바일) · 성적 화면이 같은 숫자를 보이게 한다.
 *
 * - 진행 중인 시험(오늘 기준): 발행된 시험의 배정 중 이미 시작됐고(예약 제외) 마감이 오늘 이후인 것 — 이번 주 시험처럼 며칠 열린 시험도 포함.
 *   마감 없는 배정은 아직 안 쳤거나 오늘 나간 것만. 지난 날 마감이 끝난 배정은 여기 아니라 "기한 지남"으로만 센다.
 * - 기한 지남: 발행 시험 · 아직 안 친 배정(assigned·in_progress) · 마감 < 지금. 기간 제한 없음.
 */
import type { Prisma } from "@/generated/prisma/client";

export function seoulDayRange(now = new Date()) {
  const start = new Date(now.getTime() - ((now.getTime() + 9 * 3600e3) % 86400e3));
  return { start, end: new Date(start.getTime() + 86400e3) };
}

export const OPEN_STATUSES = ["assigned", "in_progress"];

export function todayAssignmentWhere(academyId: string, student: Prisma.StudentWhereInput, now = new Date()): Prisma.AssignmentWhereInput {
  const day = seoulDayRange(now);
  return {
    exam: { academyId, status: "published" },
    student,
    AND: [
      { OR: [{ startAt: null }, { startAt: { lt: day.end } }] },
      { OR: [{ dueAt: { gte: day.start } }, { dueAt: null, OR: [{ status: { in: OPEN_STATUSES } }, { createdAt: { gte: day.start } }] }] },
    ],
  };
}

export function overdueAssignmentWhere(academyId: string, student: Prisma.StudentWhereInput, now = new Date()): Prisma.AssignmentWhereInput {
  return { exam: { academyId, status: "published" }, student, status: { in: OPEN_STATUSES }, dueAt: { lt: now } };
}

/** 표본이 너무 적으면 비율·추세를 숫자로 보여주지 않는다 */
export const MIN_SAMPLE = 3;
