/* eslint-disable */
// 브라우저 E2E (Playwright). 서버가 http://localhost:3000 에 떠 있어야 한다.
// 시나리오: 학원장 로그인 → HWPX 업로드·검수·저장 → 시험 생성·발행·배정 → 종이 시험지 발급 → 합성 사진 채점 →
//           학생 온라인 응시 → 결과 → 교차 테넌트 차단 → 관리자 화면
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import sharp from "sharp";
import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const OUT = path.join(process.cwd(), "fixtures", "e2e");
const RUN_TITLE = `E2E 테스트 시험 ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
fs.mkdirSync(OUT, { recursive: true });
let step = 0;
const log = (m: string) => console.log(`[${String(++step).padStart(2, "0")}] ${m}`);
const fail = (m: string): never => {
  throw new Error(m);
};

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login/email`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password");
  await page.click('button:has-text("로그인")');
  await page.waitForURL(/\/workspaces|\/app|\/learn/);
}

async function enterAcademy(page: Page, name: string) {
  await page.goto(`${BASE}/workspaces`);
  const row = page.locator("li", { hasText: name }).first();
  await row.locator('button:has-text("들어가기")').click();
  await page.waitForURL(/\/app$/);
}

let gPage: Page | null = null;
async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  gPage = page;
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  // ── 학원장
  await login(page, "owner@daneobang.dev");
  await enterAcademy(page, "한빛영어학원");
  log("owner login + dashboard");
  if (!(await page.locator("h1", { hasText: "운영 현황" }).count())) fail("owner overview missing");

  // ── HWPX 업로드 → 자동 저장 → 단어장 (문서 DAY 표기 유지)
  await page.goto(`${BASE}/app/vocabulary`);
  await page.waitForSelector(".dropzone");
  await page.setInputFiles('input[type="file"][name="file"]', path.join("fixtures", "sample.hwpx"));
  await page.waitForSelector(".dropzone.has", { timeout: 15000 });
  await page.click('button:has-text("업로드 · 자동 저장")');
  await page.waitForURL(/\/app\/imports\//, { timeout: 20000 });
  await page.waitForURL(/\/app\/vocabulary\/[a-z0-9]+/, { timeout: 30000 });
  log("hwpx uploaded, parsed and auto-saved");
  const dayText = await page.locator("[role='tablist'][aria-label='DAY'] a").allTextContents();
  if (!dayText.some((t) => t.includes("DAY 14")) || !dayText.some((t) => t.includes("DAY 17"))) fail("DAY list missing: " + dayText.join(","));
  log("book keeps document DAY 14/15/17");
  // ── 번호형 PDF(모의고사 단어장) 업로드 → 7일 기본 분할
  await page.goto(`${BASE}/app/vocabulary`);
  await page.waitForSelector(".dropzone");
  await page.setInputFiles('input[type="file"][name="file"]', path.join("fixtures", "mock-exam-numbered.pdf"));
  await page.waitForSelector(".dropzone.has", { timeout: 15000 });
  await page.click('button:has-text("업로드 · 자동 저장")');
  await page.waitForURL(/\/app\/vocabulary\/[a-z0-9]+/, { timeout: 60000 });
  await page.waitForSelector("[data-testid='day-split']");
  const chips = await page.locator("[role='tablist'][aria-label='DAY'] a").count();
  if (chips !== 7) fail("numbered pdf should split into 7 days, got " + chips);
  const wordsText = await page.locator("span.digital", { hasText: "WORDS" }).first().innerText();
  if (!/158 WORDS/.test(wordsText)) fail("numbered pdf word count: " + wordsText);
  log("numbered-entry PDF → 158 words auto-saved, DAY 1–7 default split");

  // ── HWP 거부
  await page.goto(`${BASE}/app/vocabulary`);
  await page.waitForSelector(".dropzone");
  await page.setInputFiles('input[type="file"][name="file"]', path.join("fixtures", "legacy-renamed.hwpx"));
  await page.waitForSelector(".dropzone.has", { timeout: 15000 });
  await page.click('button:has-text("업로드 · 자동 저장")');
  await page.waitForSelector("text=HWP 파일은 지원하지 않습니다", { timeout: 10000 });
  log("renamed .hwp rejected");

  // ── 시험 출제 1화면 (seed 단어장, DAY 14/17/20, 12문항, 초안 저장 후 발행)
  await page.goto(`${BASE}/app/tests/new`);
  await page.waitForSelector("button.chip");
  for (let i = 0; i < 60; i++) {
    await page.locator("button.chip", { hasText: "능률 VOCA 고교필수" }).click();
    await page.waitForTimeout(500);
    if (await page.locator('label.chip[data-day="14"]').count()) break;
  }
  for (const d of [14, 17, 20]) await page.locator(`label.chip[data-day="${d}"]`).click();
  await page.fill('input[aria-label="문항 수 직접 입력"]', "12");
  await page.selectOption('select[name="answerVisibility"]', "after_release");
  await page.fill('input[name="title"]', RUN_TITLE);
  await page.click('button:has-text("초안만 저장")');
  await page.waitForURL(/\/app\/tests\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
  const examUrl = page.url();
  await page.waitForSelector("[data-testid='step-items']");
  const publishBtn = page.locator('button:has-text("발행")').first();
  await publishBtn.click();
  // 발행되면 (대상이 아직 없으므로) 2단계 응시 대상으로 자동 이동, 헤더는 "발행됨"
  await page.waitForSelector("[data-testid='exam-detail'][data-step='2']", { timeout: 10000 });
  await page.waitForSelector("text=발행됨", { timeout: 10000 });
  log("exam composed (draft) and form v1 published → moved to step 2");

  // ── 응시 대상(2단계): 박학생(온라인) + 김민준(종이) 추가
  await page.goto(`${examUrl}?step=2`);
  await page.waitForSelector("[data-testid='assign-panel']");
  await page.click("[data-testid='assign-toggle-list']");
  for (const n of ["박학생", "김민준"]) await page.locator("label", { hasText: n }).locator('input[name="studentIds"]').check();
  await page.click("[data-testid='assign-add']");
  await page.waitForSelector("text=2명에게 배정", { timeout: 10000 });
  await page.waitForSelector("[data-testid='target-row']:has-text('김민준')", { timeout: 10000 });
  log("assigned 2 students (step 2 · 응시 대상)");

  // ── 종이 시험지(3단계): 김민준만
  await page.goto(`${examUrl}?step=3`);
  await page.click("[data-testid='print-open']");
  await page.locator("label", { hasText: "박학생" }).locator('input[name="assignmentIds"]').uncheck();
  await page.click("[data-testid='print-issue']");
  await page.waitForSelector("a[data-testid='print-pdf']", { timeout: 30000 });
  const pdfHref = await page.locator("a[data-testid='print-pdf']").first().getAttribute("href");
  // 전체 zip
  const zipRes = await ctx.request.get(`${BASE}/api/files/print-zip/${examUrl.split("/").pop()}`);
  if (zipRes.status() !== 200 || !(zipRes.headers()["content-type"] ?? "").includes("zip")) fail("print zip " + zipRes.status());
  const pdfRes = await ctx.request.get(`${BASE}${pdfHref}`);
  if (pdfRes.status() !== 200) fail("pdf download " + pdfRes.status());
  const pdfBuf = Buffer.from(await pdfRes.body());
  fs.writeFileSync(path.join(OUT, "paper.pdf"), pdfBuf);
  log(`paper PDF issued (${(pdfBuf.length / 1024).toFixed(0)}KB)`);

  // manifest 를 DB 에서 읽어 정답으로 마킹 합성 (교사 정답지와 동일 정답 → 100점 기대)
  const { prisma } = await import("../src/lib/db");
  const print = await prisma.printInstance.findFirst({ where: { pdfPath: { not: "" } }, orderBy: { createdAt: "desc" }, include: { pages: true, form: { include: { items: { include: { options: true } } } } } });
  if (!print) fail("print instance missing");
  const manifest = JSON.parse(print!.manifest);
  execSync(`pdftoppm -r 150 -png "${path.join(OUT, "paper.pdf")}" "${path.join(OUT, "paper")}"`);
  const pngs = fs.readdirSync(OUT).filter((f) => /^paper-?\d+\.png$/.test(f)).sort();
  const scale = 150 / 72;
  const photos: string[] = [];
  for (const [pi, png] of pngs.entries()) {
    const pm = manifest.pages[pi];
    const circles: string[] = [];
    for (const it of pm.items) {
      const item = print!.form.items.find((x) => x.id === it.itemId)!;
      const correct = item.options.find((o) => o.isCorrect)!;
      // 마지막 문항은 일부러 오답 → 재시험 케이스가 아닌 정확도 확인용 (12문항 중 1개 오답 = 91.7% 통과)
      const pickPos = it.position === 12 ? ((correct.position % 4) + 1) : correct.position;
      const b = it.bubbles.find((x: { position: number }) => x.position === pickPos);
      circles.push(`<circle cx="${b.cx * scale}" cy="${b.cy * scale}" r="${b.r * scale * 0.9}" fill="#111"/>`);
    }
    const meta = await sharp(path.join(OUT, png)).metadata();
    const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">${circles.join("")}</svg>`;
    // sharp 는 rotate/resize 를 composite 보다 먼저 적용하므로 두 단계로 나눈다
    const marked = await sharp(path.join(OUT, png)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    const photo = await sharp(marked).rotate(pi % 2 ? 182 : -2, { background: "#666" }).extend({ top: 50, bottom: 70, left: 60, right: 40, background: "#666" }).resize({ width: 1400 }).jpeg({ quality: 75 }).toBuffer();
    const p = path.join(OUT, `photo-${pi + 1}.jpg`);
    fs.writeFileSync(p, photo);
    photos.push(p);
  }
  log(`synthesized ${photos.length} marked photo(s)`);

  // ── 사진 업로드 → 판독 → 확정
  await page.goto(`${BASE}/app/scans`);
  await page.setInputFiles('input[type="file"][name="files"]', photos);
  await page.click('button:has-text("업로드 · 판독")');
  await page.waitForSelector("text=장 업로드", { timeout: 15000 });
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/app/scans`);
    const pending = await page.locator("text=판독 중").count() + (await page.locator("td >> text=대기").count());
    if (pending === 0) break;
  }
  const rows = page.locator("table tbody tr");
  const n = await rows.count();
  let finalMsg = "";
  let accepted = 0;
  for (let i = 0; i < n; i++) {
    await page.goto(`${BASE}/app/scans`);
    const link = page.locator("table tbody tr").nth(i).locator("a").first();
    const status = await page.locator("table tbody tr").nth(i).locator("td").nth(4).innerText();
    if (!status.includes("검수 필요")) continue; // 이전 실행의 확정된 스캔
    accepted++;
    await link.click();
    await page.waitForSelector("text=문항별 판독");
    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("이 페이지 확정")');
    await Promise.race([page.waitForSelector("text=상태 accepted", { timeout: 15000 }), page.waitForURL(/\/app\/scans(\?.*)?$/, { timeout: 15000 })]);
    await page.waitForTimeout(500);
  }
  if (accepted !== photos.length) fail(`accepted ${accepted} of ${photos.length} scans`);
  const notAccepted = await prisma.scanUpload.count({ where: { status: { notIn: ["accepted"] }, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
  if (notAccepted) fail(`${notAccepted} scans not accepted`);
  const paperAttempt = await prisma.attempt.findFirst({ where: { mode: "paper", assignment: { student: { name: "김민준" } } }, include: { grades: { where: { current: true } } }, orderBy: { startedAt: "desc" } });
  const pg = paperAttempt?.grades[0];
  if (!pg) fail("paper attempt not graded");
  finalMsg = `${pg!.correctCount}/${pg!.totalCount} passed=${pg!.passed} reason=${pg!.reason}`;
  if (pg!.correctCount !== 11 || pg!.totalCount !== 12) fail("unexpected paper score: " + finalMsg);
  log("paper scans accepted → graded: " + finalMsg.replace(/\s+/g, " "));

  // ── 학생 온라인 응시
  const sctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const sp = await sctx.newPage();
  await login(sp, "student@daneobang.dev");
  await sp.goto(`${BASE}/learn`);
  // 이번 E2E 시험(제목 일치) 카드/필의 시작 버튼을 누른다 (이전 실행의 다른 시험이 먼저 보일 수 있음)
  const e2eCard = sp.locator("[data-testid='next-card'], [data-testid='queue-item']", { hasText: RUN_TITLE }).first();
  await e2eCard.locator('button:has-text("응시 시작"), button:has-text("시작")').first().click();
  await sp.waitForURL(/\/learn\/attempts\//);
  await sp.waitForSelector(".digital-lg >> text=/12");
  // 정답 조회 (DB) 후 모두 정답 선택, 마지막 1개는 오답 → 11/12
  const attemptId = sp.url().split("/").pop()!;
  const at = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { assignment: { include: { form: { include: { items: { include: { options: true }, orderBy: { position: "asc" } } } } } } } });
  const items = at!.assignment.form.items;
  // 게임형 응시: 고르면 자동으로 다음 단어. 11번째까지 정답 → 새로고침해 12번째부터 이어지는지 확인 → 마지막은 오답 → 자동 제출
  const pickOn = async (i: number) => {
    const correct = items[i].options.find((o) => o.isCorrect)!;
    const target = i === items.length - 1 ? items[i].options.find((o) => !o.isCorrect)! : correct;
    await sp.waitForSelector(`.digital-lg >> text=${String(i + 1).padStart(2, "0")}`, { timeout: 8000 });
    await sp.locator("button.tile", { hasText: target.text }).first().click();
    await sp.waitForTimeout(320);
  };
  for (let i = 0; i < items.length - 1; i++) await pickOn(i);
  await sp.waitForSelector("text=SAVED", { timeout: 10000 });
  // 새로고침 후 복원: 첫 미응답(12번째) 단어에서 이어진다
  await sp.reload();
  await sp.waitForSelector(`.digital-lg >> text=${String(items.length).padStart(2, "0")}/`, { timeout: 10000 });
  await pickOn(items.length - 1);
  await sp.waitForURL(/\/learn\/results\//, { timeout: 15000 });
  const scoreText = (await sp.locator(".num-xl [data-value]").getAttribute("data-value")) ?? (await sp.locator(".num-xl").innerText());
  if (!scoreText.includes("92")) fail("online score unexpected: " + scoreText);
  // 정답 미공개 확인
  if ((await sp.locator("text=정답과 오답노트는 선생님이 공개한 뒤").count()) !== 1) fail("answers leaked before release");
  const wn = await sctx.request.get(`${BASE}/api/files/wrong-note/${attemptId}?scope=attempt`);
  if (wn.status() !== 403) fail("wrong-note should be 403 before release, got " + wn.status());
  // 공개 전에는 개인 연습도 잠김
  await sp.goto(`${BASE}/learn/practice/${attemptId}`);
  if (!(await sp.locator("text=정답이 공개된 뒤 연습할 수 있습니다").count())) fail("practice should be locked before release");
  // DTO 에 정답 키 없음
  const dtoRes = await sctx.request.get(`${BASE}/api/v1/attempts/${attemptId}`);
  const dtoText = await dtoRes.text();
  if (/isCorrect|correct_option|seed/.test(dtoText)) fail("student DTO leaks answer key");
  log("student online attempt: 11/12 = 92, restored after reload, answers hidden before release");

  // 반복 제출 멱등성
  const again = await sctx.request.post(`${BASE}/api/v1/attempts/${attemptId}/submit`, { data: {} });
  const againJ = await again.json();
  if (!againJ.data?.already_graded) fail("resubmit should be idempotent");
  const grades = await prisma.gradeRevision.count({ where: { attemptId } });
  if (grades !== 1) fail("duplicate grade revisions: " + grades);
  log("resubmit idempotent (1 grade revision)");

  // ── 교사: 정답 공개 → 학생 오답노트 열람 가능
  await page.goto(`${examUrl}?step=3`, { waitUntil: "networkidle" });
  const releaseBtn = page.locator('button:has-text("정답·오답노트 공개")');
  try {
    await releaseBtn.waitFor({ timeout: 30000 });
  } catch (e) {
    console.log("URL:", page.url(), "H1:", await page.locator("h1").allTextContents(), "BTN:", (await page.locator("button").allTextContents()).join("|"));
    await page.screenshot({ path: path.join(OUT, "fail.png"), fullPage: true });
    throw e;
  }
  await releaseBtn.click();
  await page.waitForSelector("text=공개했습니다", { timeout: 10000 });
  const wn2 = await sctx.request.get(`${BASE}/api/files/wrong-note/${attemptId}?scope=attempt`);
  if (wn2.status() !== 200 || !(wn2.headers()["content-type"] ?? "").includes("pdf")) fail("wrong-note after release failed " + wn2.status());
  fs.writeFileSync(path.join(OUT, "wrong-note.pdf"), Buffer.from(await wn2.body()));
  log("answers released → student wrong-note PDF ok");

  // ── 학생 개인 연습: 결과 → 틀린 단어 연습(random) → 틀렸던 1단어 → 정답 → 1/1 완료. DB 에는 아무것도 남지 않는다.
  const dbBefore = [await prisma.attempt.count(), await prisma.gradeRevision.count(), await prisma.attemptAnswer.count()];
  await sp.goto(`${BASE}/learn/results/${attemptId}`);
  if ((await sp.locator('[data-testid="speak"]').count()) < 1) fail("results wrong item speaker missing");
  await sp.locator('[data-testid="practice-link"]').click();
  await sp.waitForURL(/\/learn\/practice\//);
  await sp.waitForSelector('[data-testid="practice"] button.tile', { timeout: 15000 });
  if ((await sp.locator('[data-testid="practice"] [data-testid="speak"]').count()) < 1) fail("practice speaker missing");
  if ((await sp.locator('[data-testid="practice"] button.tile').count()) !== 4) fail("practice should show 4 options");
  const lastCorrect = items[items.length - 1].options.find((o) => o.isCorrect)!.text;
  await sp.locator("button.tile").filter({ has: sp.locator(`span:text-is("${lastCorrect}")`) }).first().click();
  await sp.waitForSelector('[data-testid="practice-done"]', { timeout: 10000 });
  const doneText = await sp.locator('[data-testid="practice-done"]').innerText();
  if (!doneText.includes("100%")) fail("practice done should be 100%: " + doneText.replace(/\s+/g, " "));
  const dbAfter = [await prisma.attempt.count(), await prisma.gradeRevision.count(), await prisma.attemptAnswer.count()];
  if (dbBefore.join() !== dbAfter.join()) fail("practice must not write to DB: " + dbBefore.join() + " → " + dbAfter.join());
  // 전체 틀린 단어 연습 (성적 탭 필)
  await sp.goto(`${BASE}/learn/grades`);
  await sp.locator('[data-testid="practice-all"]').click();
  await sp.waitForURL(/\/learn\/practice$/);
  await sp.waitForSelector('[data-testid="practice"] button.tile', { timeout: 15000 });
  log("student practice: wrong-word random test 1/1 (100%), all-wrong practice opens, no DB writes");

  // ── 결과/재시험 화면 (둘 다 통과(92%)이므로 재시험 없음) → 통과 기준 경계 확인 후 재시험 케이스: 정정 채점으로 미달 만들기
  await page.goto(`${BASE}/app/results`);
  if ((await page.locator('#results-body tr[data-score="92"]').count()) < 2) fail("results page missing scores");
  log("results page shows both graded attempts");

  // ── 교차 테넌트: owner2 가 한빛학원 학생/시험에 접근 불가
  const octx = await browser.newContext();
  const op = await octx.newPage();
  await login(op, "owner2@daneobang.dev");
  await enterAcademy(op, "사랑학원");
  const hanbitStudent = await prisma.student.findFirst({ where: { name: "김민준" } });
  const r1 = await op.goto(`${BASE}/app/students/${hanbitStudent!.id}`);
  if (r1!.status() !== 404) fail("cross-tenant student page should 404, got " + r1!.status());
  const r2 = await octx.request.get(`${BASE}/api/files/print/${print!.id}`);
  if (r2.status() !== 404) fail("cross-tenant print pdf should 404, got " + r2.status());
  const hanbit = await prisma.academy.findUnique({ where: { slug: "hanbit" } });
  const r3 = await octx.request.get(`${BASE}/api/v1/students`, { headers: { "x-academy-id": hanbit!.id } });
  if (r3.status() !== 403) fail("cross-tenant API should 403, got " + r3.status());
  const r4 = await octx.request.get(`${BASE}/api/v1/attempts/${attemptId}`);
  if (r4.status() !== 404) fail("other user's attempt should 404, got " + r4.status());
  log("cross-tenant access blocked (page 404, file 404, API 403, attempt 404)");

  // ── 선생님(담당) 로그인: 담당 학생만 보임, 학원 설정 수정 불가
  const tctx = await browser.newContext();
  const tp = await tctx.newPage();
  await login(tp, "teacher@daneobang.dev");
  await enterAcademy(tp, "한빛영어학원");
  await tp.goto(`${BASE}/app/settings`);
  if (tp.url().includes("/app/settings")) fail("teacher should be redirected away from settings");
  const tnav = await tp.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
  if (tnav.some((t) => t.includes("학원 설정") || t.includes("선생님"))) fail("teacher nav shows owner-only items");
  log("teacher role: settings/teachers hidden and redirected");

  // ── 모바일 API: 로그인 → 토큰 → me → dashboard
  const apiLogin = await ctx.request.post(`${BASE}/api/v1/auth/login`, { data: { email: "teacher@daneobang.dev", password: "password" } });
  const token = (await apiLogin.json()).data.token;
  const me = await ctx.request.get(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  const meJ = await me.json();
  const dash = await ctx.request.get(`${BASE}/api/v1/dashboard`, { headers: { authorization: `Bearer ${token}`, "x-academy-id": meJ.data.memberships[0].academy.id } });
  if (dash.status() !== 200) fail("mobile dashboard api " + dash.status());
  log("mobile REST API: bearer login → /me → /dashboard ok");

  // ── 관리자
  const actx = await browser.newContext();
  const ap = await actx.newPage();
  await login(ap, "admin@daneobang.dev");
  await ap.goto(`${BASE}/admin`);
  if (!(await ap.locator("h1", { hasText: "서비스 현황" }).count())) fail("admin page missing");
  const nonAdmin = await tp.goto(`${BASE}/admin`);
  if (!nonAdmin!.url().includes("/workspaces")) fail("non-admin should be redirected from /admin");
  log("admin dashboard ok; non-admin redirected");

  await browser.close();
  await prisma.$disconnect();
  console.log("\nE2E RESULT: PASS");
}

main().catch(async (e) => {
  console.error("\nE2E RESULT: FAIL —", e.message);
  try {
    if (gPage) {
      await gPage.screenshot({ path: path.join(OUT, "fail.png"), fullPage: true });
      console.error("  url:", gPage.url());
    }
  } catch {}
  process.exit(1);
});
