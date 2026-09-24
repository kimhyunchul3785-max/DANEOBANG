/**
 * 단어방 /api/v1 공용 클라이언트 (웹 · 모바일).
 *  - 저장소(SecureStore / Cookie)에 의존하지 않는다. 토큰·학원·학생 컨텍스트는 밖에서 함수로 공급한다.
 *  - 서버 봉투 { data, error } 를 풀어 data 만 돌려주고, 실패는 DaneobangApiError 로 던진다.
 *  - 401 이면 onUnauthorized 를 한 번 호출한다 (앱은 토큰을 지우고 로그인으로).
 */
import type {
  AcademyListItem,
  AnswersPatchResponse,
  ApiEnvelope,
  AttemptStartResponse,
  AuthTokenResponse,
  DashboardResponse,
  DeviceRegisterResponse,
  ExamDetail,
  ExamListItem,
  LearnAssignment,
  MeResponse,
  ResultItem,
  StudentDetail,
  StudentListItem,
  SubmitResponse,
  RetakeListItem,
  RetakeIssueResponse,
  ExamDueResponse,
} from "@daneobang/types";
import type { AnswersPatchInput, AttemptSubmitInput, DeviceRegisterInput, MobileLoginInput, MobileOAuthInput, ResultsQuery } from "@daneobang/validation";

export class DaneobangApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, retryable = false, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "DaneobangApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.extra = extra;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

