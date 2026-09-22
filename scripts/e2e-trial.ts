/* eslint-disable */
// 체험(결제 꺼짐) 가입·학생 휴대폰 인증 E2E. 서버가 BILLING_ENABLED 없이(기본) 떠 있어야 하고 메일·문자 업체는 없어야 한다(개발 모드).
// 시나리오: 랜딩 → /start ① 학원 ② 원장 여부 ③ 계정 → 인증 링크 → 학원 즉시 활성(체험 구독) → 선생님 초대 → 대시보드(요금제 메뉴 없음)
//           → 선생님 초대 수락(비밀번호만) → 학생 등록(휴대폰) → 인증번호(화면 표시) → 학생 /join 가입 → /learn → 휴대폰 로그인
//           → 시험 상세 3단계(단어 점검→응시 대상 추가/제외→마감 변경·zip) → 학생 앱은 오래된 시험부터
import fs from "fs";
import path from "path";
import { chromium, type Page, type Browser } from "playwright";
import { prisma } from "../src/lib/db";
import { logDir } from "../src/lib/logger";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const OUT = path.join(process.cwd(), "fixtures", "e2e", "trial");
fs.mkdirSync(OUT, { recursive: true });
let step = 0;
const log = (m: string) => console.log(`[${String(++step).padStart(2, "0")}] ${m}`);
const fail = (m: string): never => {
  throw new Error(m);
};
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const stamp = Date.now().toString(36);
const OWNER = `owner-${stamp}@e2e.test`;
const T1 = `t1-${stamp}@e2e.test`;
const PHONE = `010${String(Date.now()).slice(-8)}`;
const ACADEMY = `체험영어학원 ${stamp}`;

