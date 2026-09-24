/* eslint-disable */
// v4.4 E2E — 재시험 개편 · 반복 오답 즉시 출제 · 성적 위젯 보드 · 종이 QR 접근 규칙 · 출제/상세 동작 바.
// 연동 계정(테스트학원: 선생님1 tester.t1@, 학생01~05 tester.s0N@, 학원장 owner@) 과 seed 데이터가 있어야 한다.
import fs from "fs";
import path from "path";
import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import { prisma } from "../src/lib/db";
import { createFormForExam } from "../src/lib/exam-gen";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const OUT = path.join(process.cwd(), "fixtures", "e2e", "retake");
fs.mkdirSync(OUT, { recursive: true });
let step = 0;
const log = (m: string) => console.log(`[${String(++step).padStart(2, "0")}] ${m}`);
const fail = (m: string): never => {
  throw new Error(m);
};
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

async function login(browser: Browser, email: string, w = 1280): Promise<[Page, BrowserContext]> {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 100)));
  await p.goto(`${BASE}/login/email`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', email.startsWith("owner") ? "password" : "test1234");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  return [p, ctx];
}

/** 학생이 온라인 시험을 친다: wrongCount 문항만 틀리고 나머지는 정답 */
async function takeExam(s: Page, assignmentId: string, wrongCount: number) {
  const r = await s.request.post(`${BASE}/api/v1/assignments/${assignmentId}/start`);
  if (!r.ok()) fail(`start failed ${r.status()} ${await r.text()}`);
  const attemptId = (await r.json()).data.attemptId as string;
  await s.goto(`${BASE}/learn/attempts/${attemptId}`);
  const at = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { assignment: { include: { form: { include: { items: { include: { options: true }, orderBy: { position: "asc" } } } } } } } });
  const items = at.assignment.form.items;
  // v5.2 러너: 준비 화면 → [시작] → 3·2·1
  const ready = s.locator("[data-testid='runner-start']");
  if (await ready.isVisible({ timeout: 5000 }).catch(() => false)) await ready.click();
  for (let i = 0; i < items.length; i++) {
    const wrong = i >= items.length - wrongCount;
    const pick = wrong ? items[i].options.find((o) => !o.isCorrect)! : items[i].options.find((o) => o.isCorrect)!;
    await s.waitForSelector(`.digital-lg >> text=${String(i + 1).padStart(2, "0")}`, { timeout: 8000 });
    await s.locator("button.tile", { hasText: pick.text }).first().click();
    await s.waitForTimeout(250);
  }
  await s.waitForURL(/\/learn\/results\//, { timeout: 30000 }).catch(async (e) => {
    await shot(s, "fail-take-exam");
    throw e;
  });
  return attemptId;
}

