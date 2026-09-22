import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 실행 중인 서버(.next)와 별도로 확인용 dev 서버를 띄울 때: NEXT_DIST_DIR=.next-dev
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdfkit", "sharp", "pdfjs-dist", "jszip", "@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
};

export default nextConfig;
