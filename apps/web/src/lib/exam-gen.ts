import { prisma } from "./db";
import { seededRandom, shuffle, normalizeMeaning, sha256 } from "./util";
import { EXAM_DEFAULTS } from "./constants";

export type GeneratedItem = {
  wordId: string;
  prompt: string;
  dayLabel: string;
  options: { text: string; isCorrect: boolean }[];
};

export type GenerateResult = { items: GeneratedItem[]; warnings: string[]; distribution: Record<string, number> };

type PoolWord = { id: string; english: string; pos: string | null; meaning: string; synonyms: string | null; dayId: string; dayLabel: string; dayNo: number };

function meaningTokens(m: string) {
  return normalizeMeaning(m)
    .split(/[\s,/]+/)
    .filter((t) => t.length >= 2);
}

/**
 * 범위(dayIds) 안의 승인 단어로 영어→한국어 사지선다 생성.
 * - 문항 단어, 문항 순서, 보기 순서를 각각 seed 기반으로 섞는다.
 * - DAY별 균등 배분, 부족하면 다른 DAY로 재배분, 전체 부족 시 오류(중복으로 채우지 않음).
 * - 오답: 같은 범위의 다른 단어 뜻. 같은 품사 우선, 동일 뜻·동의어·같은 영어의 다른 뜻 제외.
 */
export async function generateItems(params: { dayIds: string[]; questionCount: number; seed: string; onlyWordIds?: string[]; distractorDayIds?: string[] }): Promise<GenerateResult> {
  const { dayIds, questionCount, seed } = params;
  const rnd = seededRandom(seed);
  const warnings: string[] = [];

  const fetchPool = async (ids: string[]): Promise<PoolWord[]> => {
    const ws = await prisma.word.findMany({ where: { dayId: { in: ids }, approved: true, excluded: false }, include: { day: true } });
    return ws.map((w) => ({ id: w.id, english: w.english, pos: w.pos, meaning: w.meaning, synonyms: w.synonyms, dayId: w.dayId, dayLabel: w.day.label, dayNo: w.day.dayNo }));
  };
  const pool = await fetchPool(dayIds);
  const distractorPool = params.distractorDayIds?.length ? await fetchPool([...new Set([...dayIds, ...params.distractorDayIds])]) : pool;

  // 문항 단어 선택
  let candidates = params.onlyWordIds ? pool.filter((w) => params.onlyWordIds!.includes(w.id)) : pool;
  if (candidates.length === 0) throw new Error("no_words");
  const target = Math.min(questionCount, candidates.length);
  if (candidates.length < questionCount) warnings.push(`선택 범위의 출제 가능 단어가 ${candidates.length}개라 ${target}문항으로 줄였습니다. (중복 출제하지 않음)`);

  // DAY별 균등 배분
  const byDay = new Map<string, PoolWord[]>();
  for (const w of candidates) byDay.set(w.dayId, [...(byDay.get(w.dayId) ?? []), w]);
  const dayOrder = shuffle([...byDay.keys()], rnd);
  const quota = new Map<string, number>();
  let remaining = target;
  // 1차: 균등
  const base = Math.floor(target / dayOrder.length);
  for (const d of dayOrder) {
    const q = Math.min(base, byDay.get(d)!.length);
    quota.set(d, q);
    remaining -= q;
  }
  // 2차: 남는 문항을 여유 있는 DAY에 순환 배분
  let guard = 0;
  while (remaining > 0 && guard++ < 10000) {
    let placed = false;
    for (const d of dayOrder) {
      if (remaining === 0) break;
      if (quota.get(d)! < byDay.get(d)!.length) {
        quota.set(d, quota.get(d)! + 1);
        remaining--;
        placed = true;
      }
    }
    if (!placed) break;
  }
  const distribution: Record<string, number> = {};
  const chosen: PoolWord[] = [];
  for (const d of dayOrder) {
    const ws = shuffle(byDay.get(d)!, rnd).slice(0, quota.get(d)!);
    distribution[ws[0]?.dayLabel ?? d] = ws.length;
    chosen.push(...ws);
  }
  candidates = shuffle(chosen, rnd);

  // 보기 생성
  const items: GeneratedItem[] = [];
  const short: string[] = [];
  for (const w of candidates) {
    const correctNorm = normalizeMeaning(w.meaning);
    const syn = new Set((w.synonyms ?? "").split(",").map((s) => normalizeMeaning(s)).filter(Boolean));
    const sameEnglishMeanings = new Set(distractorPool.filter((o) => o.english.toLowerCase() === w.english.toLowerCase()).map((o) => normalizeMeaning(o.meaning)));
    const usable = distractorPool.filter((o) => {
      if (o.id === w.id) return false;
      const n = normalizeMeaning(o.meaning);
      if (!n || n === correctNorm) return false;
      if (syn.has(n) || sameEnglishMeanings.has(n)) return false;
      const oSyn = (o.synonyms ?? "").split(",").map((s) => normalizeMeaning(s));
      if (oSyn.includes(correctNorm)) return false;
      return true;
    });
    // 같은 품사 우선
    const samePos = usable.filter((o) => o.pos && w.pos && o.pos === w.pos);
    let picks: PoolWord[] = [];
    const seen = new Set<string>();
    const take = (arr: PoolWord[]) => {
      for (const o of shuffle(arr, rnd)) {
        const n = normalizeMeaning(o.meaning);
        if (seen.has(n)) continue;
        seen.add(n);
        picks.push(o);
        if (picks.length === EXAM_DEFAULTS.optionCount - 1) break;
      }
    };
    take(samePos);
    if (picks.length < EXAM_DEFAULTS.optionCount - 1) take(usable.filter((o) => !picks.includes(o)));
    if (picks.length < EXAM_DEFAULTS.optionCount - 1) {
      short.push(w.english);
      picks = picks.slice(0, EXAM_DEFAULTS.optionCount - 1);
    }
    // 복수 정답 우려: 정답 뜻과 토큰이 겹치는 오답
    const ct = new Set(meaningTokens(w.meaning));
    for (const p of picks) {
      if (meaningTokens(p.meaning).some((t) => ct.has(t))) warnings.push(`"${w.english}" 보기 중 "${p.meaning}"(${p.english})이(가) 정답 "${w.meaning}"과 뜻이 겹칠 수 있습니다. 검토 후 발행하세요.`);
    }
    const options = shuffle([{ text: w.meaning, isCorrect: true }, ...picks.map((p) => ({ text: p.meaning, isCorrect: false }))], rnd);
    items.push({ wordId: w.id, prompt: w.english, dayLabel: w.dayLabel, options });
  }
  if (short.length) throw new Error(`distractor_shortage:${short.slice(0, 5).join(", ")}${short.length > 5 ? ` 외 ${short.length - 5}개` : ""}`);
  return { items, warnings, distribution };
}

