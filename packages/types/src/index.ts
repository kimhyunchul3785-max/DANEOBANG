/**
 * 단어방 /api/v1 DTO — 웹·모바일이 공유하는 API contract.
 * Prisma 모델을 그대로 내보내지 않는다 (Database Model ≠ API DTO). 날짜는 JSON 으로 오가므로 ISO 문자열이다.
 */

// ───────── 공통 봉투
export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  [extra: string]: unknown;
}
export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiErrorBody | null;
}
/** ISO 8601 (예: 2026-09-23T06:38:56.010Z) */
export type IsoDate = string;

// ───────── 계정 · 학원 · 역할
export type AcademyRole = "OWNER" | "TEACHER" | "ADMIN";

export interface ApiUser {
  id: string;
  name: string;
  email: string | null;
  isPlatformAdmin: boolean;
}
export interface AcademyRef {
  id: string;
  name: string;
  slug: string;
  status: string;
}
export interface AcademyMembership {
  academy: AcademyRef;
  role: AcademyRole;
}
/** 같은 계정에 연결된 학생 자리 (학원별로 하나씩) */
export interface StudentContext {
  studentId: string;
  name: string;
  academy: { id: string; name: string; slug: string };
}
/** GET /api/v1/me */
export interface MeResponse {
  user: ApiUser;
  memberships: AcademyMembership[];
  students: StudentContext[];
}
/** GET /api/v1/academies */
export interface AcademyListItem extends AcademyRef {
  role: AcademyRole;
}
/** POST /api/v1/auth/login · /auth/oauth */
export interface AuthTokenResponse {
  token: string;
  user: { id: string; name: string; email: string | null };
}
/** POST /api/v1/devices */
export interface DeviceRegisterResponse {
  registered: boolean;
}

// ───────── 오늘 (dashboard)
export interface GradeSummary {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}
export interface RecentGrade extends GradeSummary {
  attemptId: string;
  student: { id: string; name: string };
  exam: { id: string; title: string };
  at: IsoDate;
}
/** GET /api/v1/dashboard (x-academy-id) */
export interface DashboardResponse {
  academy: AcademyRef;
  role: AcademyRole;
  students: number;
  today: { total: number; completed: number };
  overdue: number;
  retakesThisWeek: number;
  scansPending: number;
  recentGrades: RecentGrade[];
}

// ───────── 학생
export type StudentStatus = "active" | "inactive" | string;
export interface StudentListItem {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  class: { id: string; name: string } | null;
  linked: boolean;
  status: StudentStatus;
}
export type AssignmentStatus = "assigned" | "in_progress" | "completed" | string;
export type AttemptMode = "online" | "paper" | null;
export type AttemptStatus = "in_progress" | "review" | "graded" | "void" | string;

export interface StudentAttemptSummary {
  attemptId: string;
  attemptNo: number;
  mode: AttemptMode;
  status: AttemptStatus;
  submittedAt: IsoDate | null;
  grade: GradeSummary | null;
}
export interface StudentHistoryItem {
  assignmentId: string;
  exam: { id: string; title: string; isRetake: boolean };
  status: AssignmentStatus;
  mode: AttemptMode;
  dueAt: IsoDate | null;
  attempts: StudentAttemptSummary[];
}
/** GET /api/v1/students/{id} */
export interface StudentDetail {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  class: { id: string; name: string } | null;
  linked: boolean;
  history: StudentHistoryItem[];
  /** 끝나지 않은 재시험 (출제 전 · 응시 대기) */
  pendingRetakes: { id: string; dueAt: IsoDate | null; status: string; issued: boolean; title: string }[];
}

// ───────── 시험
export type ExamStatus = "draft" | "published" | "archived" | string;
/** GET /api/v1/exams */
export interface ExamListItem {
  id: string;
  title: string;
  book: string;
  questionCount: number;
  passScore: number;
  status: ExamStatus;
  isRetake: boolean;
  answersReleased: boolean;
  assignments: number;
  /** 완료한 배정 수 */
  completed: number;
  /** 마감이 지났는데 안 친 배정 수 */
  overdue: number;
  /** 안 친 학생들의 공통 마감 (학생마다 다르거나 없으면 null) */
  dueAt: IsoDate | null;
  /** 웹 시험 탭과 같은 상태 분류 */
  state: "draft" | "archived" | "none" | "scheduled" | "overdue" | "open" | "done" | string;
  createdAt: IsoDate;
}
export interface ExamFormRef {
  id: string;
  version: number;
  status: "draft" | "published" | string;
  publishedAt: IsoDate | null;
}
export interface ExamAssignmentRow {
  assignmentId: string;
  student: { id: string; name: string };
  status: AssignmentStatus;
  mode: AttemptMode;
  dueAt: IsoDate | null;
  latest: { attemptId: string; status: AttemptStatus; grade: { score: number; passed: boolean } | null } | null;
}
/** GET /api/v1/exams/{id} — 응시자는 내가 볼 수 있는 학생(담당)만 */
export interface ExamDetail {
  id: string;
  title: string;
  questionCount: number;
  passScore: number;
  status: ExamStatus;
  forms: ExamFormRef[];
  assignments: ExamAssignmentRow[];
}

// ───────── 성적
/** GET /api/v1/results?examId=&studentId= */
export interface ResultItem extends GradeSummary {
  attemptId: string;
  student: { id: string; name: string };
  exam: { id: string; title: string; isRetake: boolean };
  attemptNo: number;
  mode: AttemptMode;
  revision: number;
  at: IsoDate;
}

// ───────── 학생 앱 (v0.2 에서 RN 화면으로 이전)
export interface LearnAssignment {
  assignmentId: string;
  exam: {
    id: string;
    title: string;
    questionCount: number;
    passScore: number;
    timeLimitMin: number | null;
    secondsPerItem: number;
    isRetake: boolean;
    scoreVisibility: "immediate" | "after_release" | string;
    answerVisibility: "immediate" | "after_release" | string;
    answersReleased: boolean;
    academy: { name: string };
  };
  studentName: string;
  status: AssignmentStatus | "expired";
  mode: AttemptMode;
  startAt: IsoDate | null;
  dueAt: IsoDate | null;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  score: GradeSummary | { hidden: true } | null;
  canStart: boolean;
}
export interface AttemptStartResponse {
  attemptId: string;
  deadlineAt: IsoDate | null;
}
export interface AnswerInput {
  item_id: string;
  option_id: string | null;
}
export interface AnswersPatchResponse {
  attempt_id: string;
  revision: number;
  saved_at: IsoDate;
}
export interface SubmitResponse {
  attempt_id: string;
  graded: boolean;
  already_graded: boolean;
  expired: boolean;
}

// ───────── 재시험 (모바일 현장 처리)
/** GET /api/v1/retakes */
export interface RetakeListItem {
  id: string;
  student: { id: string; name: string };
  title: string;
  score: number | null;
  wrong: number;
  sameCount: number;
  issued: boolean;
  dueAt: IsoDate | null;
  createdAt: IsoDate;
}
/** POST /api/v1/retakes/{id}/issue */
export interface RetakeIssueResponse {
  examId: string;
  questionCount: number;
  dueAt: IsoDate;
}
/** POST /api/v1/exams/{id}/due */
export interface ExamDueResponse {
  updated: number;
  dueAt: IsoDate | null;
}
