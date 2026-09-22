/* eslint-disable */
// B2B 가입·Seat 과금 E2E (Playwright). 서버가 떠 있어야 하고 메일 서버는 없어야 한다(개발 모드: 링크가 화면에 보임).
// 시나리오: 랜딩 → /start ①~④ → 인증 링크 → ⑤ 결제 실패(0000) → 결제 성공 → ⑥ 선생님 초대 2명 → 대시보드
//           → 선생님 초대 수락(비밀번호만) → Seat 2/3 → 초대 초과 거절 → 접근 중지 → Seat 줄이기 한도 → 선생님 수 늘리기
//           → 원장 선생님 기능 끄기/켜기 → 학생 등록(이메일) → 계정 설정 링크 → 학생 비밀번호 설정 → /learn
//           → 결제 전 학원은 기능 잠금(선생님 화면 안내) → 관리자 화면에 구독 표시
import fs from "fs";
import path from "path";
import { chromium, type Page, type Browser } from "playwright";
import { prisma } from "../src/lib/db";
import { logDir } from "../src/lib/logger";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const OUT = path.join(process.cwd(), "fixtures", "e2e", "signup");
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
const T2 = `t2-${stamp}@e2e.test`;
const T3 = `t3-${stamp}@e2e.test`;
const STU = `stu-${stamp}@e2e.test`;
const ACADEMY = `E2E영어학원 ${stamp}`;

