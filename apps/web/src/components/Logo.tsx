import Image from "next/image";
import Link from "next/link";

/** 단어방 로고. wordmark = 한글만, full = 한글 + 單語房 */
export function Logo({ variant = "wordmark", light = false, height = 22, href = "/", className }: { variant?: "wordmark" | "full"; light?: boolean; height?: number; href?: string | null; className?: string }) {
  const src = variant === "full" ? (light ? "/logo-light.png" : "/logo.png") : light ? "/wordmark-light.png" : "/wordmark.png";
  const ratio = variant === "full" ? 532 / 330 : 528 / 182;
  const img = <Image src={src} alt="단어방" width={Math.round(height * ratio)} height={height} priority className={className} style={{ height, width: "auto" }} />;
  return href ? (
    <Link href={href} aria-label="단어방 홈" className="inline-flex min-h-[40px] items-center">
      {img}
    </Link>
  ) : (
    img
  );
}
