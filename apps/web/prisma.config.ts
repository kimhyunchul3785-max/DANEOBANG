import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// 참고: DB 초기화는 `npm run db:push` (scripts/db-init.ts, 엔진 바이너리 불필요) 를 사용한다.
// Prisma CLI 의 migrate/db push 를 쓰려면 DATABASE_URL 이 그대로 적용된다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
  migrations: { seed: "tsx prisma/seed.ts" },
});