async function newPage(browser: Browser, w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 80)));
  return p;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const p = await newPage(browser);

  // ── 랜딩 → 학원 시작하기
  await p.goto(`${BASE}/`);
  await p.click("[data-testid='cta-start']");
  await p.waitForURL(/\/start$/);
  await p.waitForSelector("[data-testid='wizard']");
  log("landing CTA → /start");

  // ── ① 학원 정보
  await p.fill("[data-testid='academyName']", ACADEMY);
  await p.fill("[data-testid='representativeName']", "김원장");
  await shot(p, "01-academy-info");
  await p.click("[data-testid='next']");
  // ── ② 선생님 수: 3명 → 월 29,700원
  await p.click("[data-testid='seat-plus']");
  await p.click("[data-testid='seat-plus']");
  if ((await p.locator("[data-testid='teacherCount']").innerText()).trim() !== "3") fail("teacherCount should be 3");
  if (!(await p.locator("[data-testid='monthly']").innerText()).includes("29,700")) fail("monthly should be 29,700");
  await shot(p, "02-teacher-count");
  await p.click("[data-testid='next']");
  // ── ③ 원장도 수업함 (기본 yes)
  if ((await p.locator("[data-testid='owner-yes']").getAttribute("aria-checked")) !== "true") fail("owner default should be yes");
  await shot(p, "03-owner-teacher");
  await p.click("[data-testid='next']");
  // ── ④ 계정
  await p.fill("[data-testid='ownerName']", "김원장");
  await p.fill("[data-testid='email']", OWNER);
  await p.fill("[data-testid='password']", "test1234");
  await p.fill("[data-testid='password2']", "test1234");
  await shot(p, "04-account");
  await p.click("[data-testid='create-account']");
  await p.waitForSelector("[data-testid='verify-step']", { timeout: 20000 });
  const devLink = p.locator("[data-testid='dev-verify-link']");
  if (!(await devLink.count())) fail("dev verify link should be shown (no SMTP)");
  await shot(p, "05-verify");
  log("wizard ①~④ → 인증 대기 (개발 모드 링크 표시)");
  // 세션에 학원이 아직 없어야 한다
  if (await prisma.academy.findFirst({ where: { name: ACADEMY } })) fail("academy must not exist before verification");

  // ── 인증 링크 → 계정·학원(결제 대기) 생성 → ⑤ 결제
  await devLink.click();
  await p.waitForURL(/\/start(\?.*)?$/, { timeout: 20000 });
  await p.waitForSelector("[data-testid='pay-step']", { timeout: 20000 });
  const academy = await prisma.academy.findFirst({ where: { name: ACADEMY }, include: { subscription: true, members: true } });
  if (!academy || academy.status !== "pending_payment") fail("academy should be pending_payment after verify");
  if (academy.subscription?.seatQuantity !== 3 || academy.subscription.status !== "pending") fail("subscription should be pending with 3 seats");
  if (academy.members[0].role !== "OWNER" || !academy.members[0].isTeacher) fail("owner membership should be OWNER + teacher");
  if (!(await p.locator("[data-testid='pay-amount']").innerText()).includes("29,700")) fail("pay amount should be 29,700");
  log("인증 → 학원(결제 대기) · 구독(pending, 3 seats) · OWNER+TEACHER 생성");

  // 결제 전 기능 잠금: /app → /app/billing 으로
  await p.goto(`${BASE}/app/students`);
  await p.waitForURL(/\/app\/billing/, { timeout: 15000 });
  log("결제 전 /app/* → /app/billing 리다이렉트");
  await p.goto(`${BASE}/start`);
  await p.waitForSelector("[data-testid='pay-step']");

  // ── ⑤ 결제 실패(0000) → 재시도 성공
  await p.fill("[data-testid='card-number']", "4242 4242 4242 0000");
  await p.click("[data-testid='pay']");
  await p.waitForSelector("[data-testid='pay-error']", { timeout: 15000 });
  await shot(p, "06-pay-failed");
  if ((await prisma.academy.findUnique({ where: { id: academy.id } }))!.status !== "pending_payment") fail("failed payment must keep pending_payment");
  await p.fill("[data-testid='card-number']", "4242 4242 4242 4242");
  await p.click("[data-testid='pay']");
  await p.waitForSelector("[data-testid='invite-step']", { timeout: 20000 });
  const after = await prisma.academy.findUnique({ where: { id: academy.id }, include: { subscription: { include: { payments: true } } } });
  if (after!.status !== "active" || after!.subscription!.status !== "active") fail("academy/subscription should be active after payment");
  if (after!.subscription!.payments.filter((x) => x.status === "succeeded").length !== 1 || after!.subscription!.payments.filter((x) => x.status === "failed").length !== 1) fail("payments should be 1 failed + 1 succeeded");
  if (!(await p.locator("[data-testid='seat-usage']").innerText()).includes("1 / 3")) fail("seat usage should be 1 / 3 (owner is teacher)");
  await shot(p, "07-paid-invite");
  log("결제 실패(0000) → 성공 · Academy/Subscription ACTIVE · 결제 내역 2건 · Seat 1/3");

  // ── ⑥ 선생님 2명 초대 (남은 자리 2)
  await p.fill("[data-testid='invite-email-0']", T1);
  await p.fill("[data-testid='invite-email-1']", T2);
  await p.click("[data-testid='send-invites']");
  await p.waitForSelector("[data-testid='invite-sent']", { timeout: 15000 });
  const invites = await prisma.invitation.findMany({ where: { academyId: academy.id, usedAt: null }, orderBy: { createdAt: "asc" } });
  if (invites.length !== 2) fail("2 pending invitations expected, got " + invites.length);
  await shot(p, "08-invited");
  await p.click("[data-testid='finish']");
  await p.waitForURL(/\/app$/, { timeout: 20000 });
  log("선생님 2명 초대(pending, Seat 예약) → 대시보드");

  // 요금제 화면: 1/3 사용 · 초대 대기 2 → 추가 가능 0 → Seat 줄이기 불가
  await p.goto(`${BASE}/app/billing`);
  await p.waitForSelector("[data-testid='seat-control']");
  if (!(await p.locator("[data-testid='seat-usage']").innerText()).replace(/\s/g, "").includes("1/3")) fail("billing seat usage 1/3 expected");
  await p.click("[data-testid='seat-minus']");
  if (!(await p.locator("[data-testid='seat-apply']").isDisabled())) fail("cannot reduce seats below used+pending");
  await shot(p, "09-billing");
  log("요금제: 1/3 사용 + 초대 대기 2 → 줄이기 잠김");

  // 초대 링크 확보 (mail.log 대신 DB 토큰은 해시라 화면의 dev 링크를 쓴다) → 선생님 화면에서 발급된 링크 사용
  await p.goto(`${BASE}/app/teachers`);
  await p.waitForSelector("[data-testid='seat-summary']");
  if ((await p.locator("[data-testid='pending-invite']").count()) !== 2) fail("teachers page should list 2 pending invites");
  // 초대 초과: 자리가 없으면 초대 입력이 잠기고 '선생님 수 늘리기' 로 안내. 서버도 거절하는지 API 로 확인
  if (!(await p.locator("[data-testid='invite-emails']").isDisabled())) fail("invite box should be disabled when no seat is available");
  if (!(await p.locator("a[href='/app/billing']", { hasText: "선생님 수 늘리기" }).count())) fail("teachers page should link to billing when full");
  const over = await p.evaluate(async (email) => {
    // 서버 액션은 직접 호출할 수 없으므로 폼을 강제로 활성화해 제출해 본다
    const ta = document.querySelector("[data-testid='invite-emails']") as HTMLTextAreaElement;
    ta.disabled = false;
    ta.value = email;
    (document.querySelector("[data-testid='invite-send']") as HTMLButtonElement).disabled = false;
    (document.querySelector("[data-testid='invite-send']") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 2500));
    return document.body.innerText;
  }, T3);
  if (!over.includes("사용 가능한 선생님 자리가 0명")) fail("server should reject invite beyond seats");
  if ((await prisma.invitation.count({ where: { academyId: academy.id, email: T3 } })) !== 0) fail("no invitation should be created beyond seats");
  await shot(p, "10-teachers-full");
  log("자리 초과 초대: 입력 잠김 + 서버 거절 (현재 Seat + Pending ≥ 구매 Seat)");

  // ── 선생님1 초대 수락: 새 브라우저, 비밀번호만 설정
  const mailLog = fs.readFileSync(path.join(logDir(), "mail.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const linkFor = (email: string) => [...mailLog].reverse().find((m) => m.to === email && m.link)?.link as string;
  const t1 = await newPage(browser);
  await t1.goto(linkFor(T1));
  await t1.waitForSelector("[data-testid='invite-accept']");
  await t1.fill("[data-testid='invite-name']", "오유진");
  await t1.fill("[data-testid='invite-password']", "test1234");
  await t1.fill("[data-testid='invite-password2']", "test1234");
  await shot(t1, "11-teacher-invite");
  await t1.click("[data-testid='invite-submit']");
  try {
    await t1.waitForURL(/\/app$/, { timeout: 60000 });
  } catch (e) {
    await shot(t1, "11b-teacher-invite-stuck");
    console.log("  stuck at", t1.url(), (await t1.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
    throw e;
  }
  const m1 = await prisma.academyMember.findFirst({ where: { academyId: academy.id, user: { email: T1 } } });
  if (!m1 || m1.status !== "active" || !m1.isTeacher) fail("teacher membership should be active teacher");
  const usage1 = { used: await prisma.academyMember.count({ where: { academyId: academy.id, status: "active", isTeacher: true } }), pending: await prisma.invitation.count({ where: { academyId: academy.id, usedAt: null, revokedAt: null } }) };
  if (usage1.used !== 2 || usage1.pending !== 1) fail(`seat usage after accept should be used 2 / pending 1, got ${JSON.stringify(usage1)}`);
  await shot(t1, "12-teacher-dashboard");
  log("선생님1 초대 수락(비밀번호만) → 로그인·대시보드 · Seat used 2 / pending 1");

  // 같은 링크 재사용 불가
  const t1b = await newPage(browser);
  await t1b.goto(linkFor(T1));
  if (!(await t1b.locator("text=이미 수락한 초대").count())) fail("used invite should be rejected");
  await t1b.context().close();

  // ── 접근 중지 → Seat 비움 → 초대 취소 → Seat 줄이기 가능
  await p.goto(`${BASE}/app/teachers`);
  await p.waitForSelector("tr[data-member-status='active']:has-text('오유진')", { timeout: 15000 });
  p.once("dialog", (d) => d.accept());
  await p.locator("tr[data-member-status='active']", { hasText: "오유진" }).locator("button:has-text('접근 중지')").click();
  await p.waitForSelector("tr[data-member-status='disabled']", { hasText: "오유진" });
  await p.locator("[data-testid='pending-invite']", { hasText: T2 }).locator("button:has-text('취소')").click();
  await p.waitForFunction(() => document.querySelectorAll("[data-testid='pending-invite']").length === 0, null, { timeout: 10000 });
  log("접근 중지(DISABLED) + 초대 취소 → 자리 2개 비움 (구매 Seat 3 유지)");
  await p.goto(`${BASE}/app/billing`);
  await p.waitForSelector("[data-testid='seat-control']");
  await p.click("[data-testid='seat-minus']");
  await p.click("[data-testid='seat-minus']");
  if (!(await p.locator("[data-testid='seat-preview']").innerText()).includes("9,900")) fail("preview should be 9,900 for 1 seat");
  await p.click("[data-testid='seat-apply']");
  await p.waitForFunction(() => document.querySelector("[data-testid='monthly']")?.textContent?.includes("9,900"), null, { timeout: 15000 });
  if ((await prisma.subscription.findUnique({ where: { academyId: academy.id } }))!.seatQuantity !== 1) fail("seat quantity should be 1");
  // 선생님 기능 끄기 → 0/1, 켜기 → 1/1, 자리 없을 때 '1명 추가하고 사용하기'
  p.once("dialog", (d) => d.accept());
  await p.click("button:has-text('선생님 기능 끄기')");
  await p.waitForSelector("button:has-text('선생님 기능 사용')", { timeout: 15000 });
  if ((await prisma.academyMember.findFirst({ where: { academyId: academy.id, role: "OWNER" } }))!.isTeacher) fail("owner isTeacher should be false");
  await p.click("button:has-text('선생님 기능 사용')");
  await p.waitForSelector("button:has-text('선생님 기능 끄기')", { timeout: 15000 });
  await p.click("[data-testid='seat-plus']");
  await p.click("[data-testid='seat-apply']");
  await p.waitForFunction(() => document.querySelector("[data-testid='monthly']")?.textContent?.includes("19,800"), null, { timeout: 15000 });
  await shot(p, "13-billing-changed");
  log("Seat 3→1 (9,900원) · 원장 선생님 기능 끄기/켜기 · Seat 1→2 (19,800원)");

  // ── 학생 등록(이메일) → 계정 설정 링크 → 학생이 비밀번호만 설정 → /learn
  await p.goto(`${BASE}/app/students`);
  await p.fill('form:has(input[name="school"]) input[name="name"]', "김철수");
  await p.fill('form:has(input[name="school"]) input[name="school"]', "중앙고");
  await p.fill('form:has(input[name="school"]) input[name="grade"]', "고1");
  await p.fill('form:has(input[name="school"]) input[name="email"]', STU);
  await p.click('form:has(input[name="school"]) button:has-text("등록")');
  await p.waitForSelector("#roster-body tr:has-text('김철수')", { timeout: 15000 });
  if (!(await p.locator("#roster-body tr", { hasText: "김철수" }).innerText()).includes("REGISTERED")) fail("new student should be REGISTERED");
  await p.locator("#roster-body a", { hasText: "김철수" }).first().click();
  await p.waitForURL(/\/app\/students\/[a-z0-9]+/);
  await p.click("button:has-text('계정 설정 링크 보내기')");
  await p.waitForSelector("[data-testid='student-invite-url']", { timeout: 15000 });
  const stuLink = await p.locator("[data-testid='student-invite-url'] input").inputValue();
  await shot(p, "14-student-invite");
  const s1 = await newPage(browser, 420);
  await s1.goto(stuLink);
  await s1.waitForSelector("[data-testid='student-activate']");
  if ((await s1.locator("[data-testid='activate-email']").inputValue()) !== STU) fail("student email should be prefilled");
  await s1.fill("[data-testid='activate-password']", "test1234");
  await s1.fill("[data-testid='activate-password2']", "test1234");
  await shot(s1, "15-student-activate");
  await s1.click("[data-testid='activate-submit']");
  await s1.waitForURL(/\/learn$/, { timeout: 20000 });
  const stu = await prisma.student.findFirst({ where: { academyId: academy.id, name: "김철수" }, include: { user: true } });
  if (!stu?.user || stu.user.email !== STU || stu.inviteTokenHash) fail("student should be linked to a new user and token cleared");
  await shot(s1, "16-student-home");
  log("학생 등록 → 계정 설정 링크 → 비밀번호만 설정 → /learn (승인 불필요)");
  await p.reload();
  await p.waitForSelector("[data-account-state='active']", { timeout: 15000 });

  // ── 관리자: 구독 표시
  const ap = await newPage(browser);
  await ap.goto(`${BASE}/login`);
  await ap.fill('input[name="email"]', "admin@daneobang.dev");
  await ap.fill('input[name="password"]', "password");
  await ap.click('button:has-text("로그인")');
  await ap.waitForURL((u) => !u.pathname.startsWith("/login"));
  await ap.goto(`${BASE}/admin/academies`);
  const row = ap.locator("tr", { hasText: ACADEMY });
  if (!(await row.innerText()).includes("선생님 2명")) fail("admin should show 2-seat subscription");
  log("관리자 학원 목록에 구독(선생님 2명 · 월 19,800원) 표시");

  // ── 공개 회원가입 없음: /signup → /start, /workspaces/new → /start
  const r1 = await ap.goto(`${BASE}/signup`);
  if (!r1!.url().endsWith("/start")) fail("/signup should redirect to /start");
  const r2 = await ap.goto(`${BASE}/workspaces/new`);
  if (!r2!.url().endsWith("/start")) fail("/workspaces/new should redirect to /start");
  log("공개 회원가입 없음 (/signup, /workspaces/new → /start)");

  await browser.close();
  await prisma.$disconnect();
  console.log("\nE2E-SIGNUP RESULT: PASS");
}

main().catch(async (e) => {
  console.error("\nE2E-SIGNUP RESULT: FAIL —", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
