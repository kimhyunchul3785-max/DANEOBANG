import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 실행 중인 서버(.next)와 별도로 확인용 dev 서버를 띄울 때: NEXT_DIST_DIR=.next-dev
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdfkit", "sharp", "pdfjs-dist", "jszip", "@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  // monorepo: 파일 추적 루트를 저장소 루트로 (pnpm-lock 이 루트에 있음)
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // 워크스페이스 공용 패키지는 TS 소스 그대로 가져오므로 Next 가 트랜스파일한다
  transpilePackages: ["@daneobang/types", "@daneobang/validation", "@daneobang/api-client", "@daneobang/design-tokens", "@daneobang/utils"],
};

export default nextConfig;
