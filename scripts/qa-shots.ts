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
  // 0. 랜딩
  {
    const ctx = await browser.newContext();
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
    const ctx = await browser.newContext();
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
    await p.click("nav[aria-label='주 메뉴'] a[data-nav='/app/students']");
    await p.waitForURL(/\/app\/students/);
    await p.waitForTimeout(300);
    const activeAfterNav = await p.locator("nav[aria-label='주 메뉴'] a.on").getAttribute("data-nav");
    check("sidebar active follows client navigation", activeAfterNav === "/app/students", `active=${activeAfterNav}`);
    await p.waitForLoadState("networkidle");
    await shot(p, "11-owner-students-dashboard");
    check("heatmap cells link to results", (await p.locator("a[href^='/app/results/'][aria-label*='결과 보기']").count()) > 0);
    check("KPI numbers are rolling counters", (await p.locator("[data-value]").count()) >= 4);
    // 정렬: 평균 헤더 클릭 → 오름차순
    await p.locator("th button.sort-h", { hasText: "평균" }).click();
    await p.waitForTimeout(300);
    const avgs = await p.locator("#students-body tr").evaluateAll((rows) => rows.map((r) => Number(r.getAttribute("data-avg"))).filter((n) => !Number.isNaN(n)));
    check("students table sorts ascending by avg", avgs.every((v, i) => i === 0 || v >= avgs[i - 1]), avgs.join(","));
    await p.click("nav[aria-label='주 메뉴'] a[data-nav='/app/retakes']");
    await p.waitForTimeout(300);
    check("sidebar active → retakes", (await p.locator("nav[aria-label='주 메뉴'] a.on").getAttribute("data-nav")) === "/app/retakes");
    for (const [g, name] of [
      ["school", "12-owner-students-school"],
      ["teacher", "13-owner-students-teacher"],
      ["week", "14-owner-students-week"],
    ]) {
      await p.goto(`${BASE}/app/students?group=${g}&range=12`);
      await p.waitForLoadState("networkidle");
      await shot(p, name);
    }
    // 학생 상세
    await p.goto(`${BASE}/app/students?group=class`);
    const first = p.locator("table.tbl tbody a").first();
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
    const ctx = await browser.newContext();
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
    const ctx = await browser.newContext();
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
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "qa-results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
