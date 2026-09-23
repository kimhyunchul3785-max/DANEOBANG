/**
 * 요청 payload · 클라이언트 입력 검증 (Zod). 웹 API route 와 모바일이 같은 스키마를 쓴다.
 * DB 모델 검증이 아니라 "요청 형태" 검증이다.
 */
import { z } from "zod";

// ───────── 인증
/** POST /api/v1/auth/login — 이메일 또는 휴대폰 + 비밀번호 (ALLOW_DEV_LOGIN 일 때만 서버가 받는다) */
export const mobileLoginSchema = z
  .object({
    email: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((v) => !!(v.email || v.phone), { message: "email 또는 phone 이 필요합니다.", path: ["email"] });
export type MobileLoginInput = z.infer<typeof mobileLoginSchema>;

/** POST /api/v1/auth/oauth — 공급사 access token 을 서버가 검증한다 */
export const mobileOAuthSchema = z.object({
  provider: z.enum(["google", "kakao"]),
  accessToken: z.string().min(1).max(4096),
});
export type MobileOAuthInput = z.infer<typeof mobileOAuthSchema>;

/** POST /api/v1/devices — 푸시 토큰 등록 */
export const deviceRegisterSchema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(["android", "ios", "web"]),
});
export type DeviceRegisterInput = z.infer<typeof deviceRegisterSchema>;

// ───────── 조회 파라미터
export const studentsQuerySchema = z.object({ q: z.string().trim().max(100).optional() });
export type StudentsQuery = z.infer<typeof studentsQuerySchema>;

export const resultsQuerySchema = z.object({
  examId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
});
export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

// ───────── 응시 (학생 앱)
export const answerInputSchema = z.object({ item_id: z.string().min(1), option_id: z.string().min(1).nullable() });

/** PATCH /api/v1/attempts/{id}/answers */
export const answersPatchSchema = z.object({
  client_request_id: z.string().optional(),
  expected_revision: z.number().int().min(0),
  answers: z.array(answerInputSchema).max(500),
});
export type AnswersPatchInput = z.infer<typeof answersPatchSchema>;

/** POST /api/v1/attempts/{id}/submit — 미전송 답안이 있으면 함께 보낸다 (본문 없이도 가능) */
export const attemptSubmitSchema = z.object({
  expected_revision: z.number().int().min(0).optional(),
  answers: z.array(answerInputSchema).max(500).optional(),
});
export type AttemptSubmitInput = z.infer<typeof attemptSubmitSchema>;

// ───────── 클라이언트 입력 (화면 폼)
/** 학원 이름 (학원 만들기) — 웹 /welcome/new 와 같은 규칙 */
export const academyNameSchema = z.string().trim().min(2, "학원 이름은 2자 이상").max(40, "학원 이름은 40자 이하");
/** 반 코드 6자리 */
export const classJoinCodeSchema = z.string().trim().regex(/^\d{6}$/, "반 코드는 숫자 6자리입니다.");
