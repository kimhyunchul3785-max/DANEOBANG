/* 단어장 병합 + 폴더 E2E (v5.2): 목록 카드 체크 → 하단 [병합] 바 → 병합 화면(순서·겹침 미리보기·제목·DAY) → 새 단어장(?from=merge)
   ① 테스트 단어장 + 픽스처 B (겹침 4) 이어 붙이기  ② 픽스처 B + C 다시 나누기 3일 (원본은 그대로)  ③ 폴더 만들기 → 이동 → 이름 바꾸기 → 지우기  ④ 시험 없는 단어장 삭제. 스크린샷·로그: 저장소 루트 log/e2e-merge */
import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? path.join(process.cwd(), "..", "..", "log", "e2e-merge");
fs.mkdirSync(OUT, { recursive: true });
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};
const dbUrl = (() => {
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  return raw.startsWith("file:") && !path.isAbsolute(raw.slice(5)) ? "file:" + path.join(process.cwd(), raw.slice(5).replace(/^\.\//, "")) : raw;
})();
const db = createClient({ url: dbUrl });
const cid = () => "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
const go = async (p: Page, url: string) => {
  await p.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForLoadState("networkidle");
};

async function login(browser: Browser, email: string): Promise<[Page, BrowserContext]> {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", p.url(), e.message.slice(0, 120)));
  await p.goto(`${BASE}/login/email`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "test1234");
  await p.click('button:has-text("로그인")');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000, waitUntil: "domcontentloaded" });
  return [p, ctx];
}

const FIXTURE_TITLES = ["병합 픽스처 B", "병합 픽스처 C", "병합 결과 A+B", "병합 결과 B+C"];
const FIXTURE_FOLDERS = ["E2E 태그", "E2E 태그 2", "E2E 태그 B"];
async function cleanup() {
  const rows = (await db.execute({ sql: `SELECT id FROM VocabBook WHERE title IN (${FIXTURE_TITLES.map(() => "?").join(",")})`, args: FIXTURE_TITLES })).rows as unknown as { id: string }[];
  for (const r of rows) {
    await db.execute({ sql: `DELETE FROM Word WHERE bookId = ?`, args: [r.id] });
    await db.execute({ sql: `DELETE FROM BookDay WHERE bookId = ?`, args: [r.id] });
    await db.execute({ sql: `DELETE FROM VocabBook WHERE id = ?`, args: [r.id] });
  }
  await db.execute({ sql: `UPDATE VocabBook SET folderId = NULL WHERE folderId IN (SELECT id FROM BookFolder WHERE name IN (${FIXTURE_FOLDERS.map(() => "?").join(",")}))`, args: FIXTURE_FOLDERS });
  await db.execute({ sql: `DELETE FROM VocabBookTag WHERE tagId IN (SELECT id FROM BookFolder WHERE name IN (${FIXTURE_FOLDERS.map(() => "?").join(",")}))`, args: FIXTURE_FOLDERS });
  await db.execute({ sql: `DELETE FROM BookFolder WHERE name IN (${FIXTURE_FOLDERS.map(() => "?").join(",")})`, args: FIXTURE_FOLDERS });
  return rows.length;
}

