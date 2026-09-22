import { prisma } from "./db";
import { parseJSON } from "./util";
import type { RenderInput } from "./omr/pdf";

/**
 * 오답노트 데이터: 당시 시험 스냅샷(form item/option)을 사용하고 현재 유효 grade revision 기준으로 오답을 고른다.
 * scope=cumulative 이면 같은 학생의 미해결 오답(최근 통과하지 못한 항목)을 학습 항목별로 묶는다.
 */
export async function buildWrongNote(attemptId: string, scope: "attempt" | "cumulative"): Promise<RenderInput | null> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { grades: { where: { current: true } }, assignment: { include: { exam: true, student: true } } } });
  if (!attempt || !attempt.grades[0]) return null;
  const attemptIds = scope === "attempt" ? [attemptId] : (await prisma.attempt.findMany({ where: { assignment: { studentId: attempt.assignment.studentId }, status: "graded" }, select: { id: true } })).map((a) => a.id);
  const grades = await prisma.gradeRevision.findMany({ where: { attemptId: { in: attemptIds }, current: true }, include: { attempt: { include: { assignment: { include: { exam: true } } } } }, orderBy: { createdAt: "asc" } });
  const wrongByWord = new Map<string, { count: number; last: Date; itemId: string; optionId: string | null }>();
  for (const g of grades) {
    const results = parseJSON<{ itemId: string; optionId: string | null; correct: boolean }[]>(g.itemResults, []);
    const items = await prisma.formItem.findMany({ where: { id: { in: results.map((r) => r.itemId) } }, select: { id: true, wordId: true } });
    for (const r of results) {
      const wordId = items.find((i) => i.id === r.itemId)?.wordId;
      if (!wordId) continue;
      if (r.correct) {
        if (scope === "cumulative") wordBookkeeping(wrongByWord, wordId, null); // 이후 맞히면 해결
        continue;
      }
      const prev = wrongByWord.get(wordId);
      wrongByWord.set(wordId, { count: (prev?.count ?? 0) + 1, last: g.createdAt, itemId: r.itemId, optionId: r.optionId });
    }
  }
  const entries = [...wrongByWord.values()].filter((v) => v.count > 0);
  const items = await prisma.formItem.findMany({ where: { id: { in: entries.map((e) => e.itemId) } }, include: { options: { orderBy: { position: "asc" } } } });
  const renderItems = entries
    .map((e, i) => {
      const it = items.find((x) => x.id === e.itemId)!;
      return { itemId: it.id, position: i + 1, prompt: scope === "cumulative" && e.count > 1 ? `${it.prompt} (${e.count}회)` : it.prompt, options: it.options.map((o) => ({ position: o.position, text: o.text, isCorrect: o.isCorrect, chosen: o.id === e.optionId })) };
    })
    .sort((a, b) => a.position - b.position);
  return {
    kind: "wrong_note",
    title: scope === "attempt" ? `${attempt.assignment.exam.title} 오답노트` : `누적 오답노트 (미해결 ${renderItems.length}개)`,
    subtitle: scope === "attempt" ? `${attempt.grades[0].correctCount}/${attempt.grades[0].totalCount} 정답 · 오답 ${renderItems.length}개` : "최근 시험까지 누적 · 이후 맞힌 항목은 제외",
    studentName: attempt.assignment.student.name,
    items: renderItems.length ? renderItems : [{ itemId: "none", position: 1, prompt: "(오답 없음)", options: [] }],
    note: "복습용 · 채점용 QR 없음",
  };
}

function wordBookkeeping(map: Map<string, { count: number; last: Date; itemId: string; optionId: string | null }>, wordId: string, _v: null) {
  // 누적 모드에서 이후 정답을 맞히면 미해결에서 제거
  map.delete(wordId);
}
