/* 역할별 화면 스크린샷 + 핵심 IA 검증 (사이드바 활성 상태, 선생님 설정 차단, 랜딩 정리) */
import { chromium, type Page, type BrowserContext } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "log", "qa");
fs.mkdirSync(OUT, { recursive: true });
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};

async function login(ctx: BrowserContext, email: string, viewport = { width: 1360, height: 900 }) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test1234");
  await page.click('button:has-text("로그인")');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  return page;
}
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(1400); // 진입 모션(롤링 숫자·차트) 완료 후 촬영
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  // 모든 페이지의 JS 오류(하이드레이션 불일치 등)를 모아 마지막에 검사
  const pageErrors: string[] = [];
  const newCtx = async (label: string, opts?: Parameters<typeof browser.newContext>[0]) => {
    const c = await browser.newContext(opts);
    c.on("page", (pg) => pg.on("pageerror", (e) => pageErrors.push(`[${label}] ${pg.url()} :: ${e.message.slice(0, 90)}`)));
    return c;
  };
  // 0. 랜딩
  {
    const ctx = await newCtx("landing");
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1360, height: 900 });
    await p.goto(BASE);
    await shot(p, "00-landing");
    const text = await p.locator("main").innerText();
    check("landing has no feature cards / description", !text.includes("학원(테넌트)") && !text.includes("HWPX/DOCX/PDF"));
    await ctx.close();
  }
  // 1. 학원장
  {
    const ctx = await newCtx("owner");
    const p = await login(ctx, "tester.owner@daneobang.dev");
    if (!p.url().includes("/app")) {
      await p.goto(`${BASE}/workspaces`);
      await p.click("text=테스트학원");
      await p.waitForURL(/\/app/);
    }
    await p.goto(`${BASE}/app`);
    await p.waitForLoadState("networkidle");
    await shot(p, "10-owner-overview");
    const nav = await p.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
    check("owner sees Teachers + Setup", nav.some((t) => t.includes("선생님")) && nav.some((t) => t.includes("학원 설정")), nav.join(" | "));
    // 사이드바 활성: 클라이언트 내비게이션 후 즉시 반영
    await p.click("nav[aria-label='주 메뉴'] a[data-nav='/app/results']");
    await p.waitForURL(/\/app\/results/);
    await p.waitForTimeout(300);
    const activeAfterNav = await p.locator("nav[aria-label='주 메뉴'] a.on").getAttribute("data-nav");
    check("sidebar active follows client navigation", activeAfterNav === "/app/results", `active=${activeAfterNav}`);
    await p.waitForLoadState("networkidle");
    await shot(p, "11-owner-results-dashboard");
    check("results tab = at-a-glance dashboard + detail list", (await p.locator("text=Group ·").count()) > 0 && (await p.locator("#results-body").count()) === 1);
    check("heatmap cells link to results", (await p.locator("a[href^='/app/results/'][aria-label*='결과 보기']").count()) > 0);
    check("KPI numbers are rolling counters", (await p.locator("[data-value]").count()) >= 4);
    // 정렬: 평균 헤더 클릭 → 오름차순
    await p.locator("th button.sort-h", { hasText: "평균" }).first().click();
    await p.waitForTimeout(300);
    const avgs = await p.locator("#students-body tr").evaluateAll((rows) => rows.map((r) => Number(r.getAttribute("data-avg"))).filter((n) => !Number.isNaN(n)));
    check("students table sorts ascending by avg", avgs.every((v, i) => i === 0 || v >= avgs[i - 1]), avgs.join(","));
    await p.click("nav[aria-label='주 메뉴'] a[data-nav='/app/retakes']");
    await p.waitForTimeout(300);
    check("sidebar active → retakes", (await p.locator("nav[aria-label='주 메뉴'] a.on").getAttribute("data-nav")) === "/app/retakes");
    await p.goto(`${BASE}/login`);
    await p.waitForLoadState("networkidle");
    check("login shows Google + Kakao buttons", (await p.locator("a[data-provider='google']").count()) === 1 && (await p.locator("a[data-provider='kakao']").count()) === 1);
    check("logo image on login", (await p.locator("img[alt='단어방']").count()) >= 1);
    for (const [g, name] of [
      ["school", "12-owner-results-school"],
      ["teacher", "13-owner-results-teacher"],
      ["week", "14-owner-results-week"],
    ]) {
      await p.goto(`${BASE}/app/results?group=${g}&range=12`);
      await p.waitForLoadState("networkidle");
      await shot(p, name);
    }
    // 학생 탭 = 명단 관리: 양식 내려받기 · 엑셀 업로드 · 반 이동 · 삭제 · 반 관리
    await p.goto(`${BASE}/app/students`);
    await p.waitForLoadState("networkidle");
    await shot(p, "14b-owner-students-roster");
    check("students tab = roster with bulk bar + class panel", (await p.locator("[data-testid='bulk-bar']").count()) === 1 && (await p.locator("[data-testid='class-row']").count()) > 0);
    const tpl = await ctx.request.get(`${BASE}/api/files/roster-template`);
    check("roster template downloads as xlsx", tpl.status() === 200 && (tpl.headers()["content-type"] ?? "").includes("spreadsheetml"), String(tpl.status()));
    // 업로드용 엑셀 생성 (시트 = 반)
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("QA반");
    ws.addRow(["이름", "학교", "학년(예: 고1)"]);
    ws.addRow(["QA 학생1", "한빛고", "고1"]);
    ws.addRow(["QA 학생2", "중앙고", "고2"]);
    const xlsxPath = path.join(OUT, "roster-qa.xlsx");
    await wb.xlsx.writeFile(xlsxPath);
    await p.setInputFiles('input[type="file"][accept=".xlsx"]', xlsxPath);
    await p.click('button:has-text("업로드 · 학생 등록")');
    await p.waitForSelector("text=2명 등록", { timeout: 15000 });
    await p.waitForLoadState("networkidle");
    {
      await p.locator("a.chip", { hasText: "QA반" }).first().waitFor({ timeout: 15000 }).catch(() => {}); // router.refresh 반영 대기
      const chips = await p.locator("a.chip", { hasText: "QA반" }).count();
      const rows = await p.locator("#roster-body tr", { hasText: "QA 학생1" }).count();
      check("xlsx upload registered students into new class", chips === 1 && rows === 1, `chip=${chips} row=${rows} url=${p.url()}`);
    }
    // 선택 → 반 없음으로 이동 → 삭제
    await p.locator("#roster-body tr", { hasText: "QA 학생1" }).locator("input[type=checkbox]").check();
    await p.locator("#roster-body tr", { hasText: "QA 학생2" }).locator("input[type=checkbox]").check();
    await p.locator("[data-testid='bulk-bar'] select").first().selectOption("");
    await p.click("[data-testid='bulk-bar'] button:has-text('반 이동')");
    await p.waitForSelector("text=반 없음으로 변경", { timeout: 10000 });
    await p.waitForFunction(() => !Array.from(document.querySelectorAll("#roster-body tr")).some((tr) => tr.textContent?.includes("QA 학생1") && tr.textContent?.includes("QA반")), null, { timeout: 15000 }).catch(() => {});
    await p.waitForLoadState("networkidle");
    const moved = await p.locator("#roster-body tr", { hasText: "QA 학생1" }).innerText();
    check("bulk move to no-class", !moved.includes("QA반"), moved.replace(/\s+/g, " ").slice(0, 60));
    await p.locator("#roster-body tr", { hasText: "QA 학생1" }).locator("input[type=checkbox]").check();
    await p.locator("#roster-body tr", { hasText: "QA 학생2" }).locator("input[type=checkbox]").check();
    p.once("dialog", (d) => d.accept());
    await p.click("[data-testid='bulk-bar'] button:has-text('삭제')");
    await p.waitForSelector("text=2명을 삭제", { timeout: 10000 });
    await p.locator("#roster-body tr", { hasText: "QA 학생" }).first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await p.waitForLoadState("networkidle");
    check("bulk delete (owner)", (await p.locator("#roster-body tr", { hasText: "QA 학생" }).count()) === 0);
    // 빈 반 삭제
    const qaRow = p.locator("[data-testid='class-row']", { hasText: "QA반" });
    if (await qaRow.count()) {
      p.once("dialog", (d) => d.accept());
      await qaRow.locator("button:has-text('삭제')").click();
      await p.waitForTimeout(800);
    }
    await shot(p, "14c-owner-students-after-bulk");
    // 학생 상세
    await p.goto(`${BASE}/app/students`);
    const first = p.locator("#roster-body a").first();
    await first.click();
    await p.waitForURL(/\/app\/students\/[a-z0-9]+/);
    await p.waitForLoadState("networkidle");
    await shot(p, "15-owner-student-detail");
    check("student detail has trend + weak words", (await p.locator("text=Trend").count()) > 0 && (await p.locator("text=Weak words").count()) > 0);
    await p.goto(`${BASE}/app/teachers`);
    await p.waitForLoadState("networkidle");
    await shot(p, "16-owner-teachers");
    await p.goto(`${BASE}/app/settings`);
    await p.waitForLoadState("networkidle");
    await shot(p, "17-owner-settings");
    check("settings no member table for owner page (moved to teachers)", (await p.locator("text=구성원").count()) === 0);
    await ctx.close();
  }
  // 2. 선생님
  {
    const ctx = await newCtx("teacher");
    const p = await login(ctx, "tester.t1@daneobang.dev");
    await p.goto(`${BASE}/app`);
    await p.waitForLoadState("networkidle");
    await shot(p, "20-teacher-today");
    check("teacher today has rotating student list", (await p.locator("[data-testid='student-rotator']").count()) === 1);
    const nav = await p.locator("nav[aria-label='주 메뉴'] a").allInnerTexts();
    check("teacher does NOT see Teachers/Setup", !nav.some((t) => t.includes("학원 설정")) && !nav.some((t) => t.includes("선생님")), nav.join(" | "));
    await p.goto(`${BASE}/app/settings`);
    await p.waitForLoadState("networkidle");
    check("teacher /app/settings redirects", !p.url().includes("/app/settings"), p.url());
    await p.goto(`${BASE}/app/teachers`);
    check("teacher /app/teachers redirects", !p.url().includes("/app/teachers"), p.url());
    await p.goto(`${BASE}/app/vocabulary`);
    await p.waitForLoadState("networkidle");
    await p.hover(".tip-i");
    await p.waitForTimeout(300);
    check("upload tooltip shows on hover", await p.locator(".tip-box").isVisible());
    await shot(p, "21-teacher-vocabulary");
    check("no manual add-words UI", (await p.locator("text=직접 입력").count()) === 0);
    check("dropzone present", (await p.locator(".dropzone").count()) === 1);
    // 번호형 단어장 열기
    await p.click("text=다이제보카");
    await p.waitForURL(/\/app\/vocabulary\/[a-z0-9]+/);
    await p.waitForLoadState("networkidle");
    await shot(p, "22-teacher-book-daysplit");
    check("book page has DAY split panel", (await p.locator("[data-testid='day-split']").count()) === 1);
    const chips = await p.locator("[role='tablist'][aria-label='DAY'] a").count();
    check("numbered book split into 7 DAYs by default", chips === 7, `chips=${chips}`);
    // DAY 재분할: 지문별
    await p.click("[data-testid='day-split'] button:has-text('지문별')");
    await p.click("[data-testid='day-split'] button:has-text('적용')");
    await p.waitForTimeout(1500);
    await p.waitForLoadState("networkidle");
    const chips2 = await p.locator("[role='tablist'][aria-label='DAY'] a").count();
    check("resplit by passage → 18 DAYs", chips2 === 18, `chips=${chips2}`);
    await shot(p, "23-teacher-book-by-passage");
    await p.click("[data-testid='day-split'] button:has-text('일수')");
    await p.click("[data-testid='day-split'] button:has-text('적용')");
    await p.waitForTimeout(1500);
    await p.waitForLoadState("networkidle");
    check("resplit back to 7 DAYs", (await p.locator("[role='tablist'][aria-label='DAY'] a").count()) === 7);
    // 출제 1화면
    await p.click("text=DAY 1 시험 만들기");
    await p.waitForURL(/\/app\/tests\/new/);
    await p.waitForTimeout(1200);
    await shot(p, "24-teacher-compose");
    check("compose preselects DAY 1", (await p.locator("label.chip.on").count()) >= 1);
    await p.click("label.chip:has-text('테스트 A반')");
    await p.waitForTimeout(800);
    const previewItems = await p.locator("ol").count();
    check("compose shows preview items", previewItems >= 1, `items=${previewItems}`);
    await p.click("button:has-text('발행 ·')");
    await p.waitForURL(/\/app\/tests\/[a-z0-9]+\?published=1/, { timeout: 30000 });
    check("publish+assign in one click", p.url().includes("assigned=5"), p.url());
    await shot(p, "25-teacher-exam-published");
    await p.goto(`${BASE}/app/retakes`);
    await p.waitForLoadState("networkidle");
    await shot(p, "26-teacher-retakes");
    check("retake queue rows", (await p.locator("[data-testid='retake-row']").count()) > 0);
    await p.locator("button.sort-h", { hasText: "점수순" }).click();
    await p.waitForTimeout(300);
    const sc = await p.locator("#retake-queue > li").evaluateAll((rows) => rows.map((r) => Number(r.getAttribute("data-score"))).filter((n) => !Number.isNaN(n)));
    check("retake queue sorts ascending by score", sc.every((v, i) => i === 0 || v >= sc[i - 1]), sc.slice(0, 8).join(","));
    await p.goto(`${BASE}/app/results`);
    await p.waitForLoadState("networkidle");
    await p.locator("th button.sort-h", { hasText: "점수" }).click();
    await p.waitForTimeout(300);
    const rs = await p.locator("#results-body > tr").evaluateAll((rows) => rows.map((r) => Number(r.getAttribute("data-score"))).filter((n) => !Number.isNaN(n)));
    check("results table sorts ascending by score", rs.every((v, i) => i === 0 || v >= rs[i - 1]), rs.slice(0, 8).join(","));
    await shot(p, "27-teacher-results-sorted");
    await ctx.close();
  }
  // 3. 학생
  {
    const ctx = await newCtx("student");
    const p = await login(ctx, "tester.s05@daneobang.dev", { width: 420, height: 900 });
    await p.goto(`${BASE}/learn`);
    await p.waitForLoadState("networkidle");
    await shot(p, "30-student-home");
    check("student home shows week + retake pill", (await p.locator("text=This week").count()) > 0 && (await p.locator("text=Retake").count()) > 0);
    await p.click("nav[aria-label='학생 메뉴'] a[href='/learn/grades']");
    await p.waitForURL(/\/learn\/grades/);
    await p.waitForLoadState("networkidle");
    await shot(p, "31-student-grades");
    check("student grades has history", (await p.locator("text=History").count()) > 0);
    await p.click("nav[aria-label='학생 메뉴'] a[href='/learn/retake']");
    await p.waitForURL(/\/learn\/retake/);
    await p.waitForLoadState("networkidle");
    await shot(p, "32-student-retake");
    const txt = await p.locator("main").innerText();
    check("student retake shows scheduled date or pending", /scheduled|pending|예정된 재시험이 없습니다/i.test(txt));
    await p.click("nav[aria-label='학생 메뉴'] a[href='/learn/paper']");
    await p.waitForURL(/\/learn\/paper/);
    await p.waitForLoadState("networkidle");
    await shot(p, "33-student-paper");
    check("student paper tab has photo submit", (await p.locator("[data-testid='submit-photo']").count()) === 1);
    check("student header has notification bell", (await p.locator("[data-testid='bell']").count()) === 1);
    const paperTxt = await p.locator("main").innerText();
    check("student paper copy is short", !paperTxt.includes("QR 로 어느 시험인지") && paperTxt.includes("다 풀었으면"));

    // History → 시험지 → 틀린 문항(스피커) → 틀린 단어 연습(random)
    await p.goto(`${BASE}/learn/grades`);
    await p.waitForLoadState("networkidle");
    const hist = p.locator("section:has-text('History') li a").first();
    await hist.click();
    await p.waitForURL(/\/learn\/results\//);
    await p.waitForLoadState("networkidle");
    await shot(p, "34-student-result-wrong-items");
    const resultTxt = await p.locator("main").innerText();
    check("student result shows wrong items immediately", /WRONG/.test(resultTxt) && (await p.locator("[data-testid='speak']").count()) > 0, resultTxt.match(/\d+ WRONG/)?.[0]);
    const practiceLink = p.locator("[data-testid='practice-link']");
    check("student result has practice link", (await practiceLink.count()) === 1);
    await practiceLink.click();
    await p.waitForURL(/\/learn\/practice\//);
    await p.waitForSelector("[data-testid='practice'] button.tile", { timeout: 15000 });
    await shot(p, "35-student-practice-question");
    check("practice: 4 options + speaker + no tabs", (await p.locator("[data-testid='practice'] button.tile").count()) === 4 && (await p.locator("[data-testid='practice'] [data-testid='speak']").count()) === 1 && (await p.locator("nav[aria-label='학생 메뉴']").count()) === 0);
    await p.locator("[data-testid='practice'] button.tile").nth(1).click();
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, "36-student-practice-feedback.png"), fullPage: true }); // 정답 표시 순간 (자동 넘어가기 전)
    const fb = await p.locator("[data-testid='practice']").innerText();
    check("practice: instant feedback", /CORRECT|WRONG/.test(fb));
    // 한→영 모드 전환
    await p.waitForTimeout(1500);
    await p.click("[role='tab']:has-text('한 → 영')");
    await p.waitForSelector("[data-testid='practice'] button.tile", { timeout: 10000 });
    await shot(p, "37-student-practice-ko2en");
    check("practice: ko→en mode switches", (await p.locator("[role='tab'][aria-selected='true']").innerText()).includes("한"));
    // 전체 틀린 단어 연습 (성적 탭 필)
    await p.goto(`${BASE}/learn/grades`);
    await p.waitForLoadState("networkidle");
    check("grades tab has practice-all pill", (await p.locator("[data-testid='practice-all']").count()) === 1);

    // 온라인 시험 러너: 우측 상단 스피커 (이번 주 시험이 열려 있을 때만)
    await p.goto(`${BASE}/learn`);
    await p.waitForLoadState("networkidle");
    const startBtn = p.locator("button:has-text('응시 시작'), button:has-text('이어서 응시')").first();
    if (await startBtn.count()) {
      await startBtn.click();
      await p.waitForURL(/\/learn\/attempts\//);
      await p.waitForSelector("[data-testid='runner'] button.tile", { timeout: 15000 });
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, "38-student-test-runner.png"), fullPage: true });
      check("test runner has top-right speaker + AUTO toggle", (await p.locator("[data-testid='runner'] [data-testid='speak']").count()) === 1 && (await p.locator("[data-testid='runner'] button:has-text('AUTO')").count()) === 1);
      await p.locator("[data-testid='runner'] button.tile").first().click();
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, "38b-student-test-runner-next.png"), fullPage: true });
    } else {
      check("test runner has top-right speaker + AUTO toggle", true, "skipped: no open exam for tester.s05");
    }
    await ctx.close();
  }
  // 4. 학생 앱 · 웹(데스크톱) 화면 — 같은 화면이 가운데 정렬로 보인다
  {
    const ctx = await newCtx("web-student");
    const p = await login(ctx, "tester.s04@daneobang.dev", { width: 1360, height: 900 });
    await p.goto(`${BASE}/learn`);
    await p.waitForLoadState("networkidle");
    await shot(p, "40-web-student-home");
    await p.goto(`${BASE}/learn/practice`);
    await p.waitForSelector("[data-testid='practice'] button.tile, [data-testid='practice'] .card", { timeout: 15000 });
    await shot(p, "41-web-student-practice-all");
    check("web(desktop) student practice-all renders", (await p.locator("[data-testid='practice']").count()) === 1);
    await ctx.close();
  }
  // 5. 휴대폰 브라우저 (390×844) · 선생님/학원장 화면 — 가로 스크롤 없이 맞는지
  {
    const ctx = await newCtx("mobile-owner", { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await login(ctx, "tester.owner@daneobang.dev", { width: 390, height: 844 });
    if (!p.url().includes("/app")) {
      await p.goto(`${BASE}/workspaces`);
      await p.click("text=테스트학원");
      await p.waitForURL(/\/app/);
    }
    const pages: [string, string][] = [
      ["/app", "50-mobile-owner-overview"],
      ["/app/results", "51-mobile-owner-results"],
      ["/app/students", "52-mobile-owner-students"],
      ["/app/tests/new", "53-mobile-teacher-compose"],
      ["/app/vocabulary", "54-mobile-teacher-vocabulary"],
      ["/app/retakes", "55-mobile-teacher-retakes"],
    ];
    for (const [url, name] of pages) {
      await p.goto(`${BASE}${url}`);
      await p.waitForLoadState("networkidle");
      await shot(p, name);
      const over = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      check(`mobile ${url} fits width (no horizontal page scroll)`, over.sw <= over.cw + 1, `${over.sw}/${over.cw}`);
    }
    const nav = await p.locator("nav[aria-label='주 메뉴'] a").count();
    check("mobile teacher nav is present (horizontal)", nav >= 6);
    await ctx.close();
  }
  // 6. 휴대폰 브라우저 · 학생 앱 (390×844, 터치)
  {
    const ctx = await newCtx("mobile-student", { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await login(ctx, "tester.s02@daneobang.dev", { width: 390, height: 844 });
    await p.goto(`${BASE}/learn`);
    await p.waitForLoadState("networkidle");
    await shot(p, "60-mobile-student-home");
    await p.goto(`${BASE}/learn/grades`);
    await p.waitForLoadState("networkidle");
    await shot(p, "61-mobile-student-grades");
    await p.goto(`${BASE}/learn/practice`);
    await p.waitForSelector("[data-testid='practice'] button.tile, [data-testid='practice'] .card", { timeout: 15000 });
    await shot(p, "62-mobile-student-practice");
    for (const url of ["/learn", "/learn/grades", "/learn/practice", "/learn/paper"]) {
      await p.goto(`${BASE}${url}`);
      await p.waitForLoadState("networkidle");
      const over = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      check(`mobile ${url} fits width`, over.sw <= over.cw + 1, `${over.sw}/${over.cw}`);
    }
    await ctx.close();
  }
  check("no page errors (hydration mismatch, runtime)", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await browser.close();
  fs.writeFileSync(path.join(OUT, "qa-results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
