// prisma/init.sql 을 SQLite 에 적용한다 (Prisma 엔진 바이너리 불필요, 멱등).
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
const url = raw.startsWith("file:") && !path.isAbsolute(raw.slice(5)) ? "file:" + path.join(process.cwd(), raw.slice(5).replace(/^\.\//, "")) : raw;
const sql = fs.readFileSync(path.join(process.cwd(), "prisma", "init.sql"), "utf8");

// 기존 DB 에 추가된 컬럼 (CREATE TABLE IF NOT EXISTS 는 컬럼을 추가하지 않으므로 여기서 보정)
const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "Academy", column: "logoPath", ddl: 'ALTER TABLE "Academy" ADD COLUMN "logoPath" TEXT' },
  { table: "Word", column: "section", ddl: 'ALTER TABLE "Word" ADD COLUMN "section" TEXT' },
  { table: "ImportRow", column: "synonyms", ddl: 'ALTER TABLE "ImportRow" ADD COLUMN "synonyms" TEXT' },
  { table: "ImportRow", column: "section", ddl: 'ALTER TABLE "ImportRow" ADD COLUMN "section" TEXT' },
  { table: "RetakeTask", column: "scheduledAt", ddl: 'ALTER TABLE "RetakeTask" ADD COLUMN "scheduledAt" DATETIME' },
  { table: "RetakeTask", column: "note", ddl: 'ALTER TABLE "RetakeTask" ADD COLUMN "note" TEXT' },
  { table: "Exam", column: "secondsPerItem", ddl: 'ALTER TABLE "Exam" ADD COLUMN "secondsPerItem" INTEGER NOT NULL DEFAULT 7' },
  { table: "ScanUpload", column: "source", ddl: 'ALTER TABLE "ScanUpload" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'teacher\'' },
  { table: "Notification", column: "link", ddl: 'ALTER TABLE "Notification" ADD COLUMN "link" TEXT' },
  // v4.2 — B2B 가입·Seat 과금
  { table: "User", column: "emailVerifiedAt", ddl: 'ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME' },
  { table: "User", column: "phone", ddl: 'ALTER TABLE "User" ADD COLUMN "phone" TEXT' },
  { table: "Academy", column: "representativeName", ddl: 'ALTER TABLE "Academy" ADD COLUMN "representativeName" TEXT' },
  { table: "Academy", column: "phone", ddl: 'ALTER TABLE "Academy" ADD COLUMN "phone" TEXT' },
  { table: "Academy", column: "region", ddl: 'ALTER TABLE "Academy" ADD COLUMN "region" TEXT' },
  { table: "AcademyMember", column: "isTeacher", ddl: 'ALTER TABLE "AcademyMember" ADD COLUMN "isTeacher" BOOLEAN NOT NULL DEFAULT true' },
  { table: "Invitation", column: "isTeacher", ddl: 'ALTER TABLE "Invitation" ADD COLUMN "isTeacher" BOOLEAN NOT NULL DEFAULT true' },
  { table: "Invitation", column: "name", ddl: 'ALTER TABLE "Invitation" ADD COLUMN "name" TEXT' },
  { table: "Invitation", column: "revokedAt", ddl: 'ALTER TABLE "Invitation" ADD COLUMN "revokedAt" DATETIME' },
  { table: "Student", column: "email", ddl: 'ALTER TABLE "Student" ADD COLUMN "email" TEXT' },
  { table: "Student", column: "phone", ddl: 'ALTER TABLE "Student" ADD COLUMN "phone" TEXT' },
  { table: "Student", column: "inviteSentAt", ddl: 'ALTER TABLE "Student" ADD COLUMN "inviteSentAt" DATETIME' },
  { table: "SignupSession", column: "verifyTokenDev", ddl: 'ALTER TABLE "SignupSession" ADD COLUMN "verifyTokenDev" TEXT' },
  { table: "Student", column: "phoneCodeHash", ddl: 'ALTER TABLE "Student" ADD COLUMN "phoneCodeHash" TEXT' },
  { table: "Student", column: "phoneCodeExpiresAt", ddl: 'ALTER TABLE "Student" ADD COLUMN "phoneCodeExpiresAt" DATETIME' },
  { table: "Student", column: "phoneCodeSentAt", ddl: 'ALTER TABLE "Student" ADD COLUMN "phoneCodeSentAt" DATETIME' },
  // v4.4 — 성적 대시보드 위젯 배치
  { table: "AcademyMember", column: "dashboardLayout", ddl: 'ALTER TABLE "AcademyMember" ADD COLUMN "dashboardLayout" TEXT' },
];