export function formHash(items: GeneratedItem[]) {
  return sha256(JSON.stringify(items.map((i) => [i.prompt, i.options.map((o) => [o.text, o.isCorrect])])));
}

/** 시험의 새 form 버전 생성 (draft) */
export async function createFormForExam(examId: string, opts?: { onlyWordIds?: string[]; distractorDayIds?: string[] }) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { scopes: true, forms: { select: { version: true } } } });
  const seed = `${examId}:${Date.now()}:${Math.random()}`;
  const gen = await generateItems({ dayIds: exam.scopes.map((s) => s.dayId), questionCount: exam.questionCount, seed, onlyWordIds: opts?.onlyWordIds, distractorDayIds: opts?.distractorDayIds });
  const version = (exam.forms.reduce((m, f) => Math.max(m, f.version), 0) || 0) + 1;
  const form = await prisma.$transaction(async (tx) => {
    // 기존 draft 는 하나만 유지
    await tx.examForm.deleteMany({ where: { examId, status: "draft" } });
    const f = await tx.examForm.create({ data: { examId, version, seed, warnings: JSON.stringify(gen.warnings), hash: formHash(gen.items) } });
    for (const [i, it] of gen.items.entries()) {
      await tx.formItem.create({
        data: {
          formId: f.id,
          position: i + 1,
          wordId: it.wordId,
          prompt: it.prompt,
          dayLabel: it.dayLabel,
          options: { create: it.options.map((o, j) => ({ position: j + 1, text: o.text, isCorrect: o.isCorrect })) },
        },
      });
    }
    return f;
  });
  return { form, gen };
}
