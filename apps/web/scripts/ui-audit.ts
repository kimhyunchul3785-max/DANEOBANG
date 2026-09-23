/* UI QA 캡처: 역할별 주요 화면을 데스크톱/모바일 폭으로 촬영 (BASE_URL, QA_OUT, CHROME_PATH) */
import { chromium, type BrowserContext } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "..", "log", "ui-audit");
fs.mkdirSync(OUT, { recursive: true });

async function login(ctx: BrowserContext, email: string) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "test1234");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  if (!p.url().includes("/app") && !p.url().includes("/learn")) {
    await p.goto(`${BASE}/workspaces`);
    await p.locator("button, a").filter({ hasText: "들어가기" }).first().click({ timeout: 60000 });
    await p.waitForURL(/\/app/, { timeout: 60000 });
  }
  return p;
}

const PAGES: Record<string, string[]> = {
  owner: ["/app", "/app/tests", "/app/tests/new", "/app/results", "/app/retakes", "/app/students", "/app/classes", "/app/vocabulary", "/app/scans", "/app/teachers", "/app/settings"],
  student: ["/learn", "/learn/grades", "/learn/practice", "/learn/retake", "/learn/paper"],
};
const USERS: Record<string, string> = { owner: "tester.owner@daneobang.dev", student: "tester.s04@daneobang.dev" };
const only = process.argv[2]?.split(",");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const [vp, size] of [["d", { width: 1360, height: 900 }], ["m", { width: 390, height: 844 }]] as const) {
    for (const role of Object.keys(PAGES)) {
      const ctx = await browser.newContext({ viewport: size });
      const p = await login(ctx, USERS[role]);
      console.log(role, vp, "after login:", p.url());
      for (const url of PAGES[role]) {
        const name = `${vp}-${role}${url.replace(/\//g, "_")}`;
        if (only && !only.some((o) => name.includes(o))) continue;
        await p.goto(BASE + url);
        await p.waitForLoadState("networkidle").catch(() => {});
        await p.waitForTimeout(1200);
        await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
        await p.screenshot({ path: path.join(OUT, `${name}.top.png`), clip: { x: 0, y: 0, width: size.width, height: Math.min(1400, await p.evaluate(() => document.body.scrollHeight)) } });
        console.log("shot", name);
      }
      await ctx.close();
    }
  }
  await browser.close();
})();
