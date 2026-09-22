import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeLog } from "@/lib/logger";
import { NextResponse } from "next/server";

const schema = z.object({ events: z.array(z.object({ event: z.string().max(200), path: z.string().max(300), detail: z.unknown().optional(), t: z.number().optional() })).max(100) });

/** 브라우저 조작 로그 수집 (클릭·폼 제출·페이지 진입). 로그인 여부와 무관하게 받되 사용자 id 만 붙인다. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  for (const e of parsed.data.events) writeLog({ kind: e.event === "page" ? "page" : "client", user: user?.id ?? null, event: e.event, detail: { path: e.path, ...(typeof e.detail === "object" && e.detail ? (e.detail as object) : {}) } });
  return NextResponse.json({ ok: true, n: parsed.data.events.length });
}
