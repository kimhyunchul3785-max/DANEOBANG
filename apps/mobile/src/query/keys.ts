/** TanStack Query key 규칙 — 학원 종속 데이터는 academyId 를 키에 넣는다 (학원 전환 시 queryClient.clear()) */
export const qk = {
  me: () => ["me"] as const,
  dashboard: (academyId: string) => ["dashboard", academyId] as const,
  students: (academyId: string, q: string) => ["students", academyId, q] as const,
  student: (academyId: string, studentId: string) => ["student", academyId, studentId] as const,
  exams: (academyId: string) => ["exams", academyId] as const,
  exam: (academyId: string, examId: string) => ["exam", academyId, examId] as const,
  results: (academyId: string, filters: Record<string, string | undefined>) => ["results", academyId, filters] as const,
};
