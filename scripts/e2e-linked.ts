/* eslint-disable */
// 연동 계정 E2E: 한 학원(테스트학원)에 소속된 학원장(owner@) · 선생님1(tester.t1@) · 학생01(tester.s01@) 의 상호작용 검증.
// 모든 단계·스크린샷을 LOG_DIR (기본 ../log = C:\DANEOBANG\log) 에 남긴다.
//   실행: 서버가 떠 있는 상태에서  npx tsx scripts/e2e-linked.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { chromium, type Page, type BrowserContext } from "playwright";
import { execSync } from "child_process";
import sharp from "sharp";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const EXEC = process.env.PW_CHROMIUM || undefined;
const LOG_DIR = (() => {
  const d = process.env.LOG_DIR || path.join(process.cwd(), "..", "log");
  return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
})();
const RUN = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const SHOT_DIR = path.join(LOG_DIR, `e2e-linked-${RUN}`);
fs.mkdirSync(SHOT_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `e2e-linked-${RUN}.log`);

let step = 0;
const results: { step: number; name: string; ok: boolean; detail?: string; ms: number }[] = [];
function log(line: string, extra?: unknown) {
  const entry = JSON.stringify({ at: new Date().toISOString(), kind: "e2e", event: line, detail: extra });
  fs.appendFileSync(LOG_FILE, entry + "\n");
  console.log(line, extra ? JSON.stringify(extra) : "");
}
async function check(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  step++;
  try {
    const detail = (await fn()) ?? undefined;
    results.push({ step, name, ok: true, detail, ms: Date.now() - t0 });
    log(`[${String(step).padStart(2, "0")}] PASS ${name}`, detail);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ step, name, ok: false, detail, ms: Date.now() - t0 });
    log(`[${String(step).padStart(2, "0")}] FAIL ${name}`, detail);
    throw e;
  }
}
const expect = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

