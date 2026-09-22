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
  const t = await client.execute("SELECT count(*) as n FROM sqlite_master WHERE type='table'");
  console.log(`db ready: ${url} (${t.rows[0].n} tables)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
