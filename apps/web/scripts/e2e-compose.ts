/* 출제 흐름 E2E (v4.7): 업로드(새 폼) → 출제(기본 시작=지금·마감=7일 뒤) → 시험 상세 3단계 → 대상 추가 → 학생 앱 응시 시작
   → 예약 시작(학생은 대기) → 초안만 저장 → 검증(마감<시작 거부). 스크린샷·로그: 저장소 루트 log/e2e-compose */
import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "..", "log", "e2e-compose");
fs.mkdirSync(OUT, { recursive: true });
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};
const dbUrl = (() => {
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  return raw.startsWith("file:") && !path.isAbsolute(raw.slice(5)) ? "file:" + path.join(process.cwd(), raw.slice(5).replace(/^\.\//, "")) : raw;
})();
const db = createClient({ url: dbUrl });

async function login(browser: Browser, email: string, w = 1360, h = 900, mobile = false): Promise<[Page, BrowserContext]> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 120)));
  await p.goto(`${BASE}/login/email`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', email.startsWith("tester.") ? "test1234" : "password");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000, waitUntil: "domcontentloaded" });
  return [p, ctx];
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const t0 = Date.now();
  const [t] = await login(browser, "tester.t1@daneobang.dev");

  // ── 1. 업로드 (새 폼): 파일 고르기 → 상태 읽기 → 취소 → 다시 고르기 → 이어 붙이기 목록 → 업로드 → import 화면 → 단어장
  await db.execute(`UPDATE VocabBook SET status = 'archived' WHERE title = 'sample' AND status = 'active'`); // 이전 실행분 정리 (같은 파일 재업로드 안내를 피함)
  await t.goto(`${BASE}/app/vocabulary`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  check("upload: state reads READY before pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "READY");
  check("upload: submit disabled before pick", await t.locator("[data-testid='upload-submit']").isDisabled());
  await t.setInputFiles("input[type=file][name=file]", "fixtures/legacy.hwp");
  await t.waitForTimeout(200);
  check("upload: .hwp is flagged + submit stays disabled", (await t.locator("[data-testid='dropzone']").innerText()).includes("HWPX") && (await t.locator("[data-testid='upload-submit']").isDisabled()));
  await t.click("[data-testid='dropzone-clear']");
  check("upload: × clears the pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "READY");
  await t.click("[data-testid='mode-append']");
  const rows = await t.locator("[data-testid='book-pick-row']").count();
  check("upload: append mode lists books with words·DAY (no native select)", rows >= 1 && (await t.locator("[data-testid='book-pick'] select").count()) === 0 && /W · DAY/.test(await t.locator("[data-testid='book-pick']").innerText()), `rows=${rows}`);
  await t.click("[data-testid='mode-new']");
  await t.setInputFiles("input[type=file][name=file]", "fixtures/sample.docx");
  await t.waitForTimeout(200);
  check("upload: state reads 1 FILE after pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "1 FILE");
  await shot(t, "01-upload-picked");
  await t.click("[data-testid='upload-submit']");
  // 분석이 빠르면 import 화면을 거쳐 곧바로 단어장으로 넘어간다
  await t.waitForURL(/\/app\/(imports|vocabulary)\/[a-z0-9]+/, { timeout: 90000, waitUntil: "domcontentloaded" });
  await t.waitForURL(/\/app\/vocabulary\/[a-z0-9]+/, { timeout: 60000, waitUntil: "domcontentloaded" }).catch(() => {});
  check("upload: docx → import → auto-open book", /\/app\/vocabulary\/[a-z0-9]+/.test(t.url()), t.url());
  await shot(t, "02-upload-book");
  // 같은 파일을 새 단어장으로 또 올리면 → 이미 있는 단어장으로 안내 (중복 생성 방지)
  await t.goto(`${BASE}/app/vocabulary`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  await t.setInputFiles("input[type=file][name=file]", "fixtures/sample.docx");
  await t.click("[data-testid='upload-submit']");
  await t.waitForSelector("[data-testid='upload-error']", { timeout: 20000 });
  check("upload: re-uploading the same file → points to the existing book instead of duplicating", /이미 '.+' 단어장으로 저장/.test(await t.locator("[data-testid='upload-error']").innerText()) && (await t.locator("[data-testid='upload-existing-link']").count()) === 1);
  await shot(t, "02b-upload-duplicate");

  // ── 2. 출제: DAY 1 + 테스트 A반, 기본 시작=지금·마감=7일 뒤
  await t.goto(`${BASE}/app/tests/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  await t.getByRole("button", { name: "테스트 단어장", exact: true }).click();
  await t.click("label.chip[data-day='14']");
  await t.click("label.chip:has-text('테스트 A반')");
  await t.waitForTimeout(600);
  // 선생님1 담당은 A반 5명뿐 → B반 칩은 0명·비활성 (예전엔 5로 보였다가 출제하면 0명 배정)
  check("compose(teacher): class chips count only my students (B반 = 0, disabled)", (await t.locator("label.chip[data-class='테스트 B반'] .chip-sub").innerText()).trim() === "0" && (await t.locator("label.chip[data-class='테스트 B반'] input").isDisabled()));
  const dueVal = await t.locator("[data-testid='due-input']").inputValue();
  const nowSeoul = new Date(Date.now() + 9 * 3600e3);
  const expectDue = new Date(nowSeoul.getTime() + 7 * 86400e3).toISOString().slice(0, 13); // 날짜·시(hour)까지 비교
  check("compose: start preset = 지금 (no start input shown)", (await t.locator("[data-testid='start-now'][aria-checked='true']").count()) === 1 && (await t.locator("[data-testid='start-input']").count()) === 0);
  check("compose: due default = +7 days, same hour", dueVal.startsWith(expectDue), `${dueVal} vs ${expectDue}`);
  const bar = await t.locator("[data-testid='compose-bar']").innerText();
  check("compose: bar summarises 시작 지금 · 마감", /시작 지금/.test(bar) && /마감 \d\d\/\d\d/.test(bar), bar.replace(/\s+/g, " ").slice(0, 120));
  // 예약 + 잘못된 마감 → 오류·버튼 비활성 → 되돌리기
  await t.click("[data-testid='start-custom']");
  await t.fill("[data-testid='due-input']", "2026-01-01T09:00");
  check("compose: due before start → inline error + submit disabled", (await t.locator("[data-testid='due-error']").count()) === 1 && (await t.locator("[data-testid='compose-submit']").isDisabled()));
  await t.click("[data-testid='start-now']");
  await t.click("[data-testid='due-week1']");
  check("compose: back to 1주 뒤 clears error", (await t.locator("[data-testid='due-error']").count()) === 0 && !(await t.locator("[data-testid='compose-submit']").isDisabled()));
  await shot(t, "03-compose-ready");
  await t.click("[data-testid='compose-submit']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+\?published=1/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const examId = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  check("compose: publish + assign 5 in one click", t.url().includes("assigned=5"), t.url());
  await t.waitForLoadState("networkidle");
  await shot(t, "04-exam-published");
  const period = await t.locator("[data-testid='period-line']").innerText();
  check("detail: shows 시작 · 마감 line", /시작 \d{4}/.test(period) && /마감 \d{4}/.test(period), period);
  // DB: startAt ≈ now, dueAt = startAt + 7d
  const rs = await db.execute({ sql: `SELECT startAt, dueAt FROM Assignment WHERE examId = ?`, args: [examId] });
  const a0 = rs.rows[0] as unknown as { startAt: number | string | null; dueAt: number | string | null };
  const toMs = (v: number | string | null) => (v === null ? null : typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : new Date(v).getTime());
  const sMs = toMs(a0.startAt);
  const dMs = toMs(a0.dueAt);
  check("db: assignment.startAt ≈ now (server time)", sMs !== null && Math.abs(sMs - Date.now()) < 5 * 60e3, `${a0.startAt}`);
  check("db: assignment.dueAt ≈ startAt + 7d", sMs !== null && dMs !== null && Math.abs(dMs - sMs - 7 * 86400e3) < 5 * 60e3, `${a0.dueAt}`);
  check("db: all 5 assignments share the same due", new Set(rs.rows.map((r) => String((r as unknown as { dueAt: unknown }).dueAt))).size === 1 && rs.rows.length === 5);

  // ── 3. 시험 상세 3단계: 1 단어 목록 → 2 대상 추가 (기본 마감 = 기존과 같게) → 3 진행
  await t.goto(`${BASE}/app/tests/${examId}?step=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  await shot(t, "05-detail-step1");
  check("detail step1: items preview + published version chip", (await t.locator("[data-testid='step-items']").count()) === 1 && /✓ 발행/.test(await t.locator("[data-testid='step-items']").innerText()));
  await t.click("[data-testid='step-next']");
  await t.waitForURL(/step=2/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("detail step2(teacher): nothing left to add → class select disabled, 0 students", (await t.locator("select[name='classId']").isDisabled()) && /학생 0명/.test(await t.locator("[data-testid='assign-panel']").innerText()));
  // 담당이 아닌 B반은 학원장이 더한다: 시작=지금, 마감은 기존 대상과 같게
  const [o] = await login(browser, "tester.owner@daneobang.dev");
  await o.goto(`${BASE}/app/tests/${examId}?step=2`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await o.waitForLoadState("networkidle");
  const dueDefault = await o.locator("[data-testid='assign-due-input']").inputValue();
  check("detail step2(owner): add-panel start=지금 · due prefilled with the common due", (await o.locator("[data-testid='assign-start-now'][aria-checked='true']").count()) === 1 && dueDefault === dueVal, `${dueDefault} vs ${dueVal}`);
  check("detail step2(owner): class select lists only classes with students left (B반 · 5명)", /테스트 B반 전체 · 5명/.test(await o.locator("select[name='classId']").innerText()) && !/테스트 A반/.test(await o.locator("select[name='classId']").innerText()));
  await o.selectOption("select[name='classId']", { label: "테스트 B반 전체 · 5명" });
  await o.click("[data-testid='assign-add']");
  await o.waitForSelector("text=5명에게 배정", { timeout: 15000 });
  await o.waitForLoadState("networkidle");
  await o.waitForFunction(() => document.querySelectorAll("[data-testid='target-row']").length === 10, null, { timeout: 15000 }).catch(() => {});
  check("detail step2(owner): B반 added → 10 targets", (await o.locator("[data-testid='target-row']").count()) === 10);
  await shot(o, "06-detail-step2");
  await o.click("[data-testid='step-next']");
  await o.waitForURL(/step=3/, { waitUntil: "domcontentloaded" });
  await o.waitForLoadState("networkidle");
  check("detail step3: due card shows current due (not 마감 없음)", /현재 마감/.test(await o.locator("#due").innerText()));
  check("detail step3: period line shows one start · one due for all 10", /시작 \d{4}.*마감 \d{4}/.test(await o.locator("[data-testid='period-line']").innerText()), await o.locator("[data-testid='period-line']").innerText());
  await shot(o, "07-detail-step3");

  // ── 4. 학생: 이번 주 화면에 바로 뜨고 시작할 수 있다
  const [s] = await login(browser, "tester.s01@daneobang.dev", 390, 844, true);
  await s.goto(`${BASE}/learn`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await s.waitForLoadState("networkidle");
  const home = await s.locator("main").innerText();
  check("student: new exam visible with D-day/due", (await s.locator("[data-testid='next-card'], [data-testid='queue-item']").count()) >= 1 && !/아직 응시할 수 없습니다/.test(home));
  await shot(s, "08-student-home");
  const aid = (rs.rows.find(() => true) && (await db.execute({ sql: `SELECT a.id FROM Assignment a JOIN Student st ON st.id = a.studentId JOIN User u ON u.id = st.userId WHERE a.examId = ? AND u.email = ?`, args: [examId, "tester.s01@daneobang.dev"] })).rows[0]) as unknown as { id: string } | undefined;
  check("db: tester.s01 has an assignment for the new exam", !!aid?.id);
  if (aid?.id) {
    const r = await s.request.post(`${BASE}/api/v1/assignments/${aid.id}/start`);
    check("student: start API succeeds immediately (startAt = now)", r.ok(), String(r.status()));
    const j = (await r.json().catch(() => ({}))) as { attemptId?: string; data?: { attemptId?: string } };
    const attemptId = j.attemptId ?? j.data?.attemptId;
    if (attemptId) {
      await s.goto(`${BASE}/learn/attempts/${attemptId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await s.waitForSelector("[data-testid='runner'] button.tile", { timeout: 15000 }).catch(() => {});
      check("student: runner renders 4 tiles", (await s.locator("[data-testid='runner'] button.tile").count()) === 4);
      await s.waitForTimeout(300);
      await s.screenshot({ path: path.join(OUT, "09-student-runner.png"), fullPage: true });
    }
  }

  // ── 5. 예약 시작: 내일 09:00 → 학생은 대기, start API 409
  await t.goto(`${BASE}/app/tests/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  await t.getByRole("button", { name: "테스트 단어장", exact: true }).click();
  await t.click("label.chip[data-day='15']");
  await t.click("label.chip:has-text('테스트 A반')");
  await t.click("[data-testid='start-custom']");
  const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10) + "T09:00";
  await t.fill("[data-testid='start-input']", tomorrow);
  const due2 = await t.locator("[data-testid='due-input']").inputValue();
  check("compose: scheduled start moves the 1주 뒤 due along", due2.startsWith(new Date(Date.parse(tomorrow + ":00Z") + 7 * 86400e3).toISOString().slice(0, 16)), `${due2}`);
  await t.fill("input[name='title']", "예약 출제 테스트");
  await t.click("[data-testid='compose-submit']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+\?published=1/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const exam2 = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  await t.waitForLoadState("networkidle");
  check("detail: scheduled start shown as 예약", /예약/.test(await t.locator("[data-testid='period-line']").innerText()));
  await shot(t, "10-exam-scheduled");
  await s.goto(`${BASE}/learn`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await s.waitForLoadState("networkidle");
  const home2 = await s.locator("main").innerText();
  const a2 = (await db.execute({ sql: `SELECT a.id FROM Assignment a JOIN Student st ON st.id = a.studentId JOIN User u ON u.id = st.userId WHERE a.examId = ? AND u.email = ?`, args: [exam2, "tester.s01@daneobang.dev"] })).rows[0] as unknown as { id: string } | undefined;
  if (a2?.id) {
    const r = await s.request.post(`${BASE}/api/v1/assignments/${a2.id}/start`);
    check("student: scheduled exam cannot start yet (409)", r.status() === 409, String(r.status()));
  }
  check("student: scheduled exam shows WAIT or 시작 시각 안내", /WAIT|부터 응시할 수 있어요/.test(home2), home2.replace(/\s+/g, " ").slice(0, 160));
  await shot(s, "11-student-home-scheduled");

  // ── 6. 초안만 저장 → 상세 1단계에서 발행 → 2단계 대상 추가 (마감 기본 7일 뒤)
  await t.goto(`${BASE}/app/tests/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  await t.getByRole("button", { name: "테스트 단어장", exact: true }).click();
  await t.click("label.chip[data-day='16']");
  await t.click("[data-testid='compose-draft']");
  await t.waitForURL(/\/app\/tests\/(?!new)[a-z0-9]+$/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const exam3 = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  await t.waitForLoadState("networkidle");
  check("draft: lands on step 1 (not published)", (await t.locator("[data-testid='exam-detail']").getAttribute("data-step")) === "1" && (await t.locator("[data-testid='published-banner']").count()) === 0);
  await t.click("button:has-text('발행')");
  await t.waitForSelector("text=발행했습니다", { timeout: 15000 });
  // 발행 뒤 refresh → 대상이 없으므로 기본 단계가 2(응시 대상)로 바뀐다
  await t.waitForSelector("[data-testid='assign-panel']", { timeout: 15000 });
  check("draft→publish: page moves to step 2 with the add-panel", (await t.locator("[data-testid='exam-detail']").getAttribute("data-step")) === "2");
  const due3 = await t.locator("[data-testid='assign-due-input']").inputValue();
  check("draft→publish: add-panel due defaults to +7d when no targets yet", due3.startsWith(expectDue), `${due3}`);
  await t.selectOption("select[name='classId']", { label: "테스트 A반 전체 · 5명" });
  await t.click("[data-testid='assign-add']");
  await t.waitForSelector("text=5명에게 배정", { timeout: 15000 });
  check("draft→publish→assign: 5 targets", true);

  // ── 7. 대상 추가 패널도 마감<시작이면 막는다 (예약 시작 2030 · 마감 2029)
  {
    await t.goto(`${BASE}/app/tests/${exam3}?step=2`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await t.waitForLoadState("networkidle");
    await t.click("[data-testid='assign-start-custom']");
    await t.fill("[data-testid='assign-start-input']", "2030-01-01T09:00");
    await t.fill("[data-testid='assign-due-input']", "2029-01-01T09:00");
    await t.waitForTimeout(200);
    check("assign-panel: due<start → inline error + button disabled", (await t.locator("[data-testid='assign-panel'] [role='alert']").count()) === 1 && (await t.locator("[data-testid='assign-add']").isDisabled()));
    await t.fill("[data-testid='assign-due-input']", "2030-01-08T09:00");
    await t.waitForTimeout(200);
    check("assign-panel: fixing the due re-enables the button", !(await t.locator("[data-testid='assign-add']").isDisabled()));
  }

  // ── 8. 시험 목록에 마감이 보인다
  await t.goto(`${BASE}/app/tests`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForLoadState("networkidle");
  check("tests list: shows 마감 column", /마감/.test(await t.locator("table.tbl thead").innerText()));
  await shot(t, "12-tests-list");

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(fails.length ? 1 : 0);
})();
