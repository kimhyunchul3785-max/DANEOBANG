import path from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveUrl() {
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  // 상대경로는 프로젝트 루트 기준 절대경로로 통일 (next start / tsx 어디서 실행해도 같은 파일)
  if (raw.startsWith("file:") && !path.isAbsolute(raw.slice(5))) {
    return "file:" + path.join(process.cwd(), raw.slice(5).replace(/^\.\//, ""));
  }
  return raw;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaLibSql({ url: resolveUrl() }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
