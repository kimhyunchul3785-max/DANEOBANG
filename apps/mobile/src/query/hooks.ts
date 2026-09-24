/**
 * 화면이 쓰는 데이터 훅. 권한 판단은 하지 않는다 — 서버가 scope(담당 학생·학원)를 적용한 결과를 그대로 보여줄 뿐이다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { qk } from "./keys";
import { useAuth } from "@/auth/AuthProvider";

/**
 * 선택된 학원. 앱을 딥링크·알림·프로세스 복원으로 바로 하위 화면에서 열면 인증 복원 전이라 아직 null 일 수 있다.
 * 그때 던지지 않고(이전: "academy not selected" 크래시) 쿼리를 멈춰 둔다 — 화면은 로딩, AuthGate 가 학원 선택/복원 뒤 다시 그린다.
 */
function useAcademyId(): string {
  const { academyId } = useAuth();
  return academyId ?? "";
}

export function useDashboard() {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.dashboard(academyId), queryFn: () => api.dashboard.get(), enabled: !!academyId });
}
export function useStudents(q: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.students(academyId, q), queryFn: () => api.students.list(q || undefined), placeholderData: (prev) => prev, enabled: !!academyId });
}
export function useStudent(id: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.student(academyId, id), queryFn: () => api.students.detail(id), enabled: !!id && !!academyId });
}
export function useExams() {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.exams(academyId), queryFn: () => api.exams.list(), enabled: !!academyId });
}
export function useExam(id: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.exam(academyId, id), queryFn: () => api.exams.detail(id), enabled: !!id && !!academyId });
}
export function useResults(filters: { examId?: string; studentId?: string }) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.results(academyId, filters), queryFn: () => api.results.list(filters), enabled: !!academyId });
}

export function useRetakes(studentId?: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.retakes(academyId, studentId), queryFn: () => api.retakes.list(studentId), enabled: !!academyId });
}

/** 현장 처리 뒤에는 오늘·시험·학생·재시험 캐시를 모두 새로 받는다 */
function useInvalidateAcademy() {
  const qc = useQueryClient();
  const academyId = useAcademyId();
  return () => qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === academyId });
}
/** 마감 연장 (안 친 학생 · 또는 마감 지난 학생만) */
export function useExtendDue() {
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (v: { examId: string; days: number; scope?: "open" | "overdue" }) => api.exams.extendDue(v.examId, { days: v.days, scope: v.scope }),
    onSuccess: invalidate,
  });
}
/** 재시험 출제 (기본: 오답만 · 3일 뒤 23:59) */
export function useIssueCombinedRetake() {
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (v: { studentId: string; taskIds: string[]; days?: number }) => api.retakes.issueCombined(v.taskIds, v.days),
    onSuccess: invalidate,
  });
}

export function useIssueRetake() {
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (v: { taskId: string; mode?: "wrong" | "same"; days?: number }) => api.retakes.issue(v.taskId, { mode: v.mode, days: v.days }),
    onSuccess: invalidate,
  });
}
