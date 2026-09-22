import { prisma } from "./db";
import { parseJSON } from "./util";

/**
 * 학생 개인 연습(틀린 단어 random test) 용 단어 묶음.
 * - 정답이 공개된 시험(answerVisibility=immediate 또는 answersReleased)의 틀린 문항만.
 * - 읽기 전용: 연습 결과는 어디에도 저장하지 않는다 (선생님 대시보드에 보이지 않음).
 */
export type PracticeWord = { english: string; meaning: string; distractors: string[]; from: string };
export type PracticeSet = { title: string; scope: "attempt" | "all"; attemptId?: string; words: PracticeWord[]; meaningPool: string[]; englishPool: string[]; tests: number };

type ItemResult = { itemId: string; optionId: string | null; correct: boolean };

async function wrongWordsFromGrades(userId: string, attemptId?: string): Promise<{ words: PracticeWord[]; meaningPool: Set<string>; englishPool: Set<string>; tests: number; title?: string }> {
  const gs = await prisma.gradeRevision.findMany({
    where: { current: true, attempt: { ...(attemptId ? { id: attemptId } : {}), assignment: { student: { userId, status: "active" } } } },
    include: { attempt: { select: { id: true, assignment: { select: { formId: true, exam: { select: { title: true, answerVisibility: true, answersReleased: true } } } } } } },
    orderBy: { createdAt: "desc" },
  });
  const visible = gs.filter((g) => g.attempt.assignment.exam.answerVisibility === "immediate" || g.attempt.assignment.exam.answersReleased);
  const wrongIds = new Set<string>();
  const formIds = new Set<string>();
  const fromByItem = new Map<string, string>();
  for (const g of visible) {
    formIds.add(g.attempt.assignment.formId);
    for (const r of parseJSON<ItemResult[]>(g.itemResults, [])) {
      if (!r.correct) {
        wrongIds.add(r.itemId);
        fromByItem.set(r.itemId, g.attempt.assignment.exam.title);
      }
    }
  }
  const meaningPool = new Set<string>();
  const englishPool = new Set<string>();
  const words: PracticeWord[] = [];
  const seen = new Set<string>();
  if (formIds.size) {
    const items = await prisma.formItem.findMany({ where: { formId: { in: [...formIds] } }, include: { options: true, word: { select: { meaning: true } } }, orderBy: { position: "asc" } });
    for (const it of items) {
      englishPool.add(it.prompt);
      for (const o of it.options) meaningPool.add(o.text);
      meaningPool.add(it.word.meaning);
      if (!wrongIds.has(it.id)) continue;
      const key = it.prompt.toLowerCase();
      if (seen.has(key)) continue; // 같은 단어를 여러 시험에서 틀렸으면 한 번만
      seen.add(key);
      const correct = it.options.find((o) => o.isCorrect)?.text ?? it.word.meaning;
      words.push({ english: it.prompt, meaning: correct, distractors: it.options.filter((o) => !o.isCorrect).map((o) => o.text), from: fromByItem.get(it.id) ?? "" });
    }
  }
  return { words, meaningPool, englishPool, tests: visible.length, title: attemptId ? visible[0]?.attempt.assignment.exam.title : undefined };
}

/** 시험 한 개의 틀린 단어. 본인 응시가 아니거나 정답 미공개면 null */
export async function practiceSetForAttempt(attemptId: string, userId: string): Promise<PracticeSet | null> {
  const r = await wrongWordsFromGrades(userId, attemptId);
  if (!r.title) return null;
  return { title: r.title, scope: "attempt", attemptId, words: r.words, meaningPool: [...r.meaningPool], englishPool: [...r.englishPool], tests: r.tests };
}

/** 지금까지 틀린 단어 전부 (공개된 시험만, 중복 제거) */
export async function practiceSetAll(userId: string): Promise<PracticeSet> {
  const r = await wrongWordsFromGrades(userId);
  return { title: "지금까지 틀린 단어", scope: "all", words: r.words, meaningPool: [...r.meaningPool], englishPool: [...r.englishPool], tests: r.tests };
}
