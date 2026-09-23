/* eslint-disable */
// v4.6 온보딩 E2E — 계정 하나·학원과 역할 여러 개.
// 서버가 http://localhost:3000 (E2E_BASE) 에 떠 있어야 하고 메일·문자 업체는 없어야 한다(개발 모드). 소셜 키 없이 돌리기 위해 계정은 DB 에 만들고 /login/email 로 로그인한다.
// 시나리오:
//  1 새 사용자 로그인 → /welcome (학생/선생님)            2 선생님 → 학원 이름 하나로 생성 → /app 온보딩 3단계 + 반 코드
//  3 선생님 초대(이메일) → 초대 링크 → 다른 계정 → [참여] → /app  4 학생 A: 반 코드 + 이름 → 새 학생으로 바로 연결 → /learn (담당 = 반 담당 선생님)
//  5 학생 B: 같은 이름 → 참여 요청 → /learn 확인 대기          6 학원장: 학생 상세 [새 학생으로 추가] → B 연결
//  7 학생 A 가 두 번째 학원(데모 한빛)에도 반 코드로 참여 → /switch 에 학생 자리 2개 → 각 자리의 /learn 이 그 학원만 보여준다
//  8 잘못된 반 코드 6번 → 잠금 메시지                        9 이메일 불일치 초대는 [참여] 실패
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { chromium, type Page, type Browser } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const OUT = path.join(process.cwd(), "fixtures", "e2e", "onboarding");
fs.mkdirSync(OUT, { recursive: true });
let step = 0;
const log = (m: string) => console.log(`[${String(++step).padStart(2, "0")}] ${m}`);
const fail = (m: string): never => {
  throw new Error(m);
};
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const stamp = Date.now().toString(36);
const PW = "test1234";
const ACADEMY = `온보딩학원 ${stamp}`;
const emails = { owner: `own-${stamp}@e2e.test`, teacher: `tch-${stamp}@e2e.test`, other: `oth-${stamp}@e2e.test`, a: `sa-${stamp}@e2e.test`, b: `sb-${stamp}@e2e.test` };

/** 개발 모드 링크는 APP_URL 기준이므로 테스트 서버 주소로 바꾼다 */
const toBase = (u: string) => u.replace(/^https?:\/\/[^/]+/, BASE);

/** 이 실행에서 만든 데이터 정리 (학원·계정) */
async function cleanup() {
  await prisma.academy.deleteMany({ where: { name: ACADEMY } });
  await prisma.student.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
  await prisma.user.deleteMany({ where: { email: { in: [...Object.values(emails), `nobody-${stamp}@e2e.test`] } } });
}

