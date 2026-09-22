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
