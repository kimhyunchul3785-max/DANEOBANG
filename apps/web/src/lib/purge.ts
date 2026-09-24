import { prisma } from "@/lib/db";

/**
 * 시험 하나와 연결된 데이터를 모두 지운다 (시험 영구 삭제 · 단어장 영구 삭제). 반환: 지운 배정 수.
 * 배정 → 응시(→ 답안 · 성적 · 시험지 · 그 응시에서 생긴 재시험 과제)는 cascade.
 * 이 시험이 '재시험 시험'이었다면 원래 재시험 과제는 출제 전으로 되돌린다.
 */
export async function purgeExam(examId: string) {
  const pageIds = (await prisma.printPage.findMany({ where: { print: { form: { examId } } }, select: { id: true } })).map((p) => p.id);
  const assignments = await prisma.assignment.count({ where: { examId } });
  await prisma.$transaction([
    ...(pageIds.length ? [prisma.scanUpload.updateMany({ where: { pageId: { in: pageIds } }, data: { pageId: null } })] : []),
    prisma.retakeTask.updateMany({ where: { retakeExamId: examId }, data: { retakeExamId: null, status: "pending", issuedAt: null, dueAt: null } }),
    prisma.assignment.deleteMany({ where: { examId } }),
    prisma.job.deleteMany({ where: { resourceId: examId } }),
    prisma.exam.delete({ where: { id: examId } }),
  ]);
  return assignments;
}
