import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: new Headers(req.headers) } });
  res.headers.set("x-pathname", req.nextUrl.pathname);
  // 서버 컴포넌트에서 현재 경로를 알기 위해 요청 헤더에도 전달
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", req.nextUrl.pathname);
  const r = NextResponse.next({ request: { headers: reqHeaders } });
  r.headers.set("Cache-Control", "no-store");
  return r;
}

export const config = { matcher: ["/app/:path*", "/learn/:path*", "/admin/:path*", "/api/:path*"] };
