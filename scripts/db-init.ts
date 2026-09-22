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
];

// 데이터 보정 (멱등): 상태값 통일, 기존 사용자 이메일 인증 처리, 기존 학원에 기본 구독(활성 선생님 수만큼) 생성
const DATA_FIXES: string[] = [
  `UPDATE "AcademyMember" SET "status" = 'disabled' WHERE "status" = 'inactive'`,
  `UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL`,
  `INSERT INTO "Subscription" ("id", "academyId", "provider", "seatQuantity", "unitPrice", "status", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
     SELECT 'sub_' || lower(hex(randomblob(10))), a."id", 'legacy',
       MAX(1, (SELECT count(*) FROM "AcademyMember" m WHERE m."academyId" = a."id" AND m."status" = 'active' AND m."isTeacher" = 1)),
       9900, 'active', CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+1 month'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM "Academy" a WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."academyId" = a."id")`,
];

async function main() {
  const client = createClient({ url });
  await client.executeMultiple(sql);
  for (const m of MIGRATIONS) {
    const cols = await client.execute(`PRAGMA table_info("${m.table}")`);
    if (!cols.rows.some((r) => r.name === m.column)) {
      await client.execute(m.ddl);
      console.log(`migrated: ${m.table}.${m.column}`);
    }
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
