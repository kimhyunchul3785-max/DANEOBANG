/* v5.6 E2E: 마감 팝오버 · 미응시 → 마감 늘리기(재활성 + 알림) · 시험 휴지통(복원 · 영구 삭제) · 성적 기준(학생별·학교별·학년별·반별 + ‹ › + 단어장/병합 계보) · 학생 단어장 진도.
   새 DB(시드)에서 실행. 스크린샷·로그: 저장소 루트 log/e2e-v56 */
import { chromium, type Page, type Browser } from "playwright";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "..", "log", "e2e-v56");
fs.mkdirSync(OUT, { recursive: true });
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};
const dbUrl = (() => {
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  return raw.startsWith("file:") && !path.isAbsolute(raw.slice(5)) ? "file:" + path.join(process.cwd(), raw.slice(5).replace(/^\.\//, "")) : raw;
})();
const db = createClient({ url: dbUrl });
const cid = () => "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
const one = async <T>(sql: string, args: (string | number | null)[] = []) => (await db.execute({ sql, args })).rows[0] as unknown as T;
const go = async (p: Page, url: string) => {
  await p.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForLoadState("networkidle");
};
async function login(browser: Browser, email: string, w = 1360, h = 900): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 160)));
  await p.goto(`${BASE}/login/email`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "test1234");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000, waitUntil: "domcontentloaded" });
  return p;
}
const seoulLocal = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16);

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const o = await login(browser, "tester.owner@daneobang.dev");

  // ── 1. 시험 목록: 미완료에는 마감 지난 시험이 없다 · 마감 날짜 → 달력 팝오버 → 바꾸기
  await go(o, "/app/tests");
  const states = await o.locator("[data-testid='exam-row']").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  check("tests: 미완료 has no overdue rows", states.length > 0 && !states.includes("overdue"), states.join(","));
  const dueBtn = o.locator("[data-testid='due-edit']").first();
  check("tests: 마감 cell is a button", (await dueBtn.count()) === 1);
  const rowTitle = await o.locator("[data-testid='exam-row']", { has: dueBtn }).first().getAttribute("data-title").catch(() => null);
  await dueBtn.click();
  await o.waitForSelector("[data-testid='due-popover']");
  check("tests: clicking the date opens the popover with a datetime input", (await o.locator("[data-testid='due-popover-input']").count()) === 1);
  const newDue = new Date(Date.now() + 10 * 86400e3);
  newDue.setUTCSeconds(0, 0);
  await o.fill("[data-testid='due-popover-input']", seoulLocal(newDue));
  await shot(o, "01-due-popover");
  const nBefore = (await one<{ n: number }>(`SELECT count(*) n FROM Notification WHERE title = '시험 마감이 바뀌었어요'`)).n;
  await o.click("[data-testid='due-popover-apply']");
  await o.waitForSelector("text=학생에게 알림을 보냈어요", { timeout: 15000 }).catch(() => {});
  await o.waitForLoadState("networkidle");
  const nAfter = (await one<{ n: number }>(`SELECT count(*) n FROM Notification WHERE title = '시험 마감이 바뀌었어요'`)).n;
  const changed = (await one<{ n: number }>(`SELECT count(*) n FROM Assignment WHERE dueAt LIKE ?`, [newDue.toISOString().slice(0, 16) + "%"])).n;
  check("tests: popover apply updates open assignments and notifies students", Number(changed) > 0 && Number(nAfter) > Number(nBefore), `${changed} changed · +${Number(nAfter) - Number(nBefore)} notes${rowTitle ? ` · ${rowTitle}` : ""}`);

  // ── 2. 마감 지남 탭: 같은 팝오버
  await go(o, "/app/tests?filter=overdue");
  const odStates = await o.locator("[data-testid='exam-row']").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  check("tests: 마감 지남 tab lists overdue exams with a due button", odStates.length > 0 && odStates.every((s) => s === "overdue") && (await o.locator("[data-testid='due-edit']").count()) > 0, odStates.join(","));
  await o.locator("[data-testid='due-edit']").first().click();
  await o.waitForSelector("[data-testid='due-popover']");
  const def = await o.locator("[data-testid='due-popover-input']").inputValue();
  check("tests: overdue popover defaults to a future date (not the past due)", Date.parse(def + ":00+09:00") > Date.now(), def);
  await o.keyboard.press("Escape");

  // ── 3. 성적 · 미응시: [미응시] → "마감기한을 늘릴까요?" → 늘리기 → 재활성 + 알림
  await go(o, "/app/results?filter=overdue");
  const odRows = await o.locator("[data-testid='overdue-row']").count();
  check("overdue: rows with a [미응시] button", odRows > 0 && (await o.locator("[data-testid='overdue-extend']").count()) === odRows, `${odRows}`);
  if (odRows > 0) {
    const student = (await o.locator("[data-testid='overdue-row']").first().locator("td").first().innerText()).trim();
    await o.locator("[data-testid='overdue-extend']").first().click();
    await o.waitForSelector("[data-testid='due-popover']");
    check("overdue: popover asks 마감기한을 늘릴까요?", /마감기한을 늘릴까요\?/.test(await o.locator("[data-testid='due-popover']").innerText()));
    await shot(o, "02-overdue-extend");
    const reNotes = (await one<{ n: number }>(`SELECT count(*) n FROM Notification WHERE title = '시험을 다시 칠 수 있어요'`)).n;
    await o.click("[data-testid='due-popover-apply']");
    await o.waitForFunction((n) => document.querySelectorAll("[data-testid='overdue-row']").length === n - 1, odRows, { timeout: 15000 }).catch(() => {});
    const after = await o.locator("[data-testid='overdue-row']").count();
    const reNotes2 = (await one<{ n: number }>(`SELECT count(*) n FROM Notification WHERE title = '시험을 다시 칠 수 있어요'`)).n;
    check("overdue: 늘리기 → row leaves the list, student notified", after === odRows - 1 && Number(reNotes2) === Number(reNotes) + 1, `${student} · ${odRows}→${after}`);
  }

  // ── 4. 시험 휴지통: 🗑 → 휴지통 탭 → 복원 → 🗑 → 영구 삭제 (배정·응시까지)
  await go(o, "/app/tests?filter=done");
  const doneRow = o.locator("[data-testid='exam-row']").first();
  const title = (await doneRow.getAttribute("data-title")) ?? (await doneRow.locator("a").first().innerText()).trim();
  const exam = await one<{ id: string }>(`SELECT id FROM Exam WHERE title = ? ORDER BY createdAt DESC`, [title]);
  const asgN = (await one<{ n: number }>(`SELECT count(*) n FROM Assignment WHERE examId = ?`, [exam.id])).n;
  o.once("dialog", (d) => d.accept());
  await doneRow.locator("[data-testid='exam-trash']").click();
  await o.waitForFunction((t) => ![...document.querySelectorAll("[data-testid='exam-row']")].some((r) => r.getAttribute("data-title") === t), title, { timeout: 15000 }).catch(() => {});
  check("trash: 🗑 moves the exam out of the list (status archived)", (await one<{ status: string }>(`SELECT status FROM Exam WHERE id = ?`, [exam.id])).status === "archived", title);
  await go(o, "/app/tests?filter=archived");
  const trashRow = o.locator(`[data-testid='exam-row'][data-title='${title}']`);
  check("trash: 휴지통 tab lists it with 복원 · 영구 삭제", (await trashRow.count()) === 1 && (await trashRow.locator("[data-testid='exam-restore']").count()) === 1 && (await trashRow.locator("[data-testid='exam-purge']").count()) === 1);
  await shot(o, "03-exam-trash");
  await trashRow.locator("[data-testid='exam-restore']").click();
  await o.waitForFunction((t) => ![...document.querySelectorAll("[data-testid='exam-row']")].some((r) => r.getAttribute("data-title") === t), title, { timeout: 15000 }).catch(() => {});
  check("trash: 복원 → published again", (await one<{ status: string }>(`SELECT status FROM Exam WHERE id = ?`, [exam.id])).status === "published");
  await go(o, `/app/tests/${exam.id}`);
  o.once("dialog", (d) => d.accept());
  await o.click("[data-testid='exam-trash']");
  await o.waitForFunction(() => /휴지통/.test(document.querySelector("[data-testid='exam-status']")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  check("trash: detail header 🗑 → badge 휴지통", /휴지통/.test(await o.locator("[data-testid='exam-status']").innerText()));
  await go(o, "/app/tests?filter=archived");
  o.once("dialog", (d) => d.accept());
  await o.locator(`[data-testid='exam-row'][data-title='${title}'] [data-testid='exam-purge']`).click();
  await o.waitForFunction((t) => ![...document.querySelectorAll("[data-testid='exam-row']")].some((r) => r.getAttribute("data-title") === t), title, { timeout: 15000 }).catch(() => {});
  const gone = (await one<{ n: number }>(`SELECT count(*) n FROM Exam WHERE id = ?`, [exam.id])).n;
  const asgLeft = (await one<{ n: number }>(`SELECT count(*) n FROM Assignment WHERE examId = ?`, [exam.id])).n;
  check("trash: 영구 삭제 removes the exam and its assignments/attempts", Number(gone) === 0 && Number(asgLeft) === 0, `${asgN} assignments before`);

  // ── 5. 성적 기준
  await go(o, "/app/results");
  check("results: tabs 요약·학생별·학교별·학년별·반별 · no 반별/주간 group seg · no period seg", (await o.locator("[data-testid='results-tabs'] [data-tab]").allInnerTexts()).join("|") === "요약|학생별|학교별|학년별|반별" && (await o.getByRole("tab", { name: "12주" }).count()) === 0 && (await o.getByRole("tab", { name: "주간" }).count()) === 0);
  check("results: no widget explanation copy", !/위젯은 편집에서/.test(await o.locator("main").innerText()));
  await shot(o, "04-results-summary");
  for (const tab of ["school", "grade", "class"]) {
    await go(o, `/app/results?tab=${tab}`);
    const chips = await o.locator("[data-testid='rail-chip']").count();
    const rows = await o.locator("[data-testid='group-row']").count();
    check(`results ${tab}: chip rail (전체 + ${rows} groups) + group table`, chips === rows + 1 && rows > 0, `${chips} chips`);
    await o.locator("[data-testid='rail-chip']").nth(1).click();
    await o.waitForURL(/pick=/, { waitUntil: "domcontentloaded" });
    await o.waitForLoadState("networkidle");
    check(`results ${tab}: picking a chip → group view`, (await o.locator("[data-testid='pick-group-view']").count()) === 1);
    if (tab === "school") await shot(o, "05-results-school-pick");
  }
  await go(o, "/app/results?tab=students");
  const sChips = await o.locator("[data-testid='rail-chip']").count();
  check("results students: one chip per student (+전체)", sChips > 5, `${sChips}`);
  // 좁은 화면: › 로 넘기기
  await o.setViewportSize({ width: 700, height: 900 });
  await o.waitForTimeout(300);
  const before = await o.locator(".chip-rail-track").evaluate((e) => e.scrollLeft);
  check("results: with nothing picked the rail starts at 전체 (scrollLeft 0)", before === 0, String(before));
  await o.click("[data-testid='rail-next']");
  await o.waitForTimeout(700);
  const afterScroll = await o.locator(".chip-rail-track").evaluate((e) => e.scrollLeft);
  check("results: › pages the chip rail", afterScroll > before, `${before}→${afterScroll}`);
  await shot(o, "06-results-rail-700");
  await o.setViewportSize({ width: 1360, height: 900 });
  await o.locator("[data-testid='rail-chip']").nth(1).click();
  await o.waitForURL(/pick=/, { waitUntil: "domcontentloaded" });
  await o.waitForLoadState("networkidle");
  check("results students: picking a student → attempts table + 학생 상세 link", (await o.locator("[data-testid='pick-student-view']").count()) === 1 && (await o.locator("[data-testid='pick-attempts']").count()) === 1);

  // 단어장 기준 + 병합 계보: 원본 단어장으로 만든 시험의 성적이 병합본 기준에도 잡힌다
  const src = await one<{ id: string; academyId: string; createdById: string; title: string }>(`SELECT b.id, b.academyId, b.createdById, b.title FROM VocabBook b JOIN Exam e ON e.bookId = b.id GROUP BY b.id ORDER BY count(e.id) DESC`);
  const mergedId = cid();
  await db.execute({ sql: `INSERT INTO VocabBook (id, academyId, createdById, title, status, mergedFrom, createdAt, updatedAt) VALUES (?, ?, ?, 'E2E 병합본', 'active', ?, datetime('now'), datetime('now'))`, args: [mergedId, src.academyId, src.createdById, JSON.stringify([src.id])] });
  try {
    await go(o, `/app/results?book=${src.id}`);
    const kSrc = await o.locator("[data-testid='widget-pass']").innerText();
    await go(o, `/app/results?book=${mergedId}`);
    const kicker = await o.locator(".kicker").first().innerText();
    const kMerged = await o.locator("[data-testid='widget-pass']").innerText();
    const gradedOf = (s: string) => s.match(/첫 응시 (\d+)건/)?.[1];
    check("results: merged book includes its source's exams (원본 1권 포함 · same graded count)", /원본 1권 포함/.test(kicker) && !!gradedOf(kSrc) && gradedOf(kSrc) === gradedOf(kMerged), `${gradedOf(kSrc)} vs ${gradedOf(kMerged)}`);
    await go(o, `/app/results?book=${src.id}&tab=class`);
    check("results: book filter + 반별 keeps both params", (await o.locator("[data-testid='book-select'] select").inputValue()) === src.id && (await o.locator("[data-testid='results-tabs'] [data-tab='class'].on").count()) === 1);
    await shot(o, "07-results-book");
  } finally {
    await db.execute({ sql: `DELETE FROM VocabBook WHERE id = ?`, args: [mergedId] });
  }

  // ── 6. 학생 상세: 단어장 진도
  const sid = (await one<{ id: string }>(`SELECT st.id FROM Student st JOIN Assignment a ON a.studentId = st.id JOIN Attempt at ON at.assignmentId = a.id GROUP BY st.id ORDER BY count(at.id) DESC`)).id;
  await go(o, `/app/students/${sid}`);
  const prog = o.locator("[data-testid='progress-row']").first();
  const progText = (await prog.count()) ? await prog.innerText() : "";
  check("student: 단어장 진도 card · n / m DAY · % · 다음 DAY", /\d+ \/ \d+ DAY/.test(progText) && /\d+%/.test(progText) && /(다음|완료)/.test(progText), progText.replace(/\s+/g, " ").slice(0, 80));
  check("student: DAY cells rendered", (await o.locator("[data-testid='progress-row'] .pc").count()) > 3);
  await shot(o, "08-student-progress");
  await o.setViewportSize({ width: 390, height: 844 });
  await go(o, `/app/students/${sid}`);
  const ov = await o.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("student 390px: no horizontal overflow", ov <= 0, String(ov));
  await shot(o, "09-student-progress-390");
  await go(o, "/app/results?tab=class");
  const ov2 = await o.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("results 390px: no horizontal overflow", ov2 <= 0, String(ov2));
  await shot(o, "10-results-390");

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(fails.length ? 1 : 0);
})();