/** 픽스처 단어장: days[] 마다 단어 [english, meaning] */
async function makeBook(academyId: string, createdById: string, title: string, days: [string, string][][]) {
  const id = cid();
  const now = new Date().toISOString();
  await db.execute({ sql: `INSERT INTO VocabBook (id, academyId, createdById, title, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'active', ?, ?)`, args: [id, academyId, createdById, title, now, now] });
  let order = 0;
  for (let i = 0; i < days.length; i++) {
    const dayId = cid();
    await db.execute({ sql: `INSERT INTO BookDay (id, bookId, dayNo, label) VALUES (?, ?, ?, ?)`, args: [dayId, id, i + 1, `DAY ${i + 1}`] });
    for (const [en, ko] of days[i]) {
      await db.execute({ sql: `INSERT INTO Word (id, bookId, dayId, english, pos, meaning, approved, excluded, sortOrder, revision, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'n.', ?, 1, 0, ?, 1, ?, ?)`, args: [cid(), id, dayId, en, ko, order++, now, now] });
    }
  }
  return id;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const t0 = Date.now();
  await cleanup();
  const A = (await db.execute(`SELECT id, academyId, createdById FROM VocabBook WHERE title = '테스트 단어장' AND status = 'active' LIMIT 1`)).rows[0] as unknown as { id: string; academyId: string; createdById: string };
  const aWords = Number((await db.execute({ sql: `SELECT count(*) n FROM Word WHERE bookId = ?`, args: [A.id] })).rows[0].n);
  const aDays = Number((await db.execute({ sql: `SELECT count(*) n FROM BookDay WHERE bookId = ?`, args: [A.id] })).rows[0].n);
  // B: 테스트 단어장과 4개 겹침 (대소문자·공백·괄호·구두점 차이) + 6개 새 단어, DAY 2개
  const B = await makeBook(A.academyId, A.createdById, "병합 픽스처 B", [
    [
      ["Abandon", "B의 뜻(버리다)"],
      ["apparent ", "B의 뜻"],
      ["collapse (v.)", "B의 뜻"],
      ["deliberate.", "B의 뜻"],
      ["zephyr", "산들바람"],
    ],
    [
      ["quixotic", "돈키호테 같은"],
      ["lugubrious", "침울한"],
      ["obfuscate", "혼란스럽게 하다"],
      ["perfunctory", "형식적인"],
      ["sycophant", "아첨꾼"],
    ],
  ]);
  // C: B 와 2개 겹침 + 4개 새 단어
  const C = await makeBook(A.academyId, A.createdById, "병합 픽스처 C", [
    [
      ["zephyr", "C의 뜻"],
      ["Sycophant", "C의 뜻"],
      ["halcyon", "평온한"],
      ["ephemeral", "덧없는"],
      ["laconic", "간결한"],
      ["mellifluous", "감미로운"],
    ],
  ]);

  const [p] = await login(browser, "tester.t1@daneobang.dev");

  // ── 1. 목록: 카드 체크 → 바 → 병합 화면
  await go(p, "/app/vocabulary");
  check("list: no merge bar before any check", (await p.locator("[data-testid='merge-bar-select']").count()) === 0);
  await p.locator("label:has([aria-label='테스트 단어장 병합 선택'])").click();
  await p.waitForSelector("[data-testid='merge-bar-select']");
  check("list: 1 checked → bar asks for one more · [병합] disabled", /하나 더/.test(await p.locator("[data-testid='merge-bar-select']").innerText()) && (await p.locator("[data-testid='merge-go']").isDisabled()));
  await p.locator("label:has([aria-label='병합 픽스처 B 병합 선택'])").click();
  check("list: 2 checked → [병합 · 2개] enabled · order numbers on cards", !(await p.locator("[data-testid='merge-go']").isDisabled()) && (await p.locator("label:has([data-testid='merge-check']):has-text('병합 1')").count()) === 1 && (await p.locator("label:has([data-testid='merge-check']):has-text('병합 2')").count()) === 1);
  await shot(p, "01-list-checked");
  await p.click("[data-testid='merge-go']");
  await p.waitForURL(/\/app\/vocabulary\/merge\?ids=/, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle");
  check("merge: url carries ids in the checked order (A,B)", p.url().endsWith(`ids=${A.id},${B}`), p.url());

  // ── 2. 병합 화면: 순서 · 겹침 미리보기 · 재정렬
  const books = p.locator("[data-testid='merge-book']");
  check("merge: two books listed · first is 테스트 단어장 · B shows 겹침 4 제거", (await books.count()) === 2 && /테스트 단어장/.test(await books.nth(0).innerText()) && /겹침 4 제거/.test(await books.nth(1).innerText()));
  const kept = aWords + 10 - 4;
  check(`merge: preview says ${kept} KEPT · 4 DROPPED with the 4 dropped headwords`, new RegExp(`${kept} KEPT · 4 DROPPED`).test(await p.locator("[data-testid='merge-preview']").innerText()) && (await p.locator("[data-testid='merge-preview'] .chip").count()) === 4);
  check("merge: dropped list shows B's spellings (normalisation ignores case·space·paren·punct)", /Abandon/.test(await p.locator("[data-testid='merge-preview']").innerText()) && /collapse \(v\.\)/.test(await p.locator("[data-testid='merge-preview']").innerText()));
  check("merge: default title = A + B · append shows DAY (A days + 2)", (await p.locator("[data-testid='merge-title']").inputValue()) === "테스트 단어장 + 병합 픽스처 B" && new RegExp(`DAY ${aDays + 2}`).test(await p.locator("[data-testid='merge-day-append']").innerText()));
  await shot(p, "02-merge-preview");
  // 순서 바꾸기: B 를 앞으로 → 이제 A 쪽에서 4개 빠지고 B 의 뜻이 남는다
  await books.nth(0).getByLabel("아래로").click();
  await p.waitForURL((u) => u.searchParams.get("ids") === `${B},${A.id}`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle");
  check("merge: ↓ swaps order (B,A) · now 테스트 단어장 loses the 4 overlaps · KEPT unchanged", /병합 픽스처 B/.test(await books.nth(0).innerText()) && /겹침 4 제거/.test(await books.nth(1).innerText()) && new RegExp(`${kept} KEPT`).test(await p.locator("[data-testid='merge-preview']").innerText()));
  await books.nth(1).getByLabel("위로").click();
  await p.waitForURL((u) => u.searchParams.get("ids") === `${A.id},${B}`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle");

  // ── 3. 병합 실행 (이어 붙이기 · 원본 유지)
  await p.fill("[data-testid='merge-title']", "병합 결과 A+B");
  check("merge: bar summarises books → title · kept · DAY · dropped", /2개 → "병합 결과 A\+B"/.test(await p.locator("[data-testid='merge-bar']").innerText()) && new RegExp(`${kept}단어`).test(await p.locator("[data-testid='merge-bar']").innerText()) && /겹침 4 제거/.test(await p.locator("[data-testid='merge-bar']").innerText()));
  await p.click("[data-testid='merge-submit']");
  await p.waitForURL(/\/app\/vocabulary\/[a-z0-9]+\?from=merge/, { timeout: 40000, waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle");
  const AB = p.url().match(/\/app\/vocabulary\/([a-z0-9]+)/)![1];
  check("merge→book: lands on the new book with the merge notice + digital line", (await p.locator("[data-testid='merge-done']").count()) === 1 && new RegExp(`${kept}단어 · DAY ${aDays + 2}개`).test(await p.locator("body").innerText()));
  check("merge→book: bottom bar offers 이 단어장으로 시험 만들기 (child of this book)", (await p.locator(`[data-testid='book-new-test'][href^='/app/vocabulary/${AB}/new-test']`).count()) === 1);
  await shot(p, "03-merged-book");
  const abWords = (await db.execute({ sql: `SELECT english, meaning FROM Word WHERE bookId = ? ORDER BY sortOrder`, args: [AB] })).rows as unknown as { english: string; meaning: string }[];
  const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9가-힣'\s-]/g, " ").replace(/\s+/g, " ").trim();
  check(`db: merged book has ${kept} words, no duplicate headwords`, abWords.length === kept && new Set(abWords.map((w) => norm(w.english))).size === kept, `${abWords.length}`);
  check("db: overlapping word keeps the FIRST book's meaning (abandon → 버리다, 포기하다, not B's)", abWords.find((w) => norm(w.english) === "abandon")?.meaning === "버리다, 포기하다" && !abWords.some((w) => /B의 뜻/.test(w.meaning)));
  const abDays = (await db.execute({ sql: `SELECT dayNo FROM BookDay WHERE bookId = ? ORDER BY dayNo`, args: [AB] })).rows.map((r) => Number(r.dayNo));
  check(`db: append → DAY 1..${aDays + 2} contiguous, B's words on the last two DAYs`, abDays.length === aDays + 2 && abDays.every((d, i) => d === i + 1) && Number((await db.execute({ sql: `SELECT count(*) n FROM Word w JOIN BookDay d ON d.id = w.dayId WHERE w.bookId = ? AND d.dayNo > ?`, args: [AB, aDays] })).rows[0].n) === 6);
  const srcStatus = (await db.execute({ sql: `SELECT status FROM VocabBook WHERE id IN (?, ?)`, args: [A.id, B] })).rows.map((r) => r.status);
  check("db: sources stay active (no archive option any more) · audit book.merge written", srcStatus.every((s) => s === "active") && (await p.locator("[data-testid='merge-archive']").count()) === 0 && Number((await db.execute({ sql: `SELECT count(*) n FROM AuditLog WHERE action = 'book.merge' AND target = ?`, args: [AB] })).rows[0].n) === 1);

  // ── 4. 두 번째: B + C 다시 나누기 3일 (원본은 그대로 남는다)
  await go(p, `/app/vocabulary/merge?ids=${B},${C}`);
  check("merge(B+C): 2 overlaps (zephyr · sycophant) → 14 KEPT", /14 KEPT · 2 DROPPED/.test(await p.locator("[data-testid='merge-preview']").innerText()));
  await p.click("[data-testid='merge-day-resplit']");
  await p.fill("input[name='days']", "3");
  await p.fill("[data-testid='merge-title']", "병합 결과 B+C");
  await shot(p, "04-merge-resplit");
  await p.click("[data-testid='merge-submit']");
  await p.waitForURL(/\/app\/vocabulary\/[a-z0-9]+\?from=merge/, { timeout: 40000, waitUntil: "domcontentloaded" });
  const BC = p.url().match(/\/app\/vocabulary\/([a-z0-9]+)/)![1];
  const bcDays = (await db.execute({ sql: `SELECT count(*) n FROM BookDay WHERE bookId = ?`, args: [BC] })).rows[0].n;
  const bcWords = (await db.execute({ sql: `SELECT count(*) n FROM Word WHERE bookId = ?`, args: [BC] })).rows[0].n;
  check("db: resplit 3 → 3 DAYs · 14 words", Number(bcDays) === 3 && Number(bcWords) === 14, `${bcDays} days, ${bcWords} words`);
  const still = (await db.execute({ sql: `SELECT status FROM VocabBook WHERE id IN (?, ?)`, args: [B, C] })).rows.map((r) => r.status);
  check("db: sources B and C stay active after the second merge", still.every((s) => s === "active"));
  const mf = (await db.execute({ sql: `SELECT mergedFrom FROM VocabBook WHERE id = ?`, args: [BC] })).rows[0].mergedFrom as string | null;
  check("db: merged book remembers its sources (mergedFrom)", !!mf && JSON.parse(mf).includes(B) && JSON.parse(mf).includes(C), String(mf));
  await go(p, "/app/vocabulary");
  check("list: sources and merged books all offer the merge checkbox", (await p.getByLabel("병합 픽스처 B 병합 선택").count()) === 1 && (await p.getByLabel("병합 결과 B+C 병합 선택").count()) === 1);

  // ── 5. 태그: 만들기 ×2 → 한 단어장에 두 태그(체크) → 칩 숫자 → 필터 → 이름 바꾸기 → 지우기 (단어장은 남는다)
  const tagCount = (name: string) => p.locator(`[data-testid='folder-bar'] [data-folder='${name}'] .chip-sub`).innerText().then((x) => x.trim());
  for (const name of ["E2E 태그", "E2E 태그 B"]) {
    await go(p, "/app/vocabulary");
    await p.click("[data-testid='folder-new']");
    await p.fill("[data-testid='folder-form'] input[name='name']", name);
    await p.click("[data-testid='folder-save']");
    await p.waitForURL(/tag=/, { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle");
  }
  const tagId = (await db.execute({ sql: `SELECT id FROM BookFolder WHERE name = ?`, args: ["E2E 태그"] })).rows[0].id as string;
  check("tag: create → lands on the (empty) tag with 0 books", /tag=/.test(p.url()) && /태그가 붙은 단어장이 없어요/.test(await p.locator("body").innerText()) && (await tagCount("E2E 태그 B")) === "0");
  await go(p, "/app/vocabulary");
  await p.locator("[data-testid='book-card'][data-book='병합 픽스처 B'] [data-testid='book-menu']").click();
  await p.locator("[data-testid='book-move'][data-folder='E2E 태그'] input").check();
  await p.waitForFunction(() => document.querySelector("[data-folder='E2E 태그'] .chip-sub")?.textContent?.trim() === "1", null, { timeout: 10000 }).catch(() => {});
  await p.locator("[data-testid='book-card'][data-book='병합 픽스처 B'] [data-testid='book-menu']").click().catch(() => {});
  if (!(await p.locator("[data-testid='book-menu-open']").count())) await p.locator("[data-testid='book-card'][data-book='병합 픽스처 B'] [data-testid='book-menu']").click();
  await p.locator("[data-testid='book-move'][data-folder='E2E 태그 B'] input").check();
  await p.waitForFunction(() => document.querySelector("[data-folder='E2E 태그 B'] .chip-sub")?.textContent?.trim() === "1", null, { timeout: 10000 }).catch(() => {});
  const links = (await db.execute({ sql: `SELECT count(*) n FROM VocabBookTag WHERE bookId = ?`, args: [B] })).rows[0].n;
  check("tag: one book carries two tags (checkboxes) · chip counts 1/1 · #badges on the card", Number(links) === 2 && (await tagCount("E2E 태그")) === "1" && (await tagCount("E2E 태그 B")) === "1" && /#E2E 태그[\s\S]*#E2E 태그 B/.test(await p.locator("[data-testid='book-card'][data-book='병합 픽스처 B'] [data-testid='book-tags']").innerText()));
  await go(p, `/app/vocabulary?tag=${tagId}`);
  check("tag: filter shows only that book · '태그 없음' chip appears", (await p.locator("[data-testid='book-card']").count()) === 1 && (await p.locator("[data-folder='none']").count()) === 1);
  await go(p, `/app/vocabulary?folder=${tagId}`);
  check("tag: old ?folder= links still filter", (await p.locator("[data-testid='book-card']").count()) === 1);
  await shot(p, "05-tags");
  await p.click("[data-testid='folder-rename']");
  await p.fill("[data-testid='folder-form'] input[name='name']", "E2E 태그 2");
  await p.click("[data-testid='folder-save']");
  await p.waitForFunction(() => !!document.querySelector("[data-folder='E2E 태그 2']"), null, { timeout: 10000 }).catch(() => {});
  check("tag: rename (pencil)", (await p.locator("[data-folder='E2E 태그 2']").count()) === 1);
  p.once("dialog", (d) => d.accept());
  await p.click("[data-testid='folder-delete']");
  await p.waitForURL((u) => !u.searchParams.get("tag") && !u.searchParams.get("folder"), { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle");
  const left = (await db.execute({ sql: `SELECT count(*) n FROM VocabBookTag WHERE bookId = ?`, args: [B] })).rows[0].n;
  check("tag: delete keeps the book and its other tag", Number(left) === 1 && (await p.locator("[data-folder='E2E 태그 2']").count()) === 0 && (await p.locator("[data-testid='book-card'][data-book='병합 픽스처 B']").count()) === 1);

  // ── 6. 휴지통: ⋯ → 휴지통으로 → 복원 → 다시 휴지통 → 영구 삭제
  const status = async (id: string) => ((await db.execute({ sql: `SELECT status FROM VocabBook WHERE id = ?`, args: [id] })).rows[0]?.status as string | undefined) ?? "gone";
  await p.locator("[data-testid='book-card'][data-book='병합 결과 B+C'] [data-testid='book-menu']").click();
  p.once("dialog", (d) => d.accept());
  await p.click("[data-testid='book-delete']");
  await p.waitForFunction(() => !document.querySelector("[data-testid='book-card'][data-book='병합 결과 B+C']"), null, { timeout: 10000 }).catch(() => {});
  await go(p, "/app/vocabulary");
  check("trash: ⋯ → 휴지통으로 hides the card and lists it in 🗑 휴지통", (await p.locator("[data-testid='book-card'][data-book='병합 결과 B+C']").count()) === 0 && (await status(BC)) === "archived" && (await p.locator("[data-testid='trash-book'][data-book='병합 결과 B+C']").count()) === 1);
  await p.locator("[data-testid='archived-books'] summary").click();
  await p.locator("[data-testid='trash-book'][data-book='병합 결과 B+C'] [data-testid='book-restore']").click();
  await p.waitForFunction(() => !!document.querySelector("[data-testid='book-card'][data-book='병합 결과 B+C']"), null, { timeout: 10000 }).catch(() => {});
  check("trash: 복원 puts it back", (await status(BC)) === "active" && (await p.locator("[data-testid='book-card'][data-book='병합 결과 B+C']").count()) === 1);
  await p.locator("[data-testid='book-card'][data-book='병합 결과 B+C'] [data-testid='book-menu']").click();
  p.once("dialog", (d) => d.accept());
  await p.click("[data-testid='book-delete']");
  await p.waitForFunction(() => !document.querySelector("[data-testid='book-card'][data-book='병합 결과 B+C']"), null, { timeout: 10000 }).catch(() => {});
  await go(p, "/app/vocabulary");
  await p.locator("[data-testid='archived-books'] summary").click();
  p.once("dialog", (d) => d.accept());
  await p.locator("[data-testid='trash-book'][data-book='병합 결과 B+C'] [data-testid='book-purge']").click();
  await p.waitForFunction(() => !document.querySelector("[data-testid='trash-book'][data-book='병합 결과 B+C']"), null, { timeout: 10000 }).catch(() => {});
  check("trash: 영구 삭제 removes the book and its words from the DB", (await status(BC)) === "gone" && (await db.execute({ sql: `SELECT count(*) n FROM Word WHERE bookId = ?`, args: [BC] })).rows[0].n === 0);

  // ── 7. 잘못된 진입: 단어장 1개 → 안내
  await go(p, `/app/vocabulary/merge?ids=${A.id}`);
  check("merge: fewer than 2 ids → guidance, no form", (await p.locator("[data-testid='merge-form']").count()) === 0 && /2개 이상/.test(await p.locator("[data-testid='merge-page']").innerText()));

  await browser.close();
  const removed = await cleanup();
  console.log(`cleanup: removed ${removed} fixture/result books`);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(fails.length ? 1 : 0);
})();
