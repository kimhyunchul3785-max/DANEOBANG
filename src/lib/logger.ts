import fs from "fs";
import path from "path";

/**
 * 디버깅용 조작 로그. LOG_DIR (기본: 프로젝트 상위의 log 폴더 = C:\DANEOBANG\log) 에
 * 일자별 JSON Lines 파일로 남긴다: app-YYYY-MM-DD.log
 * 종류: action(서버 액션/감사), api(REST 호출), job, client(클릭·폼 제출), page(페이지 진입), e2e
 */
export function logDir() {
  const d = process.env.LOG_DIR || path.join(process.cwd(), "..", "log");
  const abs = path.isAbsolute(d) ? d : path.join(process.cwd(), d);
  try {
    fs.mkdirSync(abs, { recursive: true });
  } catch {}
  return abs;
}

function seoulDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export type LogEntry = {
  kind: "action" | "api" | "job" | "client" | "page" | "e2e" | "error" | "mail" | "billing";
  at?: string;
  user?: string | null;
  academy?: string | null;
  event: string;
  detail?: unknown;
  ms?: number;
};

const REDACT = /(password|token|secret|passwordHash|authorization)/i;
function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = REDACT.test(k) ? "[redacted]" : scrub(val);
    return o;
  }
  if (typeof v === "string" && v.length > 500) return v.slice(0, 500) + "…";
  return v;
}

export function writeLog(e: LogEntry) {
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), ...e, detail: scrub(e.detail) });
    fs.appendFile(path.join(logDir(), `app-${seoulDate()}.log`), line + "\n", () => {});
    if (process.env.LOG_STDOUT === "true") console.log("[log]", line);
  } catch {}
}
