import crypto from "crypto";

/** 순수 함수(날짜·문자열·난수)는 workspace 공용 패키지에서 온다. 여기에는 Node 전용(crypto)만 남긴다 */
export { fmtDate, fmtMD, fmtMDHM, seoulWeekRange, daysUntil, dDay, parseSeoulLocal, toSeoulLocalInput, parseJSON, normalizeMeaning, slugify, seededRandom, shuffle, pad2 } from "@daneobang/utils";

export function sha256(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return sha256(token);
}

export const RESERVED_SLUGS = new Set(["app", "admin", "api", "login", "signup", "learn", "workspaces", "join", "static", "_next"]);