async function shot(page: Page, name: string) {
  const file = path.join(SHOT_DIR, `${String(step).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
}

async function login(ctx: BrowserContext, email: string, password: string, viewport?: { width: number; height: number }) {
  const page = await ctx.newPage();
  if (viewport) await page.setViewportSize(viewport);
  page.on("pageerror", (e) => log("pageerror", { email, message: e.message }));
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("로그인")');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  log("login", { email, landed: new URL(page.url()).pathname });
  return page;
}

async function main() {
  log("e2e-linked start", { BASE, LOG_DIR });
  const browser = await chromium.launch({ executablePath: EXEC });
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const t1Ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const s1Ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const t2Ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const s5Ctx = await browser.newContext();
  const s2Ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const { prisma } = await import("../src/lib/db");
  const RUN_TITLE = `연동 E2E 시험 ${RUN.slice(11)}`;

  // ── 1. 학원장: 두 학원 소속 → 학원 선택 → 테스트학원 진입 → 로고 등록
  let owner!: Page;
  await check("학원장 로그인 → 학원 선택 화면 (2개 학원 소속)", async () => {
    owner = await login(ownerCtx, "owner@daneobang.dev", "password");
    expect(owner.url().endsWith("/workspaces"), "2개 학원 소속이면 /workspaces 로 가야 함: " + owner.url());
    const names = await owner.locator("li").allTextContents();
    expect(names.some((n) => n.includes("테스트학원")) && names.some((n) => n.includes("한빛영어학원")), "학원 목록에 테스트학원·한빛영어학원 필요");
    await shot(owner, "owner-workspaces");
    await owner.locator("li", { hasText: "테스트학원" }).locator('button:has-text("들어가기")').click();
    await owner.waitForURL(/\/app$/);
    return "테스트학원 진입";
  });
  await check("학원장: 설정에서 로고 등록 → 사이드바·파일 API 반영", async () => {
    await owner.goto(`${BASE}/app/settings`);
    await owner.setInputFiles('input[name="logo"]', path.join("fixtures", "logo.png"));
    await owner.click('button:has-text("등록")');
    await owner.waitForSelector("text=로고를 등록했습니다", { timeout: 15000 });
    const r = await ownerCtx.request.get(`${BASE}/api/files/logo/current`);
    expect(r.status() === 200 && (r.headers()["content-type"] ?? "").includes("png"), "logo api " + r.status());
    await owner.reload();
    expect((await owner.locator('aside img[alt=""]').count()) === 1, "사이드바 로고 미표시");
    await shot(owner, "owner-settings-logo");
  });
  await check("학원장: 선생님 화면(구성원)에 선생님1·학생 담당 관계 확인", async () => {
    await owner.goto(`${BASE}/app/teachers`);
    const rows = await owner.locator("table tbody tr").allTextContents();
    expect(rows.some((r) => r.includes("테스터 선생님1")), "구성원에 선생님1 없음");
    await shot(owner, "owner-teachers");
    await owner.goto(`${BASE}/app/students`);
    const st = await owner.locator("#roster-body tr", { hasText: "테스터 학생01" }).first().innerText();
    expect(st.includes("ACTIVE") && st.includes("테스터 선생님1"), "학생01 연결/담당 표시 이상: " + st);
    await shot(owner, "owner-students-roster");
  });

  // ── 2. 선생님1: 로그인 즉시 /app, 이번 주 시험 배정 확인, 새 시험 즉시 발행·배정
  let t1!: Page;
  await check("선생님1 로그인 → 학원 1곳이라 바로 대시보드 진입", async () => {
    t1 = await login(t1Ctx, "tester.t1@daneobang.dev", "test1234");
    expect(new URL(t1.url()).pathname === "/app", "단일 소속은 /app 으로 바로: " + t1.url());
    const txt = await t1.locator("main").innerText();
    expect(txt.includes("담당 5명"), "담당 학생 5명 표시");
    const nav = await t1.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
    expect(!nav.some((n) => n.includes("학원 설정")), "선생님에게 학원 설정 메뉴가 보임");
    await shot(t1, "t1-today");
  });
  await check("선생님1: 시험 만들기 한 화면으로 발행+A반 배정", async () => {
    await t1.goto(`${BASE}/app/tests/new`);
    await t1.waitForSelector("button.chip");
  for (let i = 0; i < 60; i++) {
    await t1.locator("button.chip", { hasText: "테스트 단어장" }).click();
    await t1.waitForTimeout(500);
    if (await t1.locator('label.chip[data-day="16"]').count()) break;
  }
    for (const d of [16, 17]) await t1.locator(`label.chip[data-day="${d}"]`).click();
    await t1.fill('input[aria-label="문항 수 직접 입력"]', "10");
    await t1.locator('label.chip[data-class="테스트 A반"]').click();
    await t1.locator("summary", { hasText: "More" }).click();
    await t1.selectOption('select[name="answerVisibility"]', "after_release");
    await t1.fill('input[name="title"]', RUN_TITLE);
    await t1.waitForSelector("ol", { timeout: 15000 }); // 미리보기 문항
    await shot(t1, "t1-compose");
    await t1.click('button:has-text("발행 ·")');
    await t1.waitForURL(/\/app\/tests\/(?!new)[a-z0-9]+\?published=1/, { timeout: 30000 });
    const banner = await t1.locator("text=시험을 발행했습니다").innerText();
    expect(banner.includes("5명"), "A반 5명 자동 배정 기대: " + banner);
    await shot(t1, "t1-exam-published");
    return banner;
  });

  // ── 3. 학생01: 로그인 즉시 /learn, 이번 주 시험 + 새 시험 표시, 응시
  let s1!: Page;
  let attemptId = "";
  await check("학생01 로그인 → 바로 내 시험 화면, 이번 주 단어 테스트 표시", async () => {
    s1 = await login(s1Ctx, "tester.s01@daneobang.dev", "test1234", { width: 390, height: 800 });
    expect(new URL(s1.url()).pathname === "/learn", "학생은 /learn 으로 바로: " + s1.url());
    const txt = await s1.locator("main").innerText();
    expect(txt.includes("이번 주 단어 테스트"), "이번 주 단어 테스트 섹션 없음");
    expect(txt.includes("이번 주 단어 테스트 (") , "seed 주간 시험 카드 없음");
    expect(txt.includes(RUN_TITLE), "선생님1이 방금 배정한 시험이 보이지 않음");
    await shot(s1, "s01-learn-home");
  });
  await check("학생01: 선생님1 시험 응시 (9/10 정답) → 결과 90점", async () => {
    await s1.locator("div, .pill", { hasText: RUN_TITLE }).locator('button:has-text("응시 시작"), button:has-text("시작")').first().click();
    await s1.waitForURL(/\/learn\/attempts\//);
    attemptId = s1.url().split("/").pop()!;
    const at = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { assignment: { include: { form: { include: { items: { include: { options: true }, orderBy: { position: "asc" } } } } } } } });
    const items = at!.assignment.form.items;
    for (let i = 0; i < items.length; i++) {
      const pick = i === items.length - 1 ? items[i].options.find((o) => !o.isCorrect)! : items[i].options.find((o) => o.isCorrect)!;
      await s1.waitForSelector(`.digital-lg >> text=${String(i + 1).padStart(2, "0")}`, { timeout: 8000 });
      if (i === items.length - 1) await shot(s1, "s01-attempt-last");
      await s1.locator("button.tile", { hasText: pick.text }).first().click();
      await s1.waitForTimeout(320);
    }
    await s1.waitForURL(/\/learn\/results\//, { timeout: 15000 });
    const score = (await s1.locator(".num-xl [data-value]").getAttribute("data-value")) ?? (await s1.locator(".num-xl").innerText());
    expect(score.includes("90"), "점수 90 기대: " + score);
    expect((await s1.locator("text=정답과 오답노트는 선생님이 공개한 뒤").count()) === 1, "공개 전 정답 노출");
    await shot(s1, "s01-result-before-release");
    return score;
  });

  // ── 4. 선생님1·학원장이 같은 결과를 본다
  await check("선생님1 대시보드·성적에 학생01 결과 반영", async () => {
    await t1.goto(`${BASE}/app/results`);
    const st = await t1.locator("#students-body tr", { hasText: "테스터 학생01" }).first().innerText();
    expect(/\b90\b/.test(st), "성적 대시보드 학생별 요약에 학생01 90 없음: " + st);
    await t1.goto(`${BASE}/app/results`);
    expect((await t1.locator("table tbody tr", { hasText: "테스터 학생01" }).count()) >= 1, "성적 목록에 학생01 없음");
    await shot(t1, "t1-results");
  });
  await check("학원장도 같은 시험·결과를 봄 (학원 전체 범위)", async () => {
    await owner.goto(`${BASE}/app/results`);
    const row = t1 && (await owner.locator("table tbody tr", { hasText: RUN_TITLE }).first().innerText());
    expect(row.includes("테스터 학생01") && row.includes("90"), "학원장 성적 화면에 학생01 결과 없음: " + row);
    await shot(owner, "owner-results");
  });

  // ── 5. 학원장: 학생02 종이 시험지 발급 → 로고 인쇄 확인
  await check("학원장: 학생02 종이 시험지 발급 → PDF 에 로고 포함", async () => {
    const exam = await prisma.exam.findFirst({ where: { title: RUN_TITLE } });
    await owner.goto(`${BASE}/app/tests/${exam!.id}`);
    await owner.click('button:has-text("종이 시험지 발급")');
    for (const n of ["01", "03", "04", "05"]) {
      const cb = owner.locator("label", { hasText: `테스터 학생${n}` }).locator('input[name="assignmentIds"]');
      if (await cb.count()) await cb.uncheck();
    }
    await owner.click('button:has-text("선택 학생 시험지 생성")');
    await owner.waitForSelector('a:has-text("PDF (")', { timeout: 30000 });
    const href = await owner.locator('a:has-text("PDF (")').first().getAttribute("href");
    const r = await ownerCtx.request.get(`${BASE}${href}`);
    expect(r.status() === 200, "pdf " + r.status());
    const pdf = Buffer.from(await r.body());
    fs.writeFileSync(path.join(SHOT_DIR, "paper-s02.pdf"), pdf);
    const print = await prisma.printInstance.findFirst({ orderBy: { createdAt: "desc" } });
    expect(print?.templateVersion === "v2", "새 레이아웃(v2) 아님");
    // 로고 PNG 가 PDF 안에 이미지 XObject 로 들어갔는지
    expect(pdf.includes("/Subtype /Image") || pdf.includes("/Subtype/Image"), "PDF 에 이미지(로고) 없음");
    await shot(owner, "owner-print-issued");
    return `${(pdf.length / 1024).toFixed(0)}KB, template v2`;
  });

  // ── 5b. 학생02: 종이 시험지 사진을 직접 제출 → 자동 채점 → 알림 → QR 페이지에서 비밀번호로 결과 확인
  await check("학생02: 시험지 사진 제출(앱) → 자동 채점·알림 → QR 페이지 비밀번호 확인", async () => {
    const print = await prisma.printInstance.findFirst({ where: { attempt: { assignment: { exam: { title: RUN_TITLE }, student: { name: "테스터 학생02" } } }, status: "active" }, orderBy: { createdAt: "desc" }, include: { pages: true, form: { include: { items: { include: { options: true } } } } } });
    expect(!!print, "학생02 시험지 없음");
    const pdfPath = path.join(SHOT_DIR, "paper-s02.pdf");
    execSync(`pdftoppm -r 150 -png "${pdfPath}" "${path.join(SHOT_DIR, "s02paper")}"`);
    const pngs = fs.readdirSync(SHOT_DIR).filter((f) => /^s02paper-?\d+\.png$/.test(f)).sort();
    const manifest = JSON.parse(print!.manifest);
    const scale = 150 / 72;
    const photos: string[] = [];
    for (const [pi, png] of pngs.entries()) {
      const pm = manifest.pages[pi];
      const circles: string[] = [];
      for (const it of pm.items) {
        const item = print!.form.items.find((x) => x.id === it.itemId)!;
        const correct = item.options.find((o) => o.isCorrect)!;
        const pickPos = it.position <= 2 ? ((correct.position % 4) + 1) : correct.position; // 2문항 오답 → 80점 재시험
        const b = it.bubbles.find((x: { position: number }) => x.position === pickPos);
        circles.push(`<circle cx="${b.cx * scale}" cy="${b.cy * scale}" r="${b.r * scale * 0.9}" fill="#111"/>`);
      }
      const meta = await sharp(path.join(SHOT_DIR, png)).metadata();
      const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">${circles.join("")}</svg>`;
      const marked = await sharp(path.join(SHOT_DIR, png)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
      const photo = await sharp(marked).rotate(-2, { background: "#666" }).extend({ top: 50, bottom: 70, left: 60, right: 40, background: "#666" }).resize({ width: 1400 }).jpeg({ quality: 78 }).toBuffer();
      const out = path.join(SHOT_DIR, `s02-photo-${pi + 1}.jpg`);
      fs.writeFileSync(out, photo);
      photos.push(out);
    }
    const s2 = await login(s2Ctx, "tester.s02@daneobang.dev", "test1234", { width: 390, height: 800 });
    await s2.goto(`${BASE}/learn/paper`);
    expect((await s2.locator("[data-testid='submit-photo']").count()) === 1, "사진 제출 버튼 없음");
    await shot(s2, "s02-paper-before");
    // 카메라 input 은 sr-only: 파일을 직접 넣는다
    await s2.setInputFiles('input[type="file"][accept="image/*"]', photos);
    await s2.waitForSelector("text=채점 중", { timeout: 20000 });
    await shot(s2, "s02-paper-grading");
    // 자동 채점 완료 대기
    let graded = null as null | { score: number; passed: boolean };
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const g = await prisma.gradeRevision.findFirst({ where: { current: true, attemptId: print!.attemptId } });
      if (g) {
        graded = { score: g.score, passed: g.passed };
        break;
      }
    }
    expect(!!graded, "자동 채점이 40초 안에 끝나지 않음");
    expect(Math.round(graded!.score) === 80 && !graded!.passed, `80점 재시험 기대: ${JSON.stringify(graded)}`);
    const noti = await prisma.notification.findFirst({ where: { user: { email: "tester.s02@daneobang.dev" }, title: { contains: "채점 완료" } }, orderBy: { createdAt: "desc" } });
    expect(!!noti && noti.title.includes("80") && noti.title.includes("재시험"), "채점 완료 알림 없음: " + noti?.title);
    await s2.goto(`${BASE}/learn/paper`);
    await s2.waitForSelector(".badge-red:has-text(\"RETAKE\")", { timeout: 10000 });
    await shot(s2, "s02-paper-graded");
    // QR 페이지: 로그인 없는 새 컨텍스트에서 비밀번호로 열람
    const qctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const q = await qctx.newPage();
    await q.goto(`${BASE}/q/${print!.pages[0].token}`);
    await q.waitForSelector('input[name="password"]');
    await shot(q, "s02-qr-password");
    await q.fill('input[name="password"]', "wrong-pw");
    await q.click('button:has-text("확인")');
    await q.waitForSelector("text=비밀번호가 맞지 않습니다", { timeout: 10000 });
    await q.fill('input[name="password"]', "test1234");
    await q.click('button:has-text("확인")');
    await q.waitForSelector(".num-xl", { timeout: 15000 });
    const qs = (await q.locator(".num-xl [data-value]").getAttribute("data-value")) ?? "";
    expect(qs === "80", "QR 페이지 점수 80 기대: " + qs);
    expect((await q.locator("text=재시험 대상입니다").count()) === 1, "QR 페이지 재시험 표시 없음");
    await shot(q, "s02-qr-result");
    await qctx.close();
    return `auto-graded ${Math.round(graded!.score)} · notification · QR ok`;
  });

  // ── 6. 선생님1 정답 공개 → 학생01 오답 확인
  await check("선생님1 정답 공개 → 학생01 오답 복습·오답노트 PDF 열람", async () => {
    const exam = await prisma.exam.findFirst({ where: { title: RUN_TITLE } });
    await t1.goto(`${BASE}/app/tests/${exam!.id}`);
    await t1.click('button:has-text("정답·오답노트 공개")');
    await t1.waitForSelector("text=공개했습니다", { timeout: 10000 });
    await s1.reload();
    await s1.waitForSelector("[data-testid='practice-link']", { timeout: 10000 });
    expect((await s1.locator("text=1 WRONG").count()) === 1, "오답 1개 표시 기대");
    expect((await s1.locator("[data-testid='speak']").count()) >= 1, "틀린 단어 스피커 없음");
    const wn = await s1Ctx.request.get(`${BASE}/api/files/wrong-note/${attemptId}?scope=attempt`);
    expect(wn.status() === 200, "wrong-note " + wn.status());
    await shot(s1, "s01-result-after-release");
    // 개인 연습: 틀린 1단어 random test → 완료 화면. 서버에 기록 없음
    const before = await prisma.attempt.count();
    await s1.click("[data-testid='practice-link']");
    await s1.waitForURL(/\/learn\/practice\//);
    await s1.waitForSelector("[data-testid='practice'] button.tile", { timeout: 15000 });
    await shot(s1, "s01-practice");
    await s1.locator("[data-testid='practice'] button.tile").first().click();
    await s1.waitForSelector("[data-testid='practice-done']", { timeout: 10000 });
    await shot(s1, "s01-practice-done");
    expect((await prisma.attempt.count()) === before, "연습이 DB 에 기록됨");
  });

  // ── 7. 선생님2(다른 반 담당)는 학생01 을 볼 수 없다
  await check("선생님2: 담당 아닌 학생01 은 목록·결과에서 차단", async () => {
    const t2 = await login(t2Ctx, "tester.t2@daneobang.dev", "test1234");
    await t2.goto(`${BASE}/app/students`);
    const names = await t2.locator("#roster-body tr").allTextContents();
    expect(!names.some((n) => n.includes("테스터 학생01")) && names.some((n) => n.includes("테스터 학생06")), "선생님2 학생 범위 오류");
    const r = await t2.goto(`${BASE}/app/results/${attemptId}`);
    expect(r!.status() === 404, "선생님2가 학생01 결과 접근 가능 (" + r!.status() + ")");
    await shot(t2, "t2-students");
  });

  // ── 8. 재시험 메커니즘: 오답 → 재출제(오답만) → 보강 일정 → 학생 앱 표시
  await check("선생님1: 학생05 재시험(오답만) 생성 + 보강 일정 → 학생05 앱에 날짜 표시", async () => {
    const s05 = await prisma.student.findFirst({ where: { name: "테스터 학생05", academy: { slug: "tester" } } });
    expect(!!s05, "학생05 없음");
    let task = await prisma.retakeTask.findFirst({ where: { studentId: s05!.id, status: { in: ["pending", "scheduled"] }, retakeExamId: null }, orderBy: { createdAt: "desc" } });
    if (!task) task = await prisma.retakeTask.findFirst({ where: { studentId: s05!.id, status: { in: ["pending", "scheduled"] } }, orderBy: { createdAt: "desc" } });
    expect(!!task, "학생05 재시험 대상 없음 (seed history 필요)");
    await t1.goto(`${BASE}/app/retakes`);
    const row = t1.locator(`[data-testid='retake-row'][data-task="${task!.id}"]`);
    expect((await row.count()) === 1, "재시험 큐에 학생05 행 없음");
    if (await row.locator('button:has-text("오답만 재시험")').count()) {
      await row.locator('button:has-text("오답만 재시험")').click();
      await t1.waitForSelector("text=학생에게 배정했습니다", { timeout: 20000 });
    }
    const row2 = t1.locator(`[data-testid='retake-row'][data-task="${task!.id}"]`);
    await row2.locator('button:has-text("일정")').first().click();
    const when = new Date(Date.now() + 2 * 86400e3 + 9 * 3600e3);
    const local = `${when.toISOString().slice(0, 10)}T19:00`;
    await row2.locator('input[name="scheduledAt"]').fill(local);
    await row2.locator('input[name="note"]').fill("E2E 보강실");
    await row2.locator('button:has-text("저장")').click();
    await t1.waitForSelector("text=보강 일정을 잡았습니다", { timeout: 10000 });
    await shot(t1, "t1-retake-scheduled");
    const s5 = await login(s5Ctx, "tester.s05@daneobang.dev", "test1234", { width: 390, height: 800 });
    await s5.goto(`${BASE}/learn/retake`);
    const txt = await s5.locator("main").innerText();
    const mmdd = `${when.getUTCMonth() + 1}/${when.getUTCDate()}`;
    expect(txt.includes(mmdd) && txt.includes("E2E 보강실"), `학생05 재시험 화면에 보강 일정(${mmdd}) 없음: ` + txt.slice(0, 200));
    await shot(s5, "s05-retake-scheduled");
    await s5.goto(`${BASE}/learn/grades`);
    expect((await s5.locator("text=History").count()) === 1, "학생 성적 탭 없음");
    await shot(s5, "s05-grades");
    return `보강 ${mmdd} 19:00`;
  });

  // ── 9. 조작 로그 파일 확인
  await check("조작 로그가 log 폴더에 기록됨 (action/api/client/job)", async () => {
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const f = path.join(LOG_DIR, `app-${day}.log`);
    await new Promise((r) => setTimeout(r, 2500)); // 클라이언트 로그 flush 대기
    expect(fs.existsSync(f), "app log 없음: " + f);
    const lines = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const kinds = new Set(lines.map((l) => l.kind));
    for (const k of ["action", "api", "client", "page"]) expect(kinds.has(k), `로그 종류 누락: ${k}`);
    return `${lines.length} lines, kinds=${[...kinds].join(",")}`;
  });

  await browser.close();
  await prisma.$disconnect();
}

main()
  .then(() => finish())
  .catch(() => finish(true));

function finish(failed = false) {
  const summary = { run: RUN, pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, steps: results };
  fs.writeFileSync(path.join(LOG_DIR, `e2e-linked-${RUN}.summary.json`), JSON.stringify(summary, null, 2));
  log(`e2e-linked ${failed ? "FAIL" : "PASS"}`, { pass: summary.pass, fail: summary.fail, screenshots: SHOT_DIR });
  console.log(`\nE2E-LINKED RESULT: ${failed ? "FAIL" : "PASS"} (${summary.pass} pass / ${summary.fail} fail)\nlog: ${LOG_FILE}`);
  process.exit(failed ? 1 : 0);
}
