/**
 * 화면이 쓰는 데이터 훅. 권한 판단은 하지 않는다 — 서버가 scope(담당 학생·학원)를 적용한 결과를 그대로 보여줄 뿐이다.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { qk } from "./keys";
import { useAuth } from "@/auth/AuthProvider";

function useAcademyId() {
  const { academyId } = useAuth();
  if (!academyId) throw new Error("academy not selected");
  return academyId;
}

export function useDashboard() {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.dashboard(academyId), queryFn: () => api.dashboard.get() });
}
export function useStudents(q: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.students(academyId, q), queryFn: () => api.students.list(q || undefined), placeholderData: (prev) => prev });
}
export function useStudent(id: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.student(academyId, id), queryFn: () => api.students.detail(id), enabled: !!id });
}
export function useExams() {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.exams(academyId), queryFn: () => api.exams.list() });
}
export function useExam(id: string) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.exam(academyId, id), queryFn: () => api.exams.detail(id), enabled: !!id });
}
export function useResults(filters: { examId?: string; studentId?: string }) {
  const academyId = useAcademyId();
  return useQuery({ queryKey: qk.results(academyId, filters), queryFn: () => api.results.list(filters) });
}
