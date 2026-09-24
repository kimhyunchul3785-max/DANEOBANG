/* 페이지별 시각 QA: 역할별 주요 화면을 데스크톱(1360)·휴대폰(390)으로 전부 촬영하고
   가로 넘침·잘린 글자·런타임 오류를 자동으로 잡는다. 결과: 저장소 루트 log/qa-visual/ (스크린샷 + report.json) */
import { chromium, type Page, type BrowserContext, type Browser } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "..", "log", "qa-visual");
fs.mkdirSync(OUT, { recursive: true });

type Finding = { page: string; viewport: string; kind: string; detail: string };
const findings: Finding[] = [];
const shots: string[] = [];

async function login(browser: Browser, email: string, viewport: { width: number; height: number }, mobile = false): Promise<[Page, BrowserContext]> {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login/email`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', email.startsWith("tester.") ? "test1234" : "password");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  return [p, ctx];
}

/** 화면 촬영 + 자동 검사 */
async function inspect(p: Page, name: string, viewport: string, errors: string[]) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(1300); // 진입 모션(카운터·차트) 끝난 뒤
  const file = `${name}--${viewport}.png`;
  await p.screenshot({ path: path.join(OUT, file), fullPage: true });
  shots.push(file);
  const r = await p.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > doc.clientWidth + 1 ? `${doc.scrollWidth}/${doc.clientWidth}` : "";
    // 글자가 잘리는 요소: 한 줄(nowrap)인데 내용이 넘치고 ellipsis 도 없는 경우
    const clipped: string[] = [];
    // 화면 밖으로 나간 요소
    const outside: string[] = [];
    const vw = doc.clientWidth;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > vw + 1 && cs.position !== "fixed" && !el.closest("[data-qa-ignore]")) {
        if (outside.length < 6) outside.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} right=${Math.round(rect.right)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      }
      if (cs.whiteSpace === "nowrap" && cs.overflow === "visible" && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && (el.textContent ?? "").trim().length > 0) {
        if (clipped.length < 6) clipped.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    // 터치 대상이 너무 작은 버튼·링크 (휴대폰 기준 32px 미만)
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href]"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height < 24 && (el.textContent ?? "").trim().length > 0 && small.length < 6) small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" h=${Math.round(rect.height)}`);
    }
    return { overflowX, clipped, outside, small, title: document.title };
  });
  if (r.overflowX) findings.push({ page: name, viewport, kind: "가로 넘침", detail: r.overflowX });
  for (const c of r.clipped) findings.push({ page: name, viewport, kind: "글자 잘림(nowrap)", detail: c });
  for (const o of r.outside) findings.push({ page: name, viewport, kind: "화면 밖 요소", detail: o });
  if (viewport === "mobile") for (const s of r.small) findings.push({ page: name, viewport, kind: "터치 대상 작음(<24px)", detail: s });
  for (const e of errors.splice(0)) findings.push({ page: name, viewport, kind: "런타임 오류", detail: e });
  console.log(`shot ${file}${r.overflowX ? "  OVERFLOW " + r.overflowX : ""}${r.clipped.length ? "  clipped×" + r.clipped.length : ""}${r.outside.length ? "  outside×" + r.outside.length : ""}`);
}

const firstHref = async (p: Page, selector: string) => (await p.locator(selector).first().getAttribute("href").catch(() => null)) ?? null;

