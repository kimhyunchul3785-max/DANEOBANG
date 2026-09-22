import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "sharp", "pdfjs-dist", "jszip", "@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
};

export default nextConfig;
