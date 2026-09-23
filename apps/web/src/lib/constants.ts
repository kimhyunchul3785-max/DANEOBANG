export const ROLES = {
  OWNER: "OWNER",
  TEACHER: "TEACHER",
} as const;
export type MemberRole = (typeof ROLES)[keyof typeof ROLES];

export const APP_NAME = "단어방";

export const FILE_LIMITS = {
  documentMaxBytes: 50 * 1024 * 1024,
  imageMaxBytes: 20 * 1024 * 1024,
  zipTotalMaxBytes: 200 * 1024 * 1024,
  zipMaxEntries: 2000,
  pdfMaxPages: 200,
};

export const EXAM_DEFAULTS = {
  questionCount: 40,
  passScore: 90,
  optionCount: 4,
};

export const SESSION_COOKIE = "db_session";
export const ACADEMY_COOKIE = "db_academy";
/** 마지막으로 들어간 쪽 — "app" (선생님·학원장, 학원은 ACADEMY_COOKIE) | "learn" (학생). 다음 로그인 때 바로 그리로 보낸다 */
export const LAST_COOKIE = "db_last";
/** 학생 자리: 선택한 Student.id (학원마다 다른 학생 명단 — 시험·성적·재시험은 이 학생 기준으로만 보인다) */
export const STUDENT_COOKIE = "db_student";

/** 사용자에게 보이는 역할 이름 (내부: OWNER · TEACHER · ADMIN) */
export const ROLE_LABEL: Record<string, string> = { OWNER: "학원장", TEACHER: "선생님", ADMIN: "관리자" };