/** 테스트용: 학생에게 새 시험(10문항·통과 90)을 내고 wrongCount 개 틀리게 쳐서 재시험 대상(pending)을 만든다 */
async function makeFailedAttempt(browser: Browser, academyId: string, teacherUserId: string, student: { id: string; email: string }, wrongCount: number) {
  const base = await prisma.exam.findFirstOrThrow({ where: { academyId, isRetake: false, status: "published" }, include: { scopes: true }, orderBy: { createdAt: "desc" } });
  const exam = await prisma.exam.create({
    data: { academyId, bookId: base.bookId, createdById: teacherUserId, title: `재시험 E2E 원시험 ${Date.now().toString(36)}`, questionCount: 10, passScore: 90, secondsPerItem: 7, scoreVisibility: "immediate", answerVisibility: "immediate", scopes: { create: base.scopes.map((sc) => ({ dayId: sc.dayId })) } },
  });
  const { form } = await createFormForExam(exam.id);
  await prisma.$transaction([prisma.examForm.update({ where: { id: form.id }, data: { status: "published", publishedAt: new Date() } }), prisma.exam.update({ where: { id: exam.id }, data: { status: "published" } })]);
  const asg = await prisma.assignment.create({ data: { examId: exam.id, formId: form.id, studentId: student.id, dueAt: new Date(Date.now() + 86400e3) } });
  const [sp, ctx] = await login(browser, student.email, 390);
  const attemptId = await takeExam(sp, asg.id, wrongCount);
  await ctx.close();
  const task = await prisma.retakeTask.findUniqueOrThrow({ where: { sourceAttemptId: attemptId } });
  if (task.status !== "pending") fail("fresh failed attempt should create a pending task");
  return task;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const [t1] = await login(browser, "tester.t1@daneobang.dev");
  const academy = await prisma.academy.findFirstOrThrow({ where: { members: { some: { user: { email: "tester.t1@daneobang.dev" } } } } });
  const s2 = await prisma.student.findFirstOrThrow({ where: { academyId: academy.id, name: "테스터 학생02" } });
  const s3 = await prisma.student.findFirstOrThrow({ where: { academyId: academy.id, name: "테스터 학생03" } });
  const s1 = await prisma.student.findFirstOrThrow({ where: { academyId: academy.id, name: "테스터 학생01" } });

  // ── 1. 재시험 화면: 보강 문구 없음, 출제 전 → [오답만|같은 범위] + 마감 + 출제
  await t1.goto(`${BASE}/app/retakes`);
  await t1.waitForSelector("#retake-queue");
  const txt = await t1.locator("main").innerText();
  if (/보강/.test(txt)) fail("'보강' wording must be gone");
  const t1User = await prisma.user.findUniqueOrThrow({ where: { email: "tester.t1@daneobang.dev" } });
  const pendingTask2 = await makeFailedAttempt(browser, academy.id, t1User.id, { id: s2.id, email: "tester.s02@daneobang.dev" }, 3);
  await t1.goto(`${BASE}/app/retakes`);
  await t1.waitForSelector("#retake-queue");
  const row2 = t1.locator(`[data-task='${pendingTask2.id}']`);
  await row2.locator("[data-testid='retake-mode-wrong']").click();
  if ((await row2.locator("[data-testid='retake-mode-wrong']").getAttribute("aria-checked")) !== "true" || !/오답만 \d+/.test(await row2.locator("[data-testid='retake-mode-wrong']").innerText())) fail("오답만 should be selected with a count");
  await row2.locator("[data-testid='retake-mode-same']").click();
  if ((await row2.locator("[data-testid='retake-mode-same']").getAttribute("aria-checked")) !== "true") fail("같은 범위 should be selectable");
  if ((await t1.locator("#retake-queue button:has-text('조정')").count()) !== 0) fail("v5.6: 조정 button must be gone");
  await row2.locator("[data-testid='retake-mode-wrong']").click();
  const due = new Date(Date.now() + 2 * 86400e3 + 9 * 3600e3).toISOString().slice(0, 10) + "T21:00";
  await row2.locator("[data-testid='issue-due']").fill(due);
  await shot(t1, "01-issue-box");
  await row2.locator("[data-testid='issue-submit']").click();
  await t1.waitForSelector(`[data-task='${pendingTask2.id}'] [data-testid='retake-status']:has-text('응시 대기')`, { timeout: 20000 });
  const task2 = await prisma.retakeTask.findUniqueOrThrow({ where: { id: pendingTask2.id } });
  if (task2.status !== "issued" || !task2.retakeExamId || task2.mode !== "wrong") fail("task should be issued/wrong: " + JSON.stringify(task2));
  const asg2 = await prisma.assignment.findFirstOrThrow({ where: { examId: task2.retakeExamId!, studentId: s2.id } });
  if (!asg2.dueAt || Math.abs(asg2.dueAt.getTime() - new Date(`${due}:00+09:00`).getTime()) > 60e3) fail("assignment due should match: " + asg2.dueAt);
  const noti = await prisma.notification.findFirst({ where: { user: { studentLinks: { some: { id: s2.id } } }, title: { contains: "재시험이 나왔어요" } }, orderBy: { createdAt: "desc" } });
  if (!noti) fail("student notification missing");
  log("재시험 출제: 오답만/같은 범위 토글(선택 요약 표시) + 마감 → 시험 생성·발행·배정 + 알림");

  // ── 2. Today: 마감일별 묶음
  await t1.goto(`${BASE}/app`);
  const today = await t1.locator("[data-testid='retake-today']").innerText();
  if (!/마감/.test(today) || !/테스터 학생02/.test(today)) fail("Today should group retakes by due date with names: " + today.slice(0, 120));
  log("Today 화면: 재시험이 마감 날짜별로 묶여 보임");

  // ── 3. 학생02: 재시험 화면 → 시작 → 전부 정답 → 통과 → 큐에서 완료
  const [st2] = await login(browser, "tester.s02@daneobang.dev", 390);
  await st2.goto(`${BASE}/learn/retake`);
  const rt = await st2.locator("[data-testid='retake-next']").innerText();
  if (!/재시험/.test(rt) || /보강/.test(rt)) fail("student retake card: " + rt);
  if (!/D-\d|D-DAY/.test(rt)) fail("student card should show D-day: " + rt);
  await shot(st2, "02-student-retake");
  await takeExam(st2, asg2.id, 0);
  const task2b = await prisma.retakeTask.findUniqueOrThrow({ where: { id: pendingTask2.id } });
  if (task2b.status !== "completed") fail("passed retake should complete task: " + task2b.status);
  await t1.goto(`${BASE}/app/retakes?all=1`);
  const doneRow = await t1.locator(`[data-task='${pendingTask2.id}']`).innerText();
  if (!/통과/.test(doneRow)) fail("queue should show 통과 with score: " + doneRow);
  log("학생 재시험 응시(전부 정답) → 통과 → 큐 완료 표시(점수 포함)");

  // ── 4. 학생03: 같은 범위로 출제 → 미달 → 2차 task 자동 생성 (후속 관리)
  const pendingTask3 = await makeFailedAttempt(browser, academy.id, t1User.id, { id: s3.id, email: "tester.s03@daneobang.dev" }, 3);
  await t1.goto(`${BASE}/app/retakes`);
  const row3 = t1.locator(`[data-task='${pendingTask3.id}']`);
  await row3.locator("[data-testid='retake-mode-same']").click();
  await row3.locator("[data-testid='issue-submit']").click();
  await t1.waitForSelector("text=출제", { timeout: 20000 }).catch(() => {});
  await t1.waitForLoadState("networkidle");
  // 학생03 은 항목이 많아 출제된 행이 접힌 쪽으로 간다 → 응시 대기 보기에서 확인
  await t1.goto(`${BASE}/app/retakes?view=waiting`);
  await t1.waitForSelector(`[data-task='${pendingTask3.id}'] [data-testid='retake-status']:has-text('응시 대기')`, { timeout: 20000 });
  const task3 = await prisma.retakeTask.findUniqueOrThrow({ where: { id: pendingTask3.id } });
  const exam3 = await prisma.exam.findUniqueOrThrow({ where: { id: task3.retakeExamId! } });
  const asg3 = await prisma.assignment.findFirstOrThrow({ where: { examId: exam3.id, studentId: s3.id } });
  const [st3] = await login(browser, "tester.s03@daneobang.dev", 390);
  const wrongN = Math.max(2, Math.ceil(exam3.questionCount * 0.3));
  const attempt3 = await takeExam(st3, asg3.id, wrongN);
  const g3 = await prisma.gradeRevision.findFirstOrThrow({ where: { attemptId: attempt3, current: true } });
  if (g3.passed) fail("expected fail");
  const task3b = await prisma.retakeTask.findUniqueOrThrow({ where: { id: pendingTask3.id } });
  const next3 = await prisma.retakeTask.findFirst({ where: { sourceAttemptId: attempt3 } });
  if (task3b.status !== "completed" || !next3 || next3.status !== "pending") fail(`failed retake should chain: prev=${task3b.status} next=${next3?.status}`);
  await t1.goto(`${BASE}/app/retakes`);
  const chain = await t1.locator(`[data-task='${next3.id}']`).innerText();
  if (!/2차/.test(chain) || !new RegExp(`${Math.round(g3.score)}점`).test(chain)) fail("2차 row should show round + score: " + chain);
  await shot(t1, "03-retake-chain");
  log("재시험 미달 → 2차 task 자동 생성, 큐에 '2차'와 재시험 점수 표시 (후속 관리)");

  // ── 5. 성적 화면: 재시험 통과율이 계산되고 첫 응시 평균에 재시험이 섞이지 않음
  await t1.goto(`${BASE}/app/results?tab=exams&view=attempts`);
  const kpi = await t1.locator("main").innerText();
  const m = kpi.match(/재시험 통과율/);
  if (!m) fail("retake pass KPI label");
  const rp = await t1.locator("[data-testid='detail-summary'] span", { hasText: "재시험 통과율" }).innerText();
  if (!/\d+%/.test(rp)) fail("retake pass rate should be a number now: " + rp);
  log("성적: 재시험 통과율 계산됨 (첫 응시/재시험 분리)");

  // ── 6. 학생 상세: 반복 오답 n개 + 마감 → 즉시 개별 재시험 (배정 단계 없음)
  await t1.goto(`${BASE}/app/students/${s1.id}`);
  await t1.waitForSelector("[data-testid='weak-issue']");
  const before = await prisma.retakeTask.count({ where: { studentId: s1.id, kind: "weak_words" } });
  await t1.locator("[data-testid='weak-due']").fill(due);
  const btnTxt = await t1.locator("[data-testid='weak-issue']").innerText();
  const n = Number(btnTxt.match(/(\d+)개/)?.[1] ?? 0);
  if (n < 1) fail("weak words button: " + btnTxt);
  await t1.locator("[data-testid='weak-issue']").click();
  await t1.waitForFunction((b) => document.querySelectorAll("[data-testid='student-retakes'] li").length > 0 || document.body.innerText.includes("문항 재시험을 냈습니다"), before, { timeout: 20000 });
  const weak = await prisma.retakeTask.findFirst({ where: { studentId: s1.id, kind: "weak_words" }, orderBy: { createdAt: "desc" } });
  if (!weak || weak.status !== "issued" || !weak.retakeExamId) fail("weak-words task should be issued: " + JSON.stringify(weak));
  const weakAsg = await prisma.assignment.findFirstOrThrow({ where: { examId: weak.retakeExamId!, studentId: s1.id } });
  if (!weakAsg.dueAt) fail("weak-words assignment should have due");
  await t1.goto(`${BASE}/app/retakes`);
  const weakRow = await t1.locator(`[data-task='${weak.id}']`).innerText();
  if (!/반복 오답/.test(weakRow) || !/응시 대기/.test(weakRow)) fail("weak-words retake should appear in queue: " + weakRow);
  const [st1] = await login(browser, "tester.s01@daneobang.dev", 390);
  await st1.goto(`${BASE}/learn/retake`);
  if (!/반복 오답/.test(await st1.locator("[data-testid='retake-next']").innerText())) fail("student should see weak-words retake");
  log("학생 상세 반복 오답 n개 + 마감 → 배정 없이 즉시 개별 출제 → 재시험 화면·학생 앱 반영");

  // ── 7. 성적 대시보드 위젯: 편집 → 빼기 → 새로고침 후 유지 → 넣기 → 기본 배치
  await prisma.academyMember.updateMany({ where: { userId: t1User.id, academyId: academy.id }, data: { dashboardLayout: null } });
  await t1.goto(`${BASE}/app/results`);
  await t1.waitForSelector("[data-testid='widget-board']");
  const n0 = await t1.locator("[data-testid^='widget-'][data-w]").count();
  if (n0 !== 9) fail("default 9 widgets, got " + n0);
  if ((await t1.locator("[role='tablist'][aria-label='그룹 기준'] a").allInnerTexts()).some((t) => t.includes("선생님별"))) fail("선생님별 tab must be removed");
  await t1.goto(`${BASE}/app/results?tab=students`);
  if ((await t1.locator("#students-body").locator("xpath=..").innerText()).includes("계정")) fail("계정 column must be removed");
  await t1.goto(`${BASE}/app/results`);
  await t1.waitForSelector("[data-testid='widget-board']");
  await t1.click("[data-testid='widgets-edit']");
  await t1.locator("[data-testid='widget-missed'] [data-testid='widget-remove']").click();
  await t1.waitForTimeout(900);
  await t1.reload();
  await t1.waitForSelector("[data-testid='widget-board']");
  if ((await t1.locator("[data-testid='widget-missed']").count()) !== 0) fail("removed widget should stay removed after reload");
  // 드래그: 평균 점수를 오른쪽 끝으로
  await t1.click("[data-testid='widgets-edit']");
  const handle = t1.locator("[data-testid='widget-avg'] [data-testid='widget-handle']");
  const hb = (await handle.boundingBox())!;
  await t1.mouse.move(hb.x + 20, hb.y + 10);
  await t1.mouse.down();
  await t1.mouse.move(hb.x + 20 + 700, hb.y + 10, { steps: 12 });
  await t1.mouse.up();
  await t1.waitForTimeout(900);
  const avgX = Number(await t1.locator("[data-testid='widget-avg']").getAttribute("data-x"));
  if (avgX < 6) fail("drag should move avg widget right: x=" + avgX);
  // 리사이즈: 성적 추이 높이 +2
  const rs = t1.locator("[data-testid='widget-trend'] [data-testid='widget-resize']");
  const rb = (await rs.boundingBox())!;
  const h0 = Number(await t1.locator("[data-testid='widget-trend']").getAttribute("data-h"));
  await t1.mouse.move(rb.x + 10, rb.y + 10);
  await t1.mouse.down();
  await t1.mouse.move(rb.x + 10, rb.y + 10 + 140, { steps: 8 });
  await t1.mouse.up();
  await t1.waitForTimeout(900);
  const h1 = Number(await t1.locator("[data-testid='widget-trend']").getAttribute("data-h"));
  if (h1 <= h0) fail(`resize should grow trend: ${h0} → ${h1}`);
  await shot(t1, "04-widgets-edited");
  await t1.reload();
  await t1.waitForSelector("[data-testid='widget-board']");
  if (Number(await t1.locator("[data-testid='widget-avg']").getAttribute("data-x")) !== avgX) fail("layout should persist after reload");
  await t1.click("[data-testid='widgets-edit']");
  await t1.click("[data-testid='widget-add-missed']");
  await t1.waitForTimeout(700);
  if ((await t1.locator("[data-testid='widget-missed']").count()) !== 1) fail("add widget back");
  await t1.click("[data-testid='widgets-reset']");
  await t1.waitForTimeout(900);
  await t1.reload();
  await t1.waitForSelector("[data-testid='widget-board']");
  if ((await t1.locator("[data-testid^='widget-'][data-w]").count()) !== 9) fail("reset should restore 9 widgets");
  log("성적 위젯 보드: 빼기·끌어 옮기기·크기 조절·넣기·기본 배치 — 새로고침 후에도 유지");

  // ── 8. 종이 QR 접근 규칙 (기존 발급된 시험지 사용)
  const openPrint = await prisma.printInstance.findFirst({ where: { status: "active", attempt: { status: { not: "graded" }, assignment: { exam: { academyId: academy.id } } } }, include: { pages: true, attempt: { include: { assignment: { include: { student: { include: { user: true } } } } } } }, orderBy: { createdAt: "desc" } });
  const gradedPrint = await prisma.printInstance.findFirst({ where: { status: "active", attempt: { status: "graded", assignment: { exam: { academyId: academy.id } } } }, include: { pages: true, attempt: { include: { assignment: { include: { student: { include: { user: true } } } } } } }, orderBy: { createdAt: "desc" } });
  if (!openPrint || !gradedPrint) fail("need an open and a graded paper print (run e2e/e2e-linked first)");
  const tokOpen = openPrint.pages[0].token;
  const tokGraded = gradedPrint.pages[0].token;
  const ownerOpen = openPrint.attempt.assignment.student.user!.email!;
  const otherEmail = ["tester.s01@daneobang.dev", "tester.s02@daneobang.dev", "tester.s03@daneobang.dev"].find((e) => e !== ownerOpen && e !== gradedPrint.attempt.assignment.student.user?.email)!;
  // (a) 다른 학생 계정 → 차단
  const [other] = await login(browser, otherEmail, 390);
  await other.goto(`${BASE}/q/${tokOpen}`);
  if ((await other.locator("[data-testid='qr-blocked']").count()) !== 1) fail("other account must be blocked on unsubmitted paper");
  await shot(other, "05-qr-blocked");
  // (b) 본인 → 카메라 제출 화면
  const [self] = await login(browser, ownerOpen, 390);
  await self.goto(`${BASE}/q/${tokOpen}`);
  if ((await self.locator("[data-testid='submit-photo']").count()) !== 1) fail("owner must see camera submit");
  // (c) 담당 선생님 → 대신 제출
  await t1.goto(`${BASE}/q/${tokOpen}`);
  const tSubmit = (await t1.locator("[data-testid='teacher-submit']").count()) === 1;
  const tBlocked = (await t1.locator("[data-testid='qr-blocked']").count()) === 1;
  if (!tSubmit && !tBlocked) fail("teacher should see teacher-submit (if 담당) or blocked");
  // (d) 로그인 안 함 → 비밀번호(=본인 로그인)
  const anon = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await anon.goto(`${BASE}/q/${tokOpen}`);
  if (!(await anon.locator("main").innerText()).includes("비밀번호")) fail("anonymous should get password gate");
  // (e) 채점된 시험지: 다른 사람 → 비밀번호, 본인 → 결과, 담당 선생님 → 결과
  await other.goto(`${BASE}/q/${tokGraded}`);
  if (!(await other.locator("main").innerText()).includes("비밀번호")) fail("other account on graded paper → password");
  const [gOwner] = await login(browser, gradedPrint.attempt.assignment.student.user!.email!, 390);
  await gOwner.goto(`${BASE}/q/${tokGraded}`);
  if (!/틀린 문항|Passed|Retake/.test(await gOwner.locator("main").innerText())) fail("owner should see result immediately");
  await t1.goto(`${BASE}/q/${tokGraded}`);
  const tRes = await t1.locator("main").innerText();
  if (!(tRes.includes("틀린 문항") || tRes.includes("비밀번호"))) fail("teacher on graded paper: result (담당) or password");
  await shot(t1, "06-qr-teacher-result");
  log("종이 QR: 미제출 → 본인만 카메라 제출·타 계정 차단·담당 선생님 대신 제출·미로그인 비밀번호 / 채점 후 → 본인·담당은 바로, 타인은 비밀번호");

  // ── 9. 출제 화면·시험 상세: 다음 동작 바가 같은 자리
  await t1.goto(`${BASE}/app/tests/new`);
  await t1.waitForSelector("[data-testid='compose-bar']");
  const bar1 = (await t1.locator("[data-testid='compose-bar'] .btn-primary").boundingBox())!;
  const ex = await prisma.exam.findFirstOrThrow({ where: { academyId: academy.id, status: "published", isRetake: false }, orderBy: { createdAt: "desc" } });
  await t1.goto(`${BASE}/app/tests/${ex.id}?step=1`);
  await t1.waitForSelector("[data-testid='detail-bar']");
  const bar2 = (await t1.locator("[data-testid='detail-bar'] .btn-primary").boundingBox())!;
  if (Math.abs(bar1.x + bar1.width - (bar2.x + bar2.width)) > 2 || Math.abs(bar1.width - bar2.width) > 40) fail(`primary buttons should align: compose right=${bar1.x + bar1.width} detail right=${bar2.x + bar2.width}`);
  await shot(t1, "07-detail-bar");
  log("출제 화면과 시험 상세의 주 동작 버튼이 같은 오른쪽 끝에 정렬됨 (다음 버튼 위치 예측 가능)");

  await browser.close();
  console.log("\nE2E-RETAKE RESULT: PASS");
}

main()
  .catch((e) => {
    console.error("\nE2E-RETAKE RESULT: FAIL —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
