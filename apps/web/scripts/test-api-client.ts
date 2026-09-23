/* 공용 API 클라이언트(@daneobang/api-client) 스모크: 실행 중인 서버(BASE_URL, 기본 localhost:3000)에 대해
   dev 로그인 → /me → /academies → x-academy-id 로 dashboard·students·exams·results → 401 처리 → 담당 학생 scope 확인.
   npm run test:api-client  (서버 실행 + 시드 필요: tester.* 계정) */
import { createApiClient, DaneobangApiError } from "@daneobang/api-client";
import type { MeResponse } from "@daneobang/types";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, note?: string) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};
const hasKeys = (o: unknown, keys: string[]) => !!o && typeof o === "object" && keys.every((k) => k in (o as Record<string, unknown>));

async function session(email: string) {
  let token: string | null = null;
  let academyId: string | null = null;
  let unauthorized = 0;
  const api = createApiClient({ baseUrl: BASE, getAccessToken: () => token, getAcademyId: () => academyId, onUnauthorized: () => unauthorized++ });
  const login = await api.auth.login({ email, password: email.startsWith("tester.") ? "test1234" : "password" });
  token = login.token;
  const me: MeResponse = await api.me.get();
  return { api, me, setAcademy: (id: string) => (academyId = id), setToken: (t: string | null) => (token = t), unauthorized: () => unauthorized };
}

(async () => {
  // 1. 학원장: 전체 학생
  const owner = await session("tester.owner@daneobang.dev");
  check("login → token + me.user", hasKeys(owner.me, ["user", "memberships", "students"]) && owner.me.user.email === "tester.owner@daneobang.dev");
  check("me.memberships has academy + role", owner.me.memberships.length >= 1 && hasKeys(owner.me.memberships[0], ["academy", "role"]) && hasKeys(owner.me.memberships[0].academy, ["id", "name", "slug", "status"]));
  const academies = await owner.api.academies.list();
  check("academies.list mirrors memberships", academies.length === owner.me.memberships.length && hasKeys(academies[0], ["id", "name", "role"]));
  const tester = owner.me.memberships.find((m) => m.academy.slug === "tester") ?? owner.me.memberships[0];
  // x-academy-id 없이 dashboard → 403 no_academy (DaneobangApiError)
  try {
    await owner.api.dashboard.get();
    check("dashboard without x-academy-id → error", false);
  } catch (e) {
    check("dashboard without x-academy-id → DaneobangApiError(403 no_academy)", e instanceof DaneobangApiError && e.status === 403 && e.code === "no_academy", e instanceof DaneobangApiError ? `${e.status} ${e.code}` : String(e));
  }
  owner.setAcademy(tester.academy.id);
  const dash = await owner.api.dashboard.get();
  check("dashboard DTO keys", hasKeys(dash, ["academy", "role", "students", "today", "overdue", "retakesThisWeek", "scansPending", "recentGrades"]) && hasKeys(dash.today, ["total", "completed"]), `students=${dash.students} today=${dash.today.completed}/${dash.today.total}`);
  check("dashboard.recentGrades item keys", dash.recentGrades.length === 0 || hasKeys(dash.recentGrades[0], ["attemptId", "student", "exam", "score", "correct", "total", "passed", "at"]));
  const students = await owner.api.students.list();
  check("students.list (owner sees all)", students.length >= 10 && hasKeys(students[0], ["id", "name", "school", "grade", "class", "linked", "status"]), `n=${students.length}`);
  const q = await owner.api.students.list("학생01");
  check("students.list(q) filters by name", q.length >= 1 && q.every((s) => s.name.includes("학생01")), `n=${q.length}`);
  const detail = await owner.api.students.detail(students[0].id);
  check("students.detail DTO keys", hasKeys(detail, ["id", "name", "class", "linked", "history", "pendingRetakes"]) && (detail.history.length === 0 || hasKeys(detail.history[0], ["assignmentId", "exam", "status", "mode", "dueAt", "attempts"])), `history=${detail.history.length}`);
  const exams = await owner.api.exams.list();
  check("exams.list DTO keys", exams.length >= 1 && hasKeys(exams[0], ["id", "title", "book", "questionCount", "passScore", "status", "isRetake", "assignments", "createdAt"]), `n=${exams.length}`);
  const exam = await owner.api.exams.detail(exams[0].id);
  check("exams.detail DTO keys", hasKeys(exam, ["id", "title", "forms", "assignments"]) && (exam.assignments.length === 0 || hasKeys(exam.assignments[0], ["assignmentId", "student", "status", "mode", "dueAt", "latest"])), `assignments=${exam.assignments.length}`);
  const results = await owner.api.results.list({ examId: exams.find((e) => e.assignments > 0)?.id });
  check("results.list(examId) DTO keys", results.length === 0 || hasKeys(results[0], ["attemptId", "student", "exam", "attemptNo", "mode", "score", "passed", "at"]), `n=${results.length}`);
  const dev = await owner.api.devices.register({ token: "ExponentPushToken[test-api-client-0000]", platform: "android" });
  check("devices.register", dev.registered === true);
  // 404 → DaneobangApiError
  try {
    await owner.api.students.detail("nope");
    check("students.detail(unknown) → error", false);
  } catch (e) {
    check("students.detail(unknown) → 404 not_found", e instanceof DaneobangApiError && e.status === 404 && e.code === "not_found");
  }
  // 401 → onUnauthorized
  owner.setToken("bad.token.value");
  try {
    await owner.api.me.get();
    check("bad token → 401", false);
  } catch (e) {
    check("bad token → 401 + onUnauthorized called", e instanceof DaneobangApiError && e.isUnauthorized && owner.unauthorized() === 1);
  }

  // 2. 선생님1: 담당 학생만 (서버 scope 그대로)
  const t1 = await session("tester.t1@daneobang.dev");
  t1.setAcademy(t1.me.memberships[0].academy.id);
  const mine = await t1.api.students.list();
  check("teacher sees only own students (5)", mine.length === 5, `n=${mine.length}`);
  const notMine = students.find((s) => !mine.some((m) => m.id === s.id));
  if (notMine) {
    try {
      await t1.api.students.detail(notMine.id);
      check("teacher cannot open a student outside scope", false);
    } catch (e) {
      check("teacher cannot open a student outside scope (404)", e instanceof DaneobangApiError && e.status === 404);
    }
  }
  // 3. 잘못된 학원 id → 403
  t1.setAcademy("academy_does_not_exist");
  try {
    await t1.api.dashboard.get();
    check("foreign academy id → 403", false);
  } catch (e) {
    check("foreign academy id → 403", e instanceof DaneobangApiError && e.status === 403);
  }
  // 4. 검증 스키마 공유: 잘못된 로그인 body → 422
  try {
    await t1.api.request("POST", "/auth/login", { body: { password: "x" }, academy: false });
    check("login without email/phone → 422", false);
  } catch (e) {
    check("login without email/phone → 422 bad_request (shared zod schema)", e instanceof DaneobangApiError && e.status === 422);
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
