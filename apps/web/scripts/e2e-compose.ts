/* 출제 흐름 E2E (v5.2): 업로드 → ① 단어장 상세 → [이 단어장으로 시험 만들기] (단어장 고정) → 시험 상세(진행 화면) + 자식(문항·정답 / 응시 대상)
   → 학생 응시 → ② 시험 탭 → [시험 만들기] 위저드(단어장 선택부터 순차) → 예약 시작 → ③ 위저드로 초안만 → 문항 페이지에서 발행 → 대상 추가
   → 대상 패널 검증 → 시험 목록 필터·검색 → 성적 탭 즉시 렌더 → 옛 ?step= 주소 리다이렉트. 스크린샷·로그: 저장소 루트 log/e2e-compose */
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
const go = async (p: Page, url: string) => {
  await p.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForLoadState("networkidle");
};

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
  const nowSeoul = new Date(Date.now() + 9 * 3600e3);
  const expectDue = new Date(nowSeoul.getTime() + 7 * 86400e3).toISOString().slice(0, 13); // 날짜·시(hour)까지 비교

  // ── 0. 로그인 상태에서 /login · /login/email 을 다시 열면 500 없이 있어야 할 곳으로 (자리 1개 계정)
  for (const u of ["/login", "/login/email"]) {
    const r = await t.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    check(`login: revisiting ${u} while signed in → /app (no 500)`, /\/app$/.test(t.url()) && (r?.status() ?? 0) < 400, `${t.url()} ${r?.status()}`);
  }

  // ── 1. 업로드 (새 폼): 파일 고르기 → 상태 읽기 → 취소 → 다시 고르기 → 이어 붙이기 목록 → 업로드 → import 화면 → 단어장
  await db.execute(`UPDATE VocabBook SET status = 'archived' WHERE title = 'sample' AND status = 'active'`); // 이전 실행분 정리 (같은 파일 재업로드 안내를 피함)
  await go(t, "/app/vocabulary");
  check("upload: state reads 파일을 고르세요 before pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "파일을 고르세요");
  check("upload: submit disabled before pick", await t.locator("[data-testid='upload-submit']").isDisabled());
  await t.setInputFiles("input[type=file][name=file]", "fixtures/legacy.hwp");
  await t.waitForTimeout(200);
  check("upload: .hwp is flagged + submit stays disabled", (await t.locator("[data-testid='dropzone']").innerText()).includes("HWPX") && (await t.locator("[data-testid='upload-submit']").isDisabled()));
  await t.click("[data-testid='dropzone-clear']");
  check("upload: × clears the pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "파일을 고르세요");
  await t.click("[data-testid='mode-append']");
  const rows = await t.locator("[data-testid='book-pick-row']").count();
  check("upload: append mode lists books with words·DAY (no native select)", rows >= 1 && (await t.locator("[data-testid='book-pick'] select").count()) === 0 && /단어 · DAY/.test(await t.locator("[data-testid='book-pick']").innerText()), `rows=${rows}`);
  await t.click("[data-testid='mode-new']");
  await t.setInputFiles("input[type=file][name=file]", "fixtures/sample.docx");
  await t.waitForTimeout(200);
  check("upload: state reads 파일 1개 after pick", (await t.locator("[data-testid='upload-state']").innerText()).trim() === "파일 1개");
  await shot(t, "01-upload-picked");
  await t.click("[data-testid='upload-submit']");
  // 분석이 빠르면 import 화면(단어장의 자식 /app/vocabulary/imports/…)을 거쳐 곧바로 단어장으로 넘어간다
  await t.waitForURL(/\/app\/vocabulary\/(imports\/)?[a-z0-9]+/, { timeout: 90000, waitUntil: "domcontentloaded" });
  await t.waitForURL(/\/app\/vocabulary\/(?!imports)[a-z0-9]+/, { timeout: 60000, waitUntil: "domcontentloaded" }).catch(() => {});
  check("upload: docx → import (child of 단어장) → auto-open book", /\/app\/vocabulary\/(?!imports)[a-z0-9]+/.test(t.url()), t.url());
  await shot(t, "02-upload-book");
  await go(t, "/app/vocabulary");
  await t.setInputFiles("input[type=file][name=file]", "fixtures/sample.docx");
  await t.click("[data-testid='upload-submit']");
  await t.waitForSelector("[data-testid='upload-error']", { timeout: 20000 });
  check("upload: re-uploading the same file → points to the existing book instead of duplicating", /이미 '.+' 단어장으로 저장/.test(await t.locator("[data-testid='upload-error']").innerText()) && (await t.locator("[data-testid='upload-existing-link']").count()) === 1);

  // ── 1b. 단어장 목록 (v5.2): 폴더 바 · 카드 전체가 링크 · 보관/열기 버튼 없음 · ⋯ 메뉴
  await go(t, "/app/vocabulary");
  check("list: folder bar + full-card links · no 열기/보관 buttons", (await t.locator("[data-testid='folder-bar']").count()) === 1 && (await t.locator("[data-testid='book-open']").count()) >= 2 && (await t.getByRole("button", { name: /^(열기|보관|복원)$/ }).count()) === 0 && (await t.getByRole("link", { name: "열기", exact: true }).count()) === 0);
  await t.locator("[data-testid='book-card'][data-book='테스트 단어장'] [data-testid='book-menu']").click();
  check("list: ⋯ menu — tag checkboxes + 휴지통으로 (enabled even with exams)", (await t.locator("[data-testid='book-menu-open']").count()) === 1 && !(await t.locator("[data-testid='book-delete']").isDisabled()) && /휴지통으로/.test(await t.locator("[data-testid='book-menu-open']").innerText()));
  await t.keyboard.press("Escape");
  await t.locator("[data-testid='book-card'][data-book='테스트 단어장'] [data-testid='book-open']").click();
  await t.waitForURL(/\/app\/vocabulary\/[a-z0-9]+$/, { waitUntil: "domcontentloaded" });
  check("list: clicking the card body opens the book", /\/app\/vocabulary\/[a-z0-9]+$/.test(t.url()));

  // ── 2. 단어장 상세: 우측 상단 검정 [시험 만들기] 없음 · 하단 바 하나로 → 단어장 고정 출제 화면
  const bookRow = (await db.execute(`SELECT id FROM VocabBook WHERE title = '테스트 단어장' AND status = 'active' LIMIT 1`)).rows[0] as unknown as { id: string };
  const bookId = bookRow.id;
  await go(t, `/app/vocabulary/${bookId}`);
  const headerBtns = await t.locator("div.mb-5").first().locator(".btn-primary, .btn-dark").count();
  const makeTestLinks = await t.getByText("시험 만들기").count();
  const makeTestInBar = await t.locator("[data-testid='book-bar']").getByText("시험 만들기").count();
  check("book: no black [시험 만들기] in the header (single bottom bar instead)", headerBtns === 0 && makeTestLinks === makeTestInBar && (await t.locator("[data-testid='book-bar'] [data-testid='book-new-test']").count()) === 1 && (await t.getByText("이 DAY로 출제").count()) === 0, `header=${headerBtns} links=${makeTestLinks}/${makeTestInBar}`);
  check("book: DAY split offers 일수 · 단어 수 only (no 지문별/직접)", (await t.locator("[data-testid='day-split'] .seg-item").allInnerTexts()).every((x) => !/지문별|직접/.test(x)) && (await t.locator("[data-testid='day-split'] .seg-item").count()) >= 2);
  check("book: header shows 단어 · DAY · 시험 digital line + exams section after the word table", /\d+단어 · DAY \d+개 · 시험 \d+개/.test(await t.locator("main, body").first().innerText()) && (await t.locator("[data-testid='book-exams']").count()) === 1);
  const testsBefore = Number((await t.locator("body").innerText()).match(/단어 · DAY \d+개 · 시험 (\d+)개/)?.[1] ?? "0");
  await t.click("a.chip[data-day='14']");
  await t.waitForURL(/day=14/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  await shot(t, "03-book-detail");
  await t.click("[data-testid='book-new-test']");
  await t.waitForURL(/\/app\/vocabulary\/[a-z0-9]+\/new-test/, { timeout: 30000, waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("book→compose: locked mode · parent link is the book · no book picker", (await t.locator("form[data-mode='locked']").count()) === 1 && (await t.locator("[data-testid='step-book']").count()) === 0 && /← 테스트 단어장/.test(await t.locator("[data-testid='book-new-test']").innerText()));
  check("book→compose: DAY 14 preselected from ?day=", (await t.locator("label.chip[data-day='14'].on").count()) === 1);
  check("book→compose: all sections on one screen (range · target · cond · name)", (await t.locator("[data-testid='step-range'], [data-testid='step-target'], [data-testid='step-cond'], [data-testid='options']").count()) === 4);
  await t.click("label.chip:has-text('테스트 A반')");
  await t.waitForTimeout(600);
  check("compose(teacher): class chips count only my students (B반 = 0, disabled)", (await t.locator("label.chip[data-class='테스트 B반'] .chip-sub").innerText()).trim() === "0" && (await t.locator("label.chip[data-class='테스트 B반'] input").isDisabled()));
  const dueVal = await t.locator("[data-testid='due-input']").inputValue();
  check("compose: start preset = 지금 (no start input shown)", (await t.locator("[data-testid='start-now'][aria-checked='true']").count()) === 1 && (await t.locator("[data-testid='start-input']").count()) === 0);
  check("compose: due default = +7 days, same hour", dueVal.startsWith(expectDue), `${dueVal} vs ${expectDue}`);
  const bar = await t.locator("[data-testid='compose-bar']").innerText();
  check("compose: bar summarises 시작 지금 · 마감", /시작 지금/.test(bar) && /마감 \d\d\/\d\d/.test(bar), bar.replace(/\s+/g, " ").slice(0, 120));
  check("compose: due presets are exactly 1주 뒤 · 직접 · 없음", (await t.locator("[data-testid='due-week1'], [data-testid='due-custom'], [data-testid='due-none']").count()) === 3 && (await t.locator("[data-testid='due-today'], [data-testid='due-sunday']").count()) === 0);
  await t.click("[data-testid='start-custom']");
  await t.click("[data-testid='due-custom']");
  await t.fill("[data-testid='due-input']", "2026-01-01T09:00");
  check("compose: due before start → inline error + submit disabled", (await t.locator("[data-testid='due-error']").count()) === 1 && (await t.locator("[data-testid='compose-submit']").isDisabled()));
  await t.click("[data-testid='start-now']");
  await t.click("[data-testid='due-week1']");
  check("compose: back to 1주 뒤 clears error", (await t.locator("[data-testid='due-error']").count()) === 0 && !(await t.locator("[data-testid='compose-submit']").isDisabled()));
  await shot(t, "04-compose-locked");
  await t.click("[data-testid='compose-submit']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+\?published=1/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const examId = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  check("compose: publish + assign 5 in one click → lands on 시험 상세 (시험 탭)", t.url().includes("assigned=5"), t.url());
  await t.waitForLoadState("networkidle");
  await shot(t, "05-exam-run");

  // ── 3. 시험 상세 = 진행 화면: 마감 변경 · 종이 · 성적 요약이 한 화면, 문항/대상은 자식 페이지
  check("detail: data-view=run · no items/targets sections inline", (await t.locator("[data-testid='exam-detail'][data-view='run']").count()) === 1 && (await t.locator("[data-testid='step-items'], [data-testid='assign-panel']").count()) === 0);
  check("detail: run summary + scores(평균·통과율·미달) + #due + paper on one page", (await t.locator("[data-testid='run-summary']").count()) === 1 && /평균[\s\S]*통과율[\s\S]*미달/.test(await t.locator("[data-testid='run-scores']").innerText()) && (await t.locator("#due [data-testid='due-apply']").count()) === 1 && (await t.locator("[data-testid='paper-card']").count()) === 1);
  const period = await t.locator("[data-testid='period-line']").innerText();
  check("detail: shows 시작 · 마감 line", /시작 \d{4}/.test(period) && /마감 \d{4}/.test(period), period);
  check("detail: release-state line shows 점수/정답 policy as text (immediate → no release button)", /점수\s*제출 직후/.test(await t.locator("[data-testid='release-state']").innerText()) && (await t.locator("[data-testid='release-answers']").count()) === 0);
  check("detail: parent link ← 시험 (no cross-jumps)", (await t.locator("[data-testid='exam-back']").innerText()).trim() === "← 시험" && (await t.locator("[data-testid='exam-back']").getAttribute("href")) === "/app/tests");
  // DB: startAt ≈ now, dueAt = startAt + 7d
  const rs = await db.execute({ sql: `SELECT startAt, dueAt FROM Assignment WHERE examId = ?`, args: [examId] });
  const a0 = rs.rows[0] as unknown as { startAt: number | string | null; dueAt: number | string | null };
  const toMs = (v: number | string | null) => (v === null ? null : typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : new Date(v).getTime());
  const sMs = toMs(a0.startAt);
  const dMs = toMs(a0.dueAt);
  check("db: assignment.startAt ≈ now (server time)", sMs !== null && Math.abs(sMs - Date.now()) < 5 * 60e3, `${a0.startAt}`);
  check("db: assignment.dueAt ≈ startAt + 7d", sMs !== null && dMs !== null && Math.abs(dMs - sMs - 7 * 86400e3) < 5 * 60e3, `${a0.dueAt}`);
  check("db: all 5 assignments share the same due", new Set(rs.rows.map((r) => String((r as unknown as { dueAt: unknown }).dueAt))).size === 1 && rs.rows.length === 5);
  // 자식 1: 문항 · 정답
  await t.click("[data-testid='link-items']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+\/items$/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("items: child page with published version chip · parent link = exam title", (await t.locator("[data-testid='exam-items'] [data-testid='step-items']").count()) === 1 && /✓ 발행/.test(await t.locator("[data-testid='step-items']").innerText()) && !/tests/i.test(await t.locator("[data-testid='exam-back']").innerText()));
  await shot(t, "06-exam-items");
  // 자식 2: 응시 대상 (선생님1 은 더할 학생이 없다)
  await t.click("[data-testid='exam-back']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+$/, { waitUntil: "domcontentloaded" });
  await t.click("[data-testid='link-targets']");
  await t.waitForURL(/\/targets$/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("targets(teacher): nothing left to add → no class rows, 0 students, 출제하기 disabled", (await t.locator("[data-testid='pick-class']").count()) === 0 && /학생 0명/.test(await t.locator("[data-testid='assign-panel']").innerText()) && (await t.locator("[data-testid='assign-add']").isDisabled()));
  // 옛 주소 호환
  await t.goto(`${BASE}/app/tests/${examId}?step=1`, { waitUntil: "domcontentloaded" });
  check("compat: ?step=1 → /items", /\/items$/.test(t.url()), t.url());
  await t.goto(`${BASE}/app/tests/${examId}?step=2`, { waitUntil: "domcontentloaded" });
  check("compat: ?step=2 → /targets", /\/targets$/.test(t.url()), t.url());
  // 담당이 아닌 B반은 학원장이 더한다: 시작=지금, 마감은 기존 대상과 같게
  const [o] = await login(browser, "tester.owner@daneobang.dev");
  await go(o, `/app/tests/${examId}/targets`);
  const dueDefault = await o.locator("[data-testid='assign-due-input']").inputValue();
  check("targets(owner): add-panel start=지금 · due prefilled with the common due", (await o.locator("[data-testid='assign-start-now'][aria-checked='true']").count()) === 1 && Math.abs(Date.parse(dueDefault) - Date.parse(dueVal)) <= 60e3, `${dueDefault} vs ${dueVal}`);
  check("targets(owner): picker lists only classes with students left (B반 · 0/5)", (await o.locator("[data-testid='pick-class'][data-class='테스트 B반']").count()) === 1 && (await o.locator("[data-testid='pick-class'][data-class='테스트 A반']").count()) === 0 && /0\/5/.test(await o.locator("[data-testid='pick-class'][data-class='테스트 B반']").innerText()));
  check("targets(owner): 출제하기 disabled until someone is picked", await o.locator("[data-testid='assign-add']").isDisabled());
  await o.locator("[data-testid='pick-class'][data-class='테스트 B반'] input").check();
  check("targets(owner): class checkbox picks all 5 → 출제하기 · 5명", /출제하기 · 5명/.test(await o.locator("[data-testid='assign-add']").innerText()));
  await o.click("[data-testid='assign-add']");
  await o.waitForSelector("text=5명에게 출제했어요", { timeout: 15000 });
  await o.waitForLoadState("networkidle");
  await o.waitForFunction(() => document.querySelectorAll("[data-testid='target-row']").length === 10, null, { timeout: 15000 }).catch(() => {});
  check("targets(owner): B반 added → 10 targets", (await o.locator("[data-testid='target-row']").count()) === 10);
  await shot(o, "07-exam-targets");
  await o.click("[data-testid='exam-back']");
  await o.waitForURL(/\/app\/tests\/[a-z0-9]+$/, { waitUntil: "domcontentloaded" });
  await o.waitForLoadState("networkidle");
  check("detail: due card shows current due (not 마감 없음)", /현재 마감/.test(await o.locator("#due").innerText()));
  check("detail: period line shows one start · one due for all 10", /시작 \d{4}.*마감 \d{4}/.test(await o.locator("[data-testid='period-line']").innerText()), await o.locator("[data-testid='period-line']").innerText());
  check("detail: link-targets count updated to 10", /10명/.test(await o.locator("[data-testid='link-targets']").innerText()));
  // 단어장 상세의 TESTS 수가 늘었다 (단어장 → 이 단어장의 시험 목록은 시험 탭 필터로)
  await go(t, `/app/vocabulary/${bookId}`);
  const testsAfter = Number((await t.locator("body").innerText()).match(/단어 · DAY \d+개 · 시험 (\d+)개/)?.[1] ?? "0");
  check("book: TESTS count +1 · exams section links to 시험 탭 ?bookId=", testsAfter === testsBefore + 1 && (await t.locator(`[data-testid='book-tests-link'][href*='bookId=${bookId}']`).count()) === 1, `${testsBefore} → ${testsAfter}`);

  // ── 4. 학생: 이번 주 화면에 바로 뜨고 시작할 수 있다
  const [s] = await login(browser, "tester.s01@daneobang.dev", 390, 844, true);
  await go(s, "/learn");
  const home = await s.locator("main").innerText();
  check("student: new exam visible with D-day/due", (await s.locator("[data-testid='next-card'], [data-testid='queue-item']").count()) >= 1 && !/아직 응시할 수 없습니다/.test(home));
  await shot(s, "08-student-home");
  const aid = (await db.execute({ sql: `SELECT a.id FROM Assignment a JOIN Student st ON st.id = a.studentId JOIN User u ON u.id = st.userId WHERE a.examId = ? AND u.email = ?`, args: [examId, "tester.s01@daneobang.dev"] })).rows[0] as unknown as { id: string } | undefined;
  check("db: tester.s01 has an assignment for the new exam", !!aid?.id);
  if (aid?.id) {
    const r = await s.request.post(`${BASE}/api/v1/assignments/${aid.id}/start`);
    check("student: start API succeeds immediately (startAt = now)", r.ok(), String(r.status()));
    const j = (await r.json().catch(() => ({}))) as { attemptId?: string; data?: { attemptId?: string } };
    const attemptId = j.attemptId ?? j.data?.attemptId;
    if (attemptId) {
      await s.goto(`${BASE}/learn/attempts/${attemptId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await s.waitForSelector("[data-testid='runner-ready']", { timeout: 15000 }).catch(() => {});
      check("student: runner opens on a ready screen (no timer yet) with 문항 · 초/단어 · 규칙 + [시작]", (await s.locator("[data-testid='runner-ready'][data-stage='ready']").count()) === 1 && (await s.locator("[data-testid='runner-start']").count()) === 1 && (await s.locator("[data-testid='runner']").count()) === 0);
      await s.screenshot({ path: path.join(OUT, "09a-student-ready.png"), fullPage: true });
      await s.click("[data-testid='runner-start']");
      await s.waitForSelector("[data-testid='runner-count']", { timeout: 5000 }).catch(() => {});
      check("student: [시작] → 3·2·1 countdown", (await s.locator("[data-testid='runner-count']").count()) === 1);
      await s.waitForSelector("[data-testid='runner'] button.tile", { timeout: 15000 }).catch(() => {});
      check("student: runner renders 4 tiles after the countdown", (await s.locator("[data-testid='runner'] button.tile").count()) === 4);
      // 잘못 누름 방지: 첫 보기를 누르고 0.4초 안에 다른 보기를 누르면 바뀐다 (같은 단어에 머무름)
      const firstPrompt = await s.locator("[data-testid='runner'] .card-body > div:nth-child(2)").innerText().catch(() => "");
      await s.locator("[data-testid='runner'] button.tile").nth(0).click();
      await s.locator("[data-testid='runner'] button.tile").nth(1).click();
      const pressed = await s.locator("[data-testid='runner'] button.tile[aria-pressed='true']").count();
      const secondPressed = await s.locator("[data-testid='runner'] button.tile").nth(1).getAttribute("aria-pressed");
      check("student: re-picking within the grace window changes the answer before advancing", pressed === 1 && secondPressed === "true", `pressed=${pressed} first="${firstPrompt.slice(0, 20)}"`);
      await s.waitForTimeout(300);
      await s.screenshot({ path: path.join(OUT, "09-student-runner.png"), fullPage: true });
    }
  }

  // ── 5. 시험 탭 → [시험 만들기] 위저드: 단어장 → 범위 → 대상 → 조건 → 이름. 예약 시작 → 학생은 대기, start API 409
  await go(t, "/app/tests");
  check("tests list: [시험 만들기] is the only primary · filters seg · 사진 채점 is secondary", (await t.locator("[data-testid='tests-new']").count()) === 1 && (await t.locator("[data-testid='tests-filters'] [data-filter]").count()) >= 4 && (await t.locator("a[href='/app/tests/scans']").count()) >= 1);
  await t.click("[data-testid='tests-new']");
  await t.waitForURL(/\/app\/tests\/new$/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("wizard: stepper 1/5 with all five step names", (await t.locator("[data-testid='stepper'] [data-step-key]").count()) === 5 && (await t.locator("[data-testid='stepper'] [aria-current='step']").innerText()).includes("단어장"));
  check("wizard: starts at 단어장 step · preview hidden · next disabled until a book is picked", (await t.locator("form[data-mode='wizard'][data-step='book']").count()) === 1 && !(await t.locator("[data-testid='preview-runner']").isVisible()) && (await t.locator("[data-testid='compose-next']").isDisabled()) && (await t.locator("[data-testid='step-range']").count()) === 0);
  await shot(t, "10-wizard-book");
  await t.click("[data-testid='step-book'] [data-book='테스트 단어장']");
  await t.waitForTimeout(200);
  check("wizard: picking a book auto-advances to 범위 (single-choice step)", (await t.locator("form[data-step='range']").count()) === 1);
  check("wizard: step 2 = 범위 only · book is fixed (no picker) · next disabled until a DAY", (await t.locator("form[data-step='range']").count()) === 1 && (await t.locator("[data-testid='step-book']").count()) === 0 && (await t.locator("[data-testid='step-target']").count()) === 0 && (await t.locator("[data-testid='compose-next']").isDisabled()));
  await t.click("label.chip[data-day='15']");
  await t.waitForTimeout(300);
  check("wizard: DAY picked → preview visible + next enabled", (await t.locator("[data-testid='preview-runner']").isVisible()) && !(await t.locator("[data-testid='compose-next']").isDisabled()));
  await shot(t, "11-wizard-range");
  await t.click("[data-testid='compose-next']");
  check("wizard: step 3 = 대상", (await t.locator("form[data-step='target'] [data-testid='step-target']").count()) === 1);
  await t.click("label.chip:has-text('테스트 A반')");
  await t.click("[data-testid='compose-next']");
  check("wizard: step 4 = 조건 (start/due here)", (await t.locator("form[data-step='cond'] [data-testid='start-now']").count()) === 1);
  await t.click("[data-testid='start-custom']");
  const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10) + "T09:00";
  await t.fill("[data-testid='start-input']", tomorrow);
  const due2 = await t.locator("[data-testid='due-input']").inputValue();
  check("wizard: scheduled start moves the 1주 뒤 due along", due2.startsWith(new Date(Date.parse(tomorrow + ":00Z") + 7 * 86400e3).toISOString().slice(0, 16)), `${due2}`);
  await shot(t, "12-wizard-cond");
  await t.click("[data-testid='compose-next']");
  await t.waitForTimeout(800);
  check("wizard: moving 조건 → 이름 does NOT submit the form (regression: DOM button reuse)", /\/app\/tests\/new$/.test(t.url()) && (await t.locator("[data-testid='compose-submit']").innerText()) !== "출제 중…", t.url());
  check("wizard: step 5 = 이름·공개 with 초안/출제 buttons + ← 이전", (await t.locator("form[data-step='name'] [data-testid='options']").count()) === 1 && (await t.locator("[data-testid='compose-submit']").count()) === 1 && (await t.locator("[data-testid='compose-prev']").count()) === 1);
  await t.click("[data-testid='compose-prev']");
  check("wizard: ← 이전 goes back to 조건 keeping the schedule", (await t.locator("form[data-step='cond']").count()) === 1 && (await t.locator("[data-testid='start-input']").inputValue()) === tomorrow);
  await t.click("[data-testid='compose-next']");
  await t.fill("input[name='title']", "예약 출제 테스트");
  await t.press("input[name='title']", "Enter");
  await t.waitForTimeout(300);
  check("wizard: Enter in the title field does not submit (would have saved a draft via the first submit button)", /\/app\/tests\/new$/.test(t.url()) && (await t.locator("form[data-step='name']").count()) === 1, t.url());
  const submitLabel = await t.locator("[data-testid='compose-submit']").innerText();
  check("wizard: submit label carries the target count", /5명/.test(submitLabel), submitLabel);
  await shot(t, "13-wizard-name");
  await t.click("[data-testid='compose-submit']");
  await t.waitForURL(/\/app\/tests\/[a-z0-9]+\?published=1/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const exam2 = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  await t.waitForLoadState("networkidle");
  check("detail: scheduled start shown as 예약", /예약/.test(await t.locator("[data-testid='period-line']").innerText()));
  {
    const job = (await db.execute({ sql: `SELECT status, availableAt FROM Job WHERE type = 'notify_start' AND resourceId = ? ORDER BY createdAt DESC LIMIT 1`, args: [exam2] })).rows[0] as unknown as { status: string; availableAt: string } | undefined;
    const expectAt = Date.parse(tomorrow + ":00+09:00");
    check("db: scheduled start → notify_start job queued at startAt (student alarm)", !!job && job.status === "queued" && Math.abs(new Date(job.availableAt).getTime() - expectAt) < 60e3, job ? `${job.status} ${job.availableAt}` : "no job");
  }
  await shot(t, "14-exam-scheduled");
  await go(s, "/learn");
  const home2 = await s.locator("main").innerText();
  const a2 = (await db.execute({ sql: `SELECT a.id FROM Assignment a JOIN Student st ON st.id = a.studentId JOIN User u ON u.id = st.userId WHERE a.examId = ? AND u.email = ?`, args: [exam2, "tester.s01@daneobang.dev"] })).rows[0] as unknown as { id: string } | undefined;
  if (a2?.id) {
    const r = await s.request.post(`${BASE}/api/v1/assignments/${a2.id}/start`);
    check("student: scheduled exam cannot start yet (409)", r.status() === 409, String(r.status()));
  }
  check("student: scheduled exam shows a disabled '… 시작' button or 시작 badge (Korean, not WAIT)", /시작/.test(home2) && !/WAIT/.test(home2), home2.replace(/\s+/g, " ").slice(0, 160));

  // ── 6. 위저드로 초안만 → 상세(초안 카드) → 문항 페이지에서 발행 → 응시 대상에서 추가 (마감 기본 7일 뒤)
  await go(t, "/app/tests/new");
  await t.click("[data-testid='step-book'] [data-book='테스트 단어장']");
  await t.waitForSelector("form[data-step='range']");
  await t.click("label.chip[data-day='16']");
  await t.click("[data-testid='compose-next']"); // 대상 (없음)
  await t.click("[data-testid='compose-next']"); // 조건
  await t.click("[data-testid='compose-next']"); // 이름
  check("wizard: no target → [출제] disabled with '대상을 고르면 출제', [초안만 저장] enabled", (await t.locator("[data-testid='compose-submit']").isDisabled()) && /대상을 고르면/.test(await t.locator("[data-testid='compose-submit']").innerText()) && !(await t.locator("[data-testid='compose-draft']").isDisabled()));
  await t.click("[data-testid='compose-draft']");
  await t.waitForURL(/\/app\/tests\/(?!new)[a-z0-9]+$/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const exam3 = t.url().match(/\/app\/tests\/([a-z0-9]+)/)![1];
  await t.waitForLoadState("networkidle");
  check("draft: detail shows data-view=draft with the draft card (no banner, no run summary)", (await t.locator("[data-testid='exam-detail'][data-view='draft'] [data-testid='draft-card']").count()) === 1 && (await t.locator("[data-testid='published-banner'], [data-testid='run-summary']").count()) === 0);
  await shot(t, "15-exam-draft");
  await t.click("[data-testid='draft-review']");
  await t.waitForURL(/\/items$/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("draft→items: publish button on the draft version", (await t.locator("[data-testid='publish-form']").count()) === 1);
  await t.click("[data-testid='publish-form']");
  await t.waitForSelector("text=발행했습니다", { timeout: 15000 });
  await t.waitForLoadState("networkidle");
  await t.waitForFunction(() => /✓ 발행/.test(document.querySelector("[data-testid='step-items']")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  check("draft→publish: version chip flips to ✓ 발행", /✓ 발행/.test(await t.locator("[data-testid='step-items']").innerText()));
  await go(t, `/app/tests/${exam3}`);
  check("draft→publish: parent (0 targets) shows the target picker + 출제 전 badge", (await t.locator("[data-testid='exam-detail'][data-view='run'] [data-testid='assign-panel']").count()) === 1 && /출제 전/.test(await t.locator("[data-testid='exam-status']").innerText()));
  const due3 = await t.locator("[data-testid='assign-due-input']").inputValue();
  check("picker: due defaults to +7d when no targets yet", due3.startsWith(expectDue.slice(0, 10)), `${due3}`);
  await t.locator("[data-testid='pick-class'][data-class='테스트 A반'] input").check();
  await t.click("[data-testid='assign-add']");
  await t.waitForSelector("text=5명에게 출제했어요", { timeout: 15000 });
  await t.waitForURL(/issued=5/, { timeout: 15000 });
  await t.waitForLoadState("networkidle");
  check("picker: after 출제하기 → banner + 출제됨 badge", /5명에게 출제했어요/.test(await t.locator("[data-testid='published-banner']").innerText()) && /출제됨/.test(await t.locator("[data-testid='exam-status']").innerText()));
  await go(t, `/app/tests/${exam3}/targets`);
  check("draft→publish→assign: 5 targets", (await t.locator("[data-testid='target-row']").count()) === 5);

  // ── 7. 대상 추가 패널도 마감<시작이면 막는다 (예약 시작 2030 · 마감 2029)
  {
    await go(t, `/app/tests/${exam3}/targets`);
    await t.click("[data-testid='assign-start-custom']");
    await t.fill("[data-testid='assign-start-input']", "2030-01-01T09:00");
    await t.fill("[data-testid='assign-due-input']", "2029-01-01T09:00");
    await t.waitForTimeout(200);
    check("assign-panel: due<start → inline error + button disabled", (await t.locator("[data-testid='assign-panel'] [role='alert']").count()) === 1 && (await t.locator("[data-testid='assign-add']").isDisabled()));
    await t.fill("[data-testid='assign-due-input']", "2030-01-08T09:00");
    await t.waitForTimeout(200);
    check("assign-panel: fixing the due clears the error", (await t.locator("[data-testid='assign-panel'] [role='alert']").count()) === 0);
  }

  // ── 8. 시험 목록: 마감 열 · 필터 · 검색 · 단어장 필터
  await go(t, "/app/tests");
  check("tests list: shows 마감 column", /마감/.test(await t.locator("table.tbl thead").innerText()));
  {
    const states = await t.locator("[data-testid='exam-row']").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
    check("tests list: default 미완료 hides 완료·마감 지남 rows · states are one of open/scheduled/none", states.length > 0 && states.every((x) => ["open", "scheduled", "none"].includes(x ?? "")), states.slice(0, 8).join(","));
    check("tests list: filters are 미완료 · 마감 지남 · 완료 · 초안 · 휴지통 · 전체", (await t.locator("[data-testid='tests-filters'] [data-filter]").allInnerTexts()).map((x) => x.trim()).join("|") === "미완료|마감 지남|완료|초안|휴지통|전체");
  }
  await shot(t, "16-tests-list");
  await go(t, "/app/tests?q=예약 출제");
  const listRows = await t.locator("table.tbl tbody tr").count();
  check("tests list: ?q= narrows to the matching exam", listRows >= 1 && (await t.locator("table.tbl tbody").innerText()).includes("예약 출제 테스트") && !(await t.locator("table.tbl tbody").innerText()).includes("DAY 14"), `rows=${listRows}`);
  await go(t, `/app/tests?bookId=${bookId}`);
  check("tests list: ?bookId= filter shows this book's exams", (await t.locator("table.tbl tbody tr").count()) >= 3);
  await go(t, "/app/tests?filter=draft");
  check("tests list: filter=draft seg is on", (await t.locator("[data-testid='tests-filters'] [data-filter='draft'].on").count()) === 1);

  // ── 9. 성적 탭: 시험 선택 → [조회] 없이 바로 렌더 (URL 이 바뀌고 요약이 그 자리에)
  await go(t, "/app/results");
  check("results: five tabs (요약 · 학생별 · 학교별 · 학년별 · 반별) + 단어장 select · summary shows the widget board only", (await t.locator("[data-testid='results-tabs'] [data-tab]").count()) === 5 && (await t.locator("[data-testid='book-select']").count()) === 1 && (await t.locator("[data-testid='widget-board']").count()) === 1 && (await t.locator("[data-testid='detail-exam']").count()) === 0);
  await go(t, "/app/results?tab=students");
  check("results: 학생별 tab shows the student table only", (await t.locator("#students-body").count()) === 1 && (await t.locator("[data-testid='widget-board']").count()) === 0);
  await go(t, "/app/results?tab=exams");
  check("results: no [조회] button in the detail filter", (await t.locator("[data-testid='detail-filter'] button:has-text('조회'), [data-testid='detail-filter'] ~ * button:has-text('조회')").count()) === 0 && (await t.locator("[data-testid='detail-exam']").count()) === 1);
  await t.selectOption("[data-testid='detail-exam']", examId);
  await t.waitForURL((u) => u.searchParams.get("examId") === examId, { timeout: 15000, waitUntil: "commit" });
  await t.waitForLoadState("networkidle");
  check("results: picking an exam re-renders immediately (URL examId + summary present)", t.url().includes(`examId=${examId}`) && (await t.locator("[data-testid='detail-summary']").count()) === 1);
  await shot(t, "17-results-detail");
  // 반별 → ‹ 항목 칩 › → 그 반 화면 · 단어장 기준
  await go(t, "/app/results?tab=class");
  check("results: 반별 → group table + chip rail (전체 + 반)", (await t.locator("[data-testid='group-row']").count()) >= 1 && (await t.locator("[data-testid='rail-chip']").count()) >= 2);
  await t.locator("[data-testid='rail-chip']").nth(1).click();
  await t.waitForURL(/pick=/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("results: picking a 반 chip → KPIs + trend + student table", (await t.locator("[data-testid='pick-group-view']").count()) === 1 && (await t.locator("[data-testid='pick-kpis']").count()) === 1 && (await t.locator("[data-testid='group-trend']").count()) === 1);
  await t.selectOption("[data-testid='book-select'] select", bookId);
  await t.waitForURL((u) => u.searchParams.get("book") === bookId, { timeout: 15000, waitUntil: "commit" });
  await t.waitForLoadState("networkidle");
  check("results: 단어장 select keeps tab/pick and switches to 전체 기간", /tab=class/.test(t.url()) && /pick=/.test(t.url()) && /전체 기간/.test(await t.locator(".kicker").first().innerText()));
  await go(t, "/app/results?tab=school");
  check("results: 학교별 tab renders the group table", (await t.locator("[data-testid='group-table']").count()) === 1);

  // ── 10. 학생 탭 (선생님): 반 칩 = 담당 학생 수 · 담당 없는 반은 흐리게 · 빈 상태 문구
  await go(t, "/app/students");
  check("students(teacher): B반 chip counts 0 (담당 학생 수) and is dimmed", (await t.locator("[data-class='테스트 B반'] .chip-sub").innerText()).trim() === "0" && (await t.locator("[data-class='테스트 B반'].opacity-50").count()) === 1);
  await t.click("[data-class='테스트 B반']");
  await t.waitForURL(/classId=/, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  check("students(teacher): B반 empty state explains 담당 (not 반 코드)", /담당 학생이 없어요/.test(await t.locator("#roster-body").innerText()));
  check("students: mobile [학생 추가] toggle exists · roster is a card table", (await t.locator("[data-testid='add-toggle']").count()) === 1 && (await t.locator("table.tbl-cards").count()) >= 1);
  await shot(t, "18-students-teacher");
  // 선생님이 학원장 화면을 열면 토스트와 함께 /app
  await t.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded" });
  await t.waitForLoadState("networkidle");
  await t.getByText("학원장만 볼 수 있는").waitFor({ timeout: 5000 }).catch(() => {});
  check("shell: teacher opening /app/settings → /app with a '학원장만' toast", /\/app(\?|$)/.test(t.url()) && (await t.getByText("학원장만 볼 수 있는").count()) >= 1, t.url());
  // 랜딩: 무료 체험 중 문구 없음
  await t.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("landing: no '무료 체험 중' badge", (await t.getByText("무료 체험 중").count()) === 0);

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(fails.length ? 1 : 0);
})();
