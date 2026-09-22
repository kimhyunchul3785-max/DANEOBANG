import { NextRequest, NextResponse } from "next/server";
import { destroyWebSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await destroyWebSession();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