async function mkUser(email: string, name: string) {
  return prisma.user.create({ data: { email, name, provider: "email", passwordHash: await bcrypt.hash(PW, 10), emailVerifiedAt: new Date() } });
}
async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 80)));
  return p;
}
async function login(p: Page, email: string, next?: string) {
  await p.goto(`${BASE}/login/email${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", PW);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle" }), p.click("button:has-text('로그인')")]);
}
async function logout(p: Page) {
  await p.context().clearCookies();
}
async function joinByCode(p: Page, code: string, name: string) {
  await p.goto(`${BASE}/welcome/student`);
  await p.click("[data-testid='join-tab-code']");
  await p.fill("[data-testid='join-code']", code);
  await p.fill("[data-testid='join-name']", name);
  await p.click("[data-testid='join-submit']");
  // 성공하면 바로 /learn 으로 이동하므로 (완료 카드가 잠깐만 보인다) 오류 카드 또는 이동 중 먼저 오는 쪽을 기다린다
  await Promise.race([p.waitForSelector("[data-testid='join-error']", { timeout: 15000 }), p.waitForURL(/\/learn/, { timeout: 15000 })]);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const p = await newPage(browser);
  for (const [k, e] of Object.entries(emails)) await mkUser(e, { owner: "박원장", teacher: "최선생", other: "엉뚱계정", a: "홍길동", b: "홍길동" }[k]!);

  // 1 새 사용자 → /welcome
  await login(p, emails.owner);
  if (!p.url().includes("/welcome")) fail(`new user should land on /welcome, got ${p.url()}`);
  await shot(p, "01-welcome");
  log("새 계정 로그인 → /welcome (학생/선생님 분기)");

  // 2 선생님 → 학원 만들기 (이름 하나) → /app 온보딩 + 반 코드
  await p.click("[data-testid='welcome-teacher']");
  await p.click("[data-testid='welcome-new-academy']");
  await p.fill("[data-testid='academyName']", ACADEMY);
  await Promise.all([p.waitForURL(/\/app$/, { timeout: 20000 }), p.click("[data-testid='create-academy']")]);
  await p.waitForSelector("[data-testid='onboarding']");
  const code = (await p.getAttribute("[data-testid='class-code']", "data-code")) || fail("class code missing");
  if (!/^\d{6}$/.test(code)) fail("class code should be 6 digits");
  const nav = await p.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
  if (nav.some((t) => t.includes("사진 채점"))) fail("scans must not be top-level nav");
  await shot(p, "02-app-onboarding");
  log(`학원 생성(이름 하나) → /app 온보딩 0/3 · 기본 반 코드 ${code} · 메뉴 정리`);

  // 3 선생님 초대 → 링크 → 다른 계정 로그인 → [참여]
  await p.goto(`${BASE}/app/teachers`);
  await p.fill("[data-testid='invite-emails']", emails.teacher);
  await p.click("[data-testid='invite-send']");
  await p.waitForSelector("[data-testid='invite-devlink']");
  const inviteLink = toBase((await p.getAttribute("[data-testid='invite-devlink']", "data-link")) || fail("invite link"));
  await logout(p);
  await p.goto(inviteLink);
  await p.waitForSelector("[data-testid='invite-login']"); // 로그인 전: "로그인하고 참여하기" (소셜 화면으로 가므로 테스트는 이메일 로그인으로 우회)
  await login(p, emails.teacher, new URL(inviteLink).pathname);
  await p.waitForSelector("[data-testid='invite-accept']");
  await Promise.all([p.waitForURL(/\/app$/, { timeout: 20000 }), p.click("[data-testid='invite-submit']")]);
  await shot(p, "03-teacher-joined");
  log("선생님 초대 링크 → 로그인 → [참여] → /app (비밀번호 설정 화면 없음)");
  await logout(p);

  // 4 학생 A: 반 코드 + 이름 → 바로 연결
  await login(p, emails.a);
  if (!p.url().includes("/welcome")) fail("student A should land on /welcome");
  await p.click("[data-testid='welcome-student']");
  await joinByCode(p, code, "홍길동");
  await p.waitForURL(/\/learn/, { timeout: 15000 });
  const headerA = await p.locator("[data-testid='profile-switch']").innerText();
  if (!headerA.includes(ACADEMY)) fail(`learn header should show academy, got ${headerA}`);
  const sa = await prisma.student.findFirstOrThrow({ where: { name: "홍길동", academy: { name: ACADEMY } }, include: { teachers: true, classRoom: true } });
  if (!sa.userId) fail("student A must be linked");
  if (!sa.teachers.length || sa.teachers[0].memberId !== sa.classRoom?.teacherMemberId) fail("student A must be assigned to the class teacher");
  await shot(p, "04-student-a-learn");
  log("학생 A 반 코드 + 이름 → 새 학생으로 즉시 연결 → /learn · 반 담당 선생님이 담당");
  await logout(p);

  // 5 학생 B: 같은 이름 → 참여 요청
  await login(p, emails.b);
  await joinByCode(p, code, "홍길동");
  await p.waitForURL(/\/learn/, { timeout: 15000 });
  if (!(await p.locator("[data-testid='learn-unlinked']").innerText()).includes("확인")) fail("student B should see pending message");
  const req = await prisma.studentLinkRequest.findFirstOrThrow({ where: { studentId: sa.id, status: "pending" } });
  await shot(p, "05-student-b-pending");
  log("학생 B 같은 이름 → 참여 요청 (즉시 연결되지 않음) · /learn 확인 대기");
  await logout(p);

  // 6 학원장: [새 학생으로 추가]
  await login(p, emails.owner);
  await p.goto(`${BASE}/app/students/${sa.id}`);
  await p.waitForSelector("[data-testid='link-requests']");
  await p.click("[data-testid='link-new']");
  await p.waitForTimeout(1500);
  const fresh = await prisma.studentLinkRequest.findUniqueOrThrow({ where: { id: req.id } });
  if (fresh.status !== "approved") fail("request should be approved");
  const sb = await prisma.student.findFirst({ where: { academy: { name: ACADEMY }, user: { email: emails.b } } });
  if (!sb || sb.id === sa.id) fail("student B should be a new student");
  const list = await p.goto(`${BASE}/app/students`).then(() => p.locator("#roster-body").innerText());
  if ((list.match(/홍길동/g) ?? []).length < 2) fail("roster should show two 홍길동");
  await shot(p, "06-owner-approved-new");
  log("학원장 [새 학생으로 추가] → 동명이인 둘 다 명단에 · B 연결됨");
  await logout(p);

  // 7 학생 A 가 데모 학원(한빛)에도 참여 → /switch 자리 2개 → 각 /learn 은 그 학원만
  const hanbit = await prisma.classRoom.findFirst({ where: { academy: { slug: "hanbit" }, joinCode: { not: null } } });
  if (!hanbit) fail("demo academy hanbit with class code required (npm run db:seed)");
  await login(p, emails.a);
  await joinByCode(p, hanbit.joinCode!, "홍길동");
  await p.waitForURL(/\/learn/, { timeout: 15000 });
  await p.goto(`${BASE}/switch`);
  const cards = await p.locator("[data-testid^='ctx-student-']").count();
  if (cards !== 2) fail(`switch should list 2 separate student contexts, got ${cards}`);
  await shot(p, "07-switch-two-students");
  const sa2 = await prisma.student.findFirstOrThrow({ where: { user: { email: emails.a }, academy: { slug: "hanbit" } } });
  await p.click(`[data-testid='ctx-student-${sa2.id}']`);
  await p.waitForURL(/\/learn/);
  const h2 = await p.locator("[data-testid='profile-switch']").innerText();
  if (!h2.includes("한빛") || h2.includes(ACADEMY)) fail(`learn should show only hanbit, got ${h2}`);
  await p.goto(`${BASE}/switch`);
  await p.click(`[data-testid='ctx-student-${sa.id}']`);
  await p.waitForURL(/\/learn/);
  const h1 = await p.locator("[data-testid='profile-switch']").innerText();
  if (!h1.includes(ACADEMY) || h1.includes("한빛")) fail(`learn should show only ${ACADEMY}, got ${h1}`);
  log("학생 A 두 번째 학원 참여 → /switch 학생 자리 2개(학원별) → 각 /learn 은 선택한 학원만");

  // 8 잘못된 반 코드 반복 → 잠금
  let locked = false;
  for (let i = 0; i < 6; i++) {
    await joinByCode(p, "000000", "홍길동");
    const t = await p.locator("[data-testid='join-error']").innerText().catch(() => "");
    if (t.includes("너무 많")) {
      locked = true;
      break;
    }
  }
  if (!locked) fail("rate limit should lock after repeated wrong codes");
  await shot(p, "08-rate-limited");
  log("잘못된 반 코드 5회 → 잠금 메시지");
  await logout(p);

  // 9 초대 이메일과 다른 계정 → 참여 불가
  await login(p, emails.owner);
  await p.goto(`${BASE}/app/teachers`);
  await p.fill("[data-testid='invite-emails']", `nobody-${stamp}@e2e.test`);
  await p.click("[data-testid='invite-send']");
  await p.waitForSelector("[data-testid='invite-devlink']");
  const link2 = toBase((await p.getAttribute("[data-testid='invite-devlink']", "data-link")) || fail("invite link 2"));
  await logout(p);
  await login(p, emails.other);
  await p.goto(link2);
  const body = await p.locator("main").innerText();
  if (!body.includes("전용")) fail("mismatched email should be blocked before accept");
  await shot(p, "09-invite-wrong-email");
  log("초대 이메일과 다른 계정 → 전용 안내 (참여 불가)");

  await browser.close();
  console.log(`\nOK — ${step} steps. screenshots: ${OUT}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    if (process.env.E2E_KEEP !== "1") await cleanup().catch(() => null);
    await prisma.$disconnect();
  });
