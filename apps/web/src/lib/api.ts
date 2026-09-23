import { NextResponse } from "next/server";
import { ApiError } from "./attempts";
import { writeLog } from "./logger";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ data, error: null }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function fail(status: number, code: string, message?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ data: null, error: { code, message: message ?? code, retryable: status === 503 || status === 429, ...extra } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** 라우트 핸들러 래퍼: ApiError → JSON, 그 외 500 (스택·토큰 미노출) */
export function handle(fn: () => Promise<Response>, req?: Request): Promise<Response> {
  const t0 = Date.now();
  const label = req ? `${req.method} ${new URL(req.url).pathname}` : "api";
  return fn()
    .then((res) => {
      writeLog({ kind: "api", event: label, detail: { status: res.status }, ms: Date.now() - t0 });
      return res;
    })
    .catch((e) => {
      if (e instanceof ApiError) {
        writeLog({ kind: "api", event: label, detail: { status: e.status, code: e.code }, ms: Date.now() - t0 });
        return fail(e.status, e.code, e.message, e.extra);
      }
      console.error("api error", e);
      writeLog({ kind: "error", event: label, detail: { message: e instanceof Error ? e.message : String(e) }, ms: Date.now() - t0 });
      return fail(500, "internal_error", "서버 오류가 발생했습니다.");
    });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(422, "invalid_json");
  }
}