async function newPage(browser: Browser, w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 80)));
  return p;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const p = await newPage(browser);

  // ── 랜딩 → 학원 시작하기 (① 학원 → ② 원장 여부 → ③ 계정)
  await p.goto(`${BASE}/`);
  if ((await p.locator("main").innerText()).includes("9,900")) fail("landing must not show price when billing is off");
  await p.click("[data-testid='cta-start']");
  await p.waitForSelector("[data-testid='wizard']");
  if ((await p.locator("[data-testid='stepbar'] li").count()) !== 4) fail("trial wizard should have 4 steps");
  await p.fill("[data-testid='academyName']", ACADEMY);
  await p.fill("[data-testid='representativeName']", "김원장");
  await p.click("[data-testid='next']");
  if ((await p.locator("[data-testid='seat-plus']").count()) !== 0) fail("no teacher-count step in trial");
  await shot(p, "01-owner");
  await p.click("[data-testid='next']");
  await p.fill("[data-testid='ownerName']", "김원장");
  await p.fill("[data-testid='email']", OWNER);
  await p.fill("[data-testid='password']", "test1234");
  await p.fill("[data-testid='password2']", "test1234");
  await shot(p, "02-account");
  await p.click("[data-testid='create-account']");
  await p.waitForSelector("[data-testid='dev-verify-link']", { timeout: 20000 });
  log("랜딩 → 위저드 3단계(선생님 수·결제 없음) → 인증 대기");

  // ── 인증 → 학원 즉시 활성 + 체험 구독 → 초대 단계
  await p.click("[data-testid='dev-verify-link']");
  await p.waitForSelector("[data-testid='invite-step']", { timeout: 30000 });
  const academy = await prisma.academy.findFirst({ where: { name: ACADEMY }, include: { subscription: true, members: true } });
  if (!academy || academy.status !== "active" || academy.plan !== "trial") fail("academy should be active trial after verify");
  if (academy.subscription?.provider !== "trial" || academy.subscription.status !== "active") fail("trial subscription expected");
  if ((await p.locator("[data-testid='pay-step']").count()) !== 0) fail("no payment step in trial");
  await shot(p, "03-invite");
  await p.fill("[data-testid='invite-email-0']", T1);
  await p.click("[data-testid='send-invites']");
  await p.waitForSelector("[data-testid='invite-sent']", { timeout: 15000 });
  await p.click("[data-testid='finish']");
  await p.waitForURL(/\/app$/, { timeout: 20000 });
  const nav = await p.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
  if (nav.some((t) => t.includes("요금제"))) fail("billing menu must be hidden in trial");
  await p.goto(`${BASE}/app/billing`);
  if (!(await p.locator("main").innerText()).includes("체험 기간")) fail("billing page should show trial notice");
  log("인증 → 학원 active(체험 구독) → 선생님 초대 → 대시보드 · 요금제 메뉴 없음");

  // ── 선생님 초대 수락
  const mailLog = fs.readFileSync(path.join(logDir(), "mail.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const link = [...mailLog].reverse().find((m) => m.to === T1 && m.link)?.link as string;
  const t1 = await newPage(browser);
  await t1.goto(link);
  await t1.waitForSelector("[data-testid='invite-accept']");
  await t1.fill("[data-testid='invite-name']", "오유진");
  await t1.fill("[data-testid='invite-password']", "test1234");
  await t1.fill("[data-testid='invite-password2']", "test1234");
  await t1.click("[data-testid='invite-submit']");
  await t1.waitForURL(/\/app$/, { timeout: 60000 });
  log("선생님 초대 수락(비밀번호만) → 대시보드");

  // ── 학생 등록(휴대폰) → 인증번호 → 학생 가입(/join) → /learn
  await p.goto(`${BASE}/app/students`);
  await p.fill('form:has(input[name="school"]) input[name="name"]', "김철수");
  await p.fill('form:has(input[name="school"]) input[name="school"]', "중앙고");
  await p.fill('form:has(input[name="school"]) input[name="grade"]', "고1");
  await p.fill('form:has(input[name="school"]) input[name="phone"]', PHONE);
  await p.click('form:has(input[name="school"]) button:has-text("등록")');
  await p.waitForSelector("#roster-body tr:has-text('김철수')", { timeout: 15000 });
  // 명단에서 체크 → 인증번호 보내기 (문자 업체 없음 → 화면에 표시)
  await p.locator("#roster-body tr", { hasText: "김철수" }).locator("input[type=checkbox]").check();
  await p.click("[data-testid='bulk-send-codes']");
  await p.waitForSelector("[data-testid='code-results']", { timeout: 15000 });
  const codeText = await p.locator("[data-testid='code-results'] li", { hasText: "김철수" }).innerText();
  const code = codeText.match(/\b(\d{6})\b/)?.[1];
  if (!code) fail("dev code should be shown: " + codeText);
  await shot(p, "04-codes");
  await p.reload();
  if (!(await p.locator("#roster-body tr", { hasText: "김철수" }).innerText()).includes("INVITED")) fail("student should be INVITED after code");
  log(`학생 등록(휴대폰) → 인증번호 ${code} 화면 표시 · INVITED`);

  const s1 = await newPage(browser, 420);
  await s1.goto(`${BASE}/join`);
  await s1.fill("[data-testid='join-phone']", PHONE);
  await s1.fill("[data-testid='join-code']", "000000");
  await s1.fill("[data-testid='join-password']", "test1234");
  await s1.fill("[data-testid='join-password2']", "test1234");
  await s1.click("[data-testid='join-submit']");
  await s1.waitForSelector("[data-testid='join-error']", { timeout: 15000 });
  await s1.fill("[data-testid='join-code']", code!);
  await shot(s1, "05-join");
  await s1.click("[data-testid='join-submit']");
  await s1.waitForURL(/\/learn$/, { timeout: 30000 });
  const stu = await prisma.student.findFirst({ where: { academyId: academy.id, name: "김철수" }, include: { user: true } });
  if (!stu?.user || stu.user.phone !== PHONE || stu.phoneCodeHash) fail("student should be linked by phone and code cleared");
  await shot(s1, "06-learn");
  // 휴대폰 로그인 (새 브라우저)
  const s1b = await newPage(browser, 420);
  await s1b.goto(`${BASE}/login`);
  await s1b.fill('input[name="email"]', PHONE);
  await s1b.fill('input[name="password"]', "test1234");
  await s1b.click('button:has-text("로그인")');
  await s1b.waitForURL(/\/learn/, { timeout: 20000 });
  log("학생 /join: 틀린 인증번호 거절 → 맞는 번호로 가입 → /learn · 휴대폰 번호 로그인");

  // ── 시험 상세 3단계 (테스트학원 선생님1 계정으로: 데이터가 있는 학원)
  const t = await newPage(browser);
  await t.goto(`${BASE}/login`);
  await t.fill('input[name="email"]', "tester.t1@daneobang.dev");
  await t.fill('input[name="password"]', "test1234");
  await t.click('button:has-text("로그인")');
  await t.waitForURL(/\/app/);
  const exam = await prisma.exam.findFirst({ where: { academy: { slug: "tester" }, status: "published", isRetake: false, assignments: { some: {} } }, orderBy: { createdAt: "desc" } });
  if (!exam) fail("no published exam in tester academy");
  await t.goto(`${BASE}/app/tests/${exam.id}`);
  await t.waitForSelector("[data-testid='exam-detail']");
  const step0 = await t.locator("[data-testid='exam-detail']").getAttribute("data-step");
  if (step0 !== "3") fail("published+assigned exam should open at step 3, got " + step0);
  await t.click("[data-testid='exam-step-1']");
  await t.waitForSelector("[data-testid='step-items']");
  await t.click("[data-testid='step-next']");
  await t.waitForSelector("[data-testid='step-targets']");
  const before = await t.locator("[data-testid='target-row']").count();
  // 대상 추가: 개별 학생 1명 (B반)
  await t.click("[data-testid='assign-toggle-list']");
  const firstFree = t.locator("[data-testid='assign-panel'] label input[name='studentIds']").first();
  if (await firstFree.count()) {
    await firstFree.check();
    await t.click("[data-testid='assign-add']");
    await t.waitForFunction((n) => document.querySelectorAll("[data-testid='target-row']").length === n + 1, before, { timeout: 15000 });
    // 방금 추가한(아직 시작 안 한) 학생 제외
    await t.locator("[data-testid='target-row']").filter({ has: t.locator("[data-testid='target-remove']") }).last().locator("[data-testid='target-remove']").click();
    await t.waitForFunction((n) => document.querySelectorAll("[data-testid='target-row']").length === n, before, { timeout: 15000 });
  }
  await shot(t, "07-exam-targets");
  await t.click("[data-testid='step-next']");
  await t.waitForSelector("[data-testid='step-run']");
  // 마감 변경 (안 친 학생 전체)
  const newDue = new Date(Date.now() + 5 * 86400e3 + 9 * 3600e3).toISOString().slice(0, 16);
  await t.fill("[data-testid='due-input']", newDue);
  await t.click("[data-testid='due-apply']");
  await t.waitForSelector("text=마감을", { timeout: 15000 });
  const openAssign = await prisma.assignment.findFirst({ where: { examId: exam.id, status: { in: ["assigned", "in_progress"] } } });
  if (openAssign && Math.abs(openAssign.dueAt!.getTime() - (new Date(newDue + ":00+09:00").getTime())) > 60000) fail("due date not applied: " + openAssign.dueAt);
  if (!(await t.locator("[data-testid='link-results']").count())) fail("results link missing");
  await shot(t, "08-exam-run");
  log("시험 상세 3단계: 단어 점검 → 응시 대상 추가·제외 → 출제·진행(마감 변경·성적 링크)");

  // ── 학생 앱: 안 친 시험이 오래된 순 (테스터 학생01)
  const s = await newPage(browser, 420);
  await s.goto(`${BASE}/login`);
  await s.fill('input[name="email"]', "tester.s01@daneobang.dev");
  await s.fill('input[name="password"]', "test1234");
  await s.click('button:has-text("로그인")');
  await s.waitForURL(/\/learn/);
  const titles = await s.locator("main .pill .truncate, main .card-accent .text-\\[20px\\]").allInnerTexts();
  const s01 = await prisma.student.findFirst({ where: { name: "테스터 학생01", academy: { slug: "tester" } } });
  const open = await prisma.assignment.findMany({ where: { studentId: s01!.id, status: { in: ["assigned", "in_progress"] }, exam: { status: "published" }, OR: [{ dueAt: null }, { dueAt: { gte: new Date() } }] }, include: { exam: true }, orderBy: { createdAt: "asc" } });
  if (open.length >= 2 && titles.length >= 2 && titles[0] !== open[0].exam.title) fail(`student home should start with oldest open exam: got "${titles[0]}", expected "${open[0].exam.title}"`);
  await shot(s, "09-student-order");
  log("학생 앱: 안 친 시험이 출제 순서(옛날 → 현재)로");

  await browser.close();
  await prisma.$disconnect();
  console.log("\nE2E-TRIAL RESULT: PASS");
}

main().catch(async (e) => {
  console.error("\nE2E-TRIAL RESULT: FAIL —", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
