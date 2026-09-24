import { prisma } from "@/lib/db";
import { planDays, distribution, DEFAULT_SPLIT_DAYS } from "@/lib/day-plan";

/** 표제어 정규화: 소문자 · 앞뒤 공백 · 괄호/구두점 제거 · 연속 공백 하나로. 같으면 "겹치는 단어"로 본다 */
export function normalizeHeadword(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9가-힣'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MergeWord = { id: string; bookId: string; english: string; pos: string | null; meaning: string; synonyms: string | null; section: string | null; approved: boolean; excluded: boolean; dayNo: number; dayLabel: string };

/** 병합 미리보기: 순서대로 단어를 모으고 앞에서 이미 나온 표제어는 제거한다 */
export async function previewMerge(academyId: string, bookIds: string[]) {
  const books = await prisma.vocabBook.findMany({ where: { id: { in: bookIds }, academyId }, include: { days: { orderBy: { dayNo: "asc" } }, _count: { select: { words: true } } } });
  const ordered = bookIds.map((id) => books.find((b) => b.id === id)).filter((b): b is (typeof books)[number] => !!b);
  const words = await prisma.word.findMany({ where: { bookId: { in: ordered.map((b) => b.id) } }, include: { day: { select: { dayNo: true, label: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const seen = new Map<string, { bookId: string; english: string }>();
  const kept: MergeWord[] = [];
  const dropped: { bookId: string; english: string; firstIn: string }[] = [];
  for (const b of ordered) {
    for (const w of words.filter((x) => x.bookId === b.id)) {
      const key = normalizeHeadword(w.english);
      const first = seen.get(key);
      if (first) {
        dropped.push({ bookId: b.id, english: w.english, firstIn: first.bookId });
        continue;
      }
      seen.set(key, { bookId: b.id, english: w.english });
      kept.push({ id: w.id, bookId: w.bookId, english: w.english, pos: w.pos, meaning: w.meaning, synonyms: w.synonyms, section: w.section, approved: w.approved, excluded: w.excluded, dayNo: w.day.dayNo, dayLabel: w.day.label });
    }
  }
  return { books: ordered, kept, dropped };
}

export type MergeDayMode = "append" | "resplit";

/** 병합 결과의 DAY 계획: append = 앞 단어장 DAY 그대로 + 뒤 단어장 DAY 를 이어 번호 매김 / resplit = 전체를 n일로 다시 */
export function planMergedDays(kept: MergeWord[], order: string[], mode: MergeDayMode, n = DEFAULT_SPLIT_DAYS) {
  if (mode === "resplit") {
    const plan = planDays(kept.map((w) => ({ dayNo: null, section: w.section })), "days", n);
    return { plan, dist: distribution(plan) };
  }
  // append: 단어장별 DAY 번호를 오프셋으로 이어 붙인다 (빈 DAY 는 생기지 않게 실제 쓰인 DAY 만 번호를 매긴다)
  const plan: { dayNo: number; label: string }[] = [];
  let offset = 0;
  for (const bookId of order) {
    const ws = kept.filter((w) => w.bookId === bookId);
    const used = [...new Set(ws.map((w) => w.dayNo))].sort((a, b) => a - b);
    const map = new Map(used.map((d, i) => [d, i + 1 + offset]));
    for (const w of ws) plan.push({ dayNo: map.get(w.dayNo)!, label: `DAY ${map.get(w.dayNo)}` });
    offset += used.length;
  }
  // kept 순서와 plan 순서를 맞춘다 (kept 는 단어장 순서대로 들어 있음)
  return { plan, dist: distribution(plan) };
}
