import { prisma } from "./db";
import { planDays, distribution, type PlanItem, type SplitMode } from "./day-plan";

export { planDays, distribution, parseSizes, DEFAULT_SPLIT_DAYS } from "./day-plan";
export type { PlanItem, PlannedDay, SplitMode } from "./day-plan";

/**
 * 단어장의 단어를 다시 DAY 로 나눈다. 단어 순서는 sortOrder(원문 순서) 기준.
 * 이미 발행된 시험의 문항은 스냅샷이라 바뀌지 않는다.
 */
export async function applyDaySplit(bookId: string, mode: Exclude<SplitMode, "doc"> | "doc", n: number, docDays?: (number | null)[], sizes?: number[]) {
  const words = await prisma.word.findMany({ where: { bookId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, section: true } });
  const items: PlanItem[] = words.map((w, i) => ({ dayNo: docDays?.[i] ?? null, section: w.section }));
  const plan = planDays(items, mode, n, 0, sizes);
  const dist = distribution(plan);
  await prisma.$transaction(async (tx) => {
    const dayIds = new Map<number, string>();
    for (const d of dist) {
      const day = await tx.bookDay.upsert({ where: { bookId_dayNo: { bookId, dayNo: d.dayNo } }, update: { label: d.label }, create: { bookId, dayNo: d.dayNo, label: d.label } });
      dayIds.set(d.dayNo, day.id);
    }
    for (let i = 0; i < words.length; i++) {
      await tx.word.update({ where: { id: words[i].id }, data: { dayId: dayIds.get(plan[i].dayNo)! } });
    }
    // 비어 버린 DAY 정리
    const empty = await tx.bookDay.findMany({ where: { bookId, words: { none: {} } }, select: { id: true } });
    if (empty.length) await tx.bookDay.deleteMany({ where: { id: { in: empty.map((e) => e.id) } } });
    await tx.vocabBook.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
  });
  return dist;
}