type MaybePromise<T> = T | Promise<T>;
export interface ApiClientOptions {
  /** 예: https://api.daneobang.com 또는 http://10.0.2.2:3000 (끝 슬래시 없이) */
  baseUrl: string;
  /** Bearer 토큰 공급자 (모바일: SecureStore). 웹은 쿠키를 쓰므로 생략 */
  getAccessToken?: () => MaybePromise<string | null | undefined>;
  /** x-academy-id 공급자 */
  getAcademyId?: () => MaybePromise<string | null | undefined>;
  /** x-student-id 공급자 (학생 컨텍스트 API) */
  getStudentId?: () => MaybePromise<string | null | undefined>;
  /** 401 을 받았을 때 (토큰 삭제 → 로그인 화면) */
  onUnauthorized?: (err: DaneobangApiError) => void;
  /** 테스트·특수 환경용 fetch 주입 */
  fetch?: typeof fetch;
  /** 웹에서 same-origin 쿠키를 같이 보낼 때 "include" */
  credentials?: "omit" | "same-origin" | "include";
  /** 요청 타임아웃 (ms). 기본 20000 */
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function createApiClient(opts: ApiClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function request<T>(method: string, path: string, init?: { body?: unknown; query?: Query; rawBody?: boolean; academy?: boolean; student?: boolean }): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    const token = await opts.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init?.academy !== false) {
      const academyId = await opts.getAcademyId?.();
      if (academyId) headers.set("x-academy-id", academyId);
    }
    if (init?.student !== false) {
      const studentId = await opts.getStudentId?.();
      if (studentId) headers.set("x-student-id", studentId);
    }
    let url = `${base}/api/v1${path}`;
    if (init?.query) {
      const qs = Object.entries(init.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000) : undefined;
    let res: Response;
    try {
      res = await doFetch(url, { method, headers, body, credentials: opts.credentials, signal: ctrl?.signal });
    } catch (e) {
      if (timer) clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      throw new DaneobangApiError(0, aborted ? "timeout" : "network_error", aborted ? "서버 응답이 없습니다 (시간 초과)." : "네트워크에 연결할 수 없습니다.", true);
    }
    if (timer) clearTimeout(timer);
    let json: ApiEnvelope<T> | null = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text) as ApiEnvelope<T>;
      } catch {
        json = null;
      }
    }
    if (!res.ok || !json || json.error) {
      const err = json?.error;
      const apiErr = new DaneobangApiError(res.status, err?.code ?? (res.ok ? "bad_envelope" : `http_${res.status}`), err?.message ?? (res.ok ? "응답 형식이 올바르지 않습니다." : `요청 실패 (${res.status})`), err?.retryable ?? (res.status === 503 || res.status === 429), err ? stripKnown(err) : {});
      if (apiErr.status === 401) opts.onUnauthorized?.(apiErr);
      throw apiErr;
    }
    return json.data as T;
  }

  const api = {
    /** 봉투를 풀어 data 만 돌려준다. 새 엔드포인트가 생기면 여기서 확장 */
    request,
    auth: {
      /** 개발용 이메일/휴대폰 로그인 (ALLOW_DEV_LOGIN) */
      login: (body: MobileLoginInput) => request<AuthTokenResponse>("POST", "/auth/login", { body, academy: false, student: false }),
      /** Google/Kakao access token → 단어방 Bearer 토큰 */
      oauth: (body: MobileOAuthInput) => request<AuthTokenResponse>("POST", "/auth/oauth", { body, academy: false, student: false }),
    },
    me: { get: () => request<MeResponse>("GET", "/me", { academy: false, student: false }) },
    academies: { list: () => request<AcademyListItem[]>("GET", "/academies", { academy: false, student: false }) },
    devices: { register: (body: DeviceRegisterInput) => request<DeviceRegisterResponse>("POST", "/devices", { body, academy: false, student: false }) },
    dashboard: { get: () => request<DashboardResponse>("GET", "/dashboard") },
    students: {
      list: (q?: string) => request<StudentListItem[]>("GET", "/students", { query: { q } }),
      detail: (id: string) => request<StudentDetail>("GET", `/students/${encodeURIComponent(id)}`),
    },
    exams: {
      list: () => request<ExamListItem[]>("GET", "/exams"),
      detail: (id: string) => request<ExamDetail>("GET", `/exams/${encodeURIComponent(id)}`),
      /** 마감 연장: days = 오늘부터 n일 뒤 23:59(KST). scope=overdue 면 이미 지난 학생만 */
      extendDue: (id: string, body: { days?: number; dueAt?: string | null; scope?: "open" | "overdue" }) => request<ExamDueResponse>("POST", `/exams/${encodeURIComponent(id)}/due`, { body }),
    },
    retakes: {
      list: (studentId?: string) => request<RetakeListItem[]>("GET", "/retakes", { query: { studentId } }),
      /** 재시험 출제: 기본 오답만 · 3일 뒤 마감 */
      issue: (id: string, body: { mode?: "wrong" | "same"; days?: number } = {}) => request<RetakeIssueResponse>("POST", `/retakes/${encodeURIComponent(id)}/issue`, { body }),
      /** 한 학생의 출제 전 여러 건을 누적 오답 재시험 하나로 */
      issueCombined: (taskIds: string[], days?: number) => request<RetakeIssueResponse & { tasks: number }>("POST", "/retakes/combined", { body: { taskIds, days } }),
    },
    results: { list: (filters: ResultsQuery = {}) => request<ResultItem[]>("GET", "/results", { query: filters }) },
    // 학생 앱 (v0.2)
    learn: { assignments: () => request<LearnAssignment[]>("GET", "/learn/assignments", { academy: false }) },
    attempts: {
      start: (assignmentId: string) => request<AttemptStartResponse>("POST", `/assignments/${encodeURIComponent(assignmentId)}/start`, { academy: false }),
      get: (attemptId: string) => request<Record<string, unknown>>("GET", `/attempts/${encodeURIComponent(attemptId)}`, { academy: false }),
      saveAnswers: (attemptId: string, body: AnswersPatchInput) => request<AnswersPatchResponse>("PATCH", `/attempts/${encodeURIComponent(attemptId)}/answers`, { body, academy: false }),
      submit: (attemptId: string, body?: AttemptSubmitInput) => request<SubmitResponse>("POST", `/attempts/${encodeURIComponent(attemptId)}/submit`, { body, academy: false }),
      result: (attemptId: string) => request<Record<string, unknown>>("GET", `/attempts/${encodeURIComponent(attemptId)}/result`, { academy: false }),
    },
  };
  return api;
}
export type ApiClient = ReturnType<typeof createApiClient>;

function stripKnown(err: Record<string, unknown>) {
  const { code: _c, message: _m, retryable: _r, ...rest } = err;
  return rest;
}