async function sweep(browser: Browser, label: string, email: string | null, mobile: boolean, routes: (string | ((p: Page) => Promise<string | null>))[]) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1360, height: 900 };
  const vp = mobile ? "mobile" : "desktop";
  const errors: string[] = [];
  let p: Page, ctx: BrowserContext;
  if (email) [p, ctx] = await login(browser, email, viewport, mobile);
  else {
    ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    p = await ctx.newPage();
  }
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/favicon|404|hydrat|418|Failed to load resource/i.test(m.text())) errors.push("console: " + m.text().slice(0, 120));
  });
  for (const r of routes) {
    const url = typeof r === "string" ? r : await r(p);
    if (!url) continue;
    await p.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" }).catch((e) => errors.push("goto: " + String(e).slice(0, 80)));
    const name = `${label}-${url.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "") || "root"}`;
    await inspect(p, name, vp, errors);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const mobile of [false, true]) {
    // 비로그인
    await sweep(browser, "pub", null, mobile, ["/", "/login", "/login/email", "/join"]);
    // 학원장 (선생님 화면 + 선생님·설정)
    await sweep(browser, "owner", "tester.owner@daneobang.dev", mobile, [
      "/app",
      "/app/students",
      async (p) => (await p.goto(`${BASE}/app/students`), firstHref(p, "#roster-body a[href^='/app/students/']")),
      "/app/classes",
      "/app/vocabulary",
      async (p) => (await p.goto(`${BASE}/app/vocabulary`), firstHref(p, "a[href^='/app/vocabulary/']:not([href*='/imports/']):not([href$='/new-test'])")),
      async (p) => (await p.goto(`${BASE}/app/vocabulary`), firstHref(p, "a[href^='/app/vocabulary/'][href$='/new-test']")),
      async (p) => (await p.goto(`${BASE}/app/vocabulary`), firstHref(p, "a[href^='/app/vocabulary/imports/']")),
      async (p) => {
        // 병합: 활성 단어장 앞의 두 개
        await p.goto(`${BASE}/app/vocabulary`);
        const ids = (await p.locator("a[href^='/app/vocabulary/'][href$='/new-test']").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")?.split("/")[3] ?? ""))).filter(Boolean).slice(0, 2);
        return ids.length === 2 ? `/app/vocabulary/merge?ids=${ids.join(",")}` : null;
      },
      "/app/tests",
      "/app/tests/new",
      async (p) => (await p.goto(`${BASE}/app/tests`), firstHref(p, "a[href^='/app/tests/']:not([href$='/new']):not([href$='/scans'])")),
      async (p) => {
        await p.goto(`${BASE}/app/tests`);
        const h = await firstHref(p, "a[href^='/app/tests/']:not([href$='/new']):not([href$='/scans'])");
        return h ? `${h.split("?")[0]}/items` : null;
      },
      async (p) => {
        await p.goto(`${BASE}/app/tests`);
        const h = await firstHref(p, "a[href^='/app/tests/']:not([href$='/new']):not([href$='/scans'])");
        return h ? `${h.split("?")[0]}/targets` : null;
      },
      "/app/tests?filter=draft",
      "/app/tests/scans",
      "/app/results",
      "/app/results?tab=students",
      "/app/results?tab=exams",
      async (p) => (await p.goto(`${BASE}/app/results?tab=exams`), firstHref(p, "a[href^='/app/results/']")),
      "/app/retakes",
      "/app/teachers",
      "/app/settings",
      "/app/billing",
      "/switch",
    ]);
    // 선생님 (담당 학생만 · 하단 탭 바)
    await sweep(browser, "teacher", "tester.t1@daneobang.dev", mobile, ["/app", "/app/students", "/app/tests", "/app/retakes", "/app/tests/scans"]);
    // 학생
    await sweep(browser, "student", "tester.s01@daneobang.dev", mobile, [
      "/learn",
      "/learn/grades",
      async (p) => (await p.goto(`${BASE}/learn/grades`), firstHref(p, "a[href^='/learn/results/']")),
      "/learn/retake",
      "/learn/practice",
      "/learn/paper",
    ]);
    // 플랫폼 관리자
    await sweep(browser, "admin", "tester.admin@daneobang.dev", mobile, ["/admin", "/admin/academies", "/admin/users", "/admin/jobs"]);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ shots, findings }, null, 2));
  console.log(`\n${shots.length} shots · ${findings.length} findings → ${OUT}`);
  for (const f of findings) console.log(`  [${f.viewport}] ${f.page} · ${f.kind}: ${f.detail}`);
})();
