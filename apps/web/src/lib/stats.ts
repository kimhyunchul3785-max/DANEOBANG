import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { seoulWeekRange } from "./util";

export type GradeRow = {
  attemptId: string;
  studentId: string;
  examId: string;
  examTitle: string;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  at: Date;
  attemptNo: number;
  isRetake: boolean;
  mode: string;
};

/** 학생 범위 안의 현재 채점 결과 (최근 since 이후 · bookIds 가 있으면 그 단어장으로 만든 시험만) */
export async function loadGrades(academyId: string, studentWhere: Prisma.StudentWhereInput, since?: Date, bookIds?: string[] | null): Promise<GradeRow[]> {
  const gs = await prisma.gradeRevision.findMany({
    where: { current: true, ...(since ? { createdAt: { gte: since } } : {}), attempt: { assignment: { exam: { academyId, ...(bookIds ? { bookId: { in: bookIds } } : {}) }, student: studentWhere } } },
    include: { attempt: { select: { id: true, attemptNo: true, mode: true, submittedAt: true, assignment: { select: { studentId: true, examId: true, exam: { select: { title: true, isRetake: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  return gs.map((g) => ({
    attemptId: g.attempt.id,
    studentId: g.attempt.assignment.studentId,
    examId: g.attempt.assignment.examId,
    examTitle: g.attempt.assignment.exam.title,
    score: g.score,
    passed: g.passed,
    correct: g.correctCount,
    total: g.totalCount,
    at: g.attempt.submittedAt ?? g.createdAt,
    attemptNo: g.attempt.attemptNo,
    isRetake: g.attempt.assignment.exam.isRetake,
    mode: g.attempt.mode,
  }));
}

export const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
export const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/** 최근 n 주의 주 시작(월 00:00 KST) 목록, 오래된 순 */
export function recentWeeks(n: number, now = new Date()) {
  const cur = seoulWeekRange(now).start.getTime();
  return Array.from({ length: n }, (_, i) => new Date(cur - (n - 1 - i) * 7 * 86400e3));
}
export function weekIndex(weeks: Date[], at: Date) {
  const t = at.getTime();
  for (let i = weeks.length - 1; i >= 0; i--) if (t >= weeks[i].getTime()) return t < weeks[i].getTime() + 7 * 86400e3 ? i : -1;
  return -1;
}
export function weekLabel(d: Date) {
  const l = new Date(d.getTime() + 9 * 3600e3);
  return `${l.getUTCMonth() + 1}/${l.getUTCDate()}`;
}

/** 주별 평균 점수 (첫 응시만), 없는 주는 null */
export function weeklySeries(grades: { at: Date; score: number; isRetake?: boolean }[], weeks: Date[]) {
  const buckets: number[][] = weeks.map(() => []);
  for (const g of grades) {
    if (g.isRetake) continue;
    const i = weekIndex(weeks, g.at);
    if (i >= 0) buckets[i].push(g.score);
  }
  return buckets.map((b) => avg(b));
}

/** 점수 분포 (10점 구간) */
export function scoreBins(scores: number[]) {
  const labels = ["<40", "40", "50", "60", "70", "80", "90", "100"];
  const bins = labels.map((label) => ({ label, value: 0 }));
  for (const s of scores) {
    if (s < 40) bins[0].value++;
    else if (s >= 100) bins[7].value++;
    else bins[Math.floor(s / 10) - 3].value++;
  }
  return bins;
}

/** 연속 미달 주 수 (최근 주부터 거꾸로) */
export function consecutiveFails(series: (number | null)[], pass: number) {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v === null) continue;
    if (v < pass) n++;
    else break;
  }
  return n;
}

/** 추세: 최근 3주 평균 - 그 이전 3주 평균 */
export function trendDelta(series: (number | null)[]) {
  const vals = series.filter((v): v is number => v !== null);
  if (vals.length < 2) return null;
  const k = vals.length >= 6 ? 3 : vals.length >= 4 ? 2 : 1;
  const recent = vals.slice(-k);
  const before = vals.slice(-2 * k, -k);
  if (!before.length) return null;
  return avg(recent)! - avg(before)!;
}

/**
 * 단어장 계보: 고른 단어장 + (병합으로 만든 단어장이면) 원본 단어장들, 원본이 또 병합본이면 거슬러 올라가며 모두.
 * 병합본을 고르면 원본으로 만든 과거 시험 성적까지 함께 본다.
 */
export async function bookLineage(academyId: string, bookId: string): Promise<string[]> {
  const books = await prisma.vocabBook.findMany({ where: { academyId }, select: { id: true, mergedFrom: true } });
  const byId = new Map(books.map((b) => [b.id, b]));
  if (!byId.has(bookId)) return [];
  const out = new Set<string>();
  const stack = [bookId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    let src: unknown = [];
    try {
      src = JSON.parse(byId.get(id)?.mergedFrom ?? "[]");
    } catch {
      src = [];
    }
    if (Array.isArray(src)) for (const s of src) if (typeof s === "string" && byId.has(s)) stack.push(s);
  }
  return [...out];
}