/**
 * v4.4 — RetakeTask 재구성: sourceAttemptId 를 NULL 허용(반복 오답 재시험), kind/mode/wordIds/issuedAt 추가, scheduledAt/note(보강 일정) 제거.
 * SQLite 는 컬럼 NOT NULL 을 바꿀 수 없어 테이블을 다시 만든다 (멱등: kind 컬럼이 없을 때만).
 */
const RETAKE_REBUILD = `
CREATE TABLE "RetakeTask_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'failed',
  "sourceAttemptId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "mode" TEXT,
  "wordIds" TEXT,
  "dueAt" DATETIME,
  "retakeExamId" TEXT,
  "issuedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "RetakeTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RetakeTask_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "RetakeTask_new" ("id","studentId","kind","sourceAttemptId","status","mode","wordIds","dueAt","retakeExamId","issuedAt","createdAt","completedAt")
  SELECT "id","studentId",'failed',"sourceAttemptId", CASE WHEN "status"='scheduled' THEN 'issued' ELSE "status" END, NULL, NULL, "dueAt","retakeExamId",
         CASE WHEN "retakeExamId" IS NOT NULL THEN "createdAt" ELSE NULL END, "createdAt","completedAt" FROM "RetakeTask";
DROP TABLE "RetakeTask";
ALTER TABLE "RetakeTask_new" RENAME TO "RetakeTask";
CREATE UNIQUE INDEX IF NOT EXISTS "RetakeTask_sourceAttemptId_key" ON "RetakeTask"("sourceAttemptId");
CREATE INDEX IF NOT EXISTS "RetakeTask_studentId_status_idx" ON "RetakeTask"("studentId", "status");
`;

// 데이터 보정 (멱등): 상태값 통일, 기존 사용자 이메일 인증 처리, 기존 학원에 기본 구독(활성 선생님 수만큼) 생성
const DATA_FIXES: string[] = [
  `UPDATE "AcademyMember" SET "status" = 'disabled' WHERE "status" = 'inactive'`,
  `UPDATE "RetakeTask" SET "status" = 'issued' WHERE "status" = 'scheduled'`,
  `UPDATE "RetakeTask" SET "issuedAt" = "createdAt" WHERE "issuedAt" IS NULL AND "retakeExamId" IS NOT NULL`,
  `UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL`,
  `INSERT INTO "Subscription" ("id", "academyId", "provider", "seatQuantity", "unitPrice", "status", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
     SELECT 'sub_' || lower(hex(randomblob(10))), a."id", 'legacy',
       MAX(1, (SELECT count(*) FROM "AcademyMember" m WHERE m."academyId" = a."id" AND m."status" = 'active' AND m."isTeacher" = 1)),
       9900, 'active', CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+1 month'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM "Academy" a WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."academyId" = a."id")`,
];

async function main() {
  const client = createClient({ url });
  // WAL: 서버(요청)·작업 큐·스크립트가 같은 파일을 읽고 쓸 때 서로 막지 않게 (파일에 저장되는 설정, 멱등)
  try {
    const jm = await client.execute("PRAGMA journal_mode=WAL");
    if (String(jm.rows[0]?.journal_mode).toLowerCase() !== "wal") console.log("warn: journal_mode is", jm.rows[0]?.journal_mode);
  } catch (e) {
    console.log("warn: could not set WAL:", e instanceof Error ? e.message : e);
  }
  await client.executeMultiple(sql);
  for (const m of MIGRATIONS) {
    const cols = await client.execute(`PRAGMA table_info("${m.table}")`);
    if (!cols.rows.some((r) => r.name === m.column)) {
      await client.execute(m.ddl);
      console.log(`migrated: ${m.table}.${m.column}`);
    }
  }
  const rt = await client.execute(`PRAGMA table_info("RetakeTask")`);
  if (rt.rows.length && !rt.rows.some((r) => r.name === "kind")) {
    await client.execute("PRAGMA foreign_keys = OFF");
    await client.executeMultiple(RETAKE_REBUILD);
    await client.execute("PRAGMA foreign_keys = ON");
    console.log("migrated: RetakeTask rebuilt (v4.4)");
  }
  for (const q of DATA_FIXES) {
    const r = await client.execute(q);
    if (r.rowsAffected) console.log(`data fix: ${r.rowsAffected} rows — ${q.trim().slice(0, 40)}…`);
  }
  const t = await client.execute("SELECT count(*) as n FROM sqlite_master WHERE type='table'");
  console.log(`db ready: ${url} (${t.rows[0].n} tables)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
