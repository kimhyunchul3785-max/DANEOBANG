import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { handle, ok, fail, readJson } from "@/lib/api";
import { isPhone, normalizePhone } from "@/lib/sms";

/** 모바일용 이메일 로그인 → Bearer 토큰 (ALLOW_DEV_LOGIN=false 면 비활성) */
export async function POST(req: Request) {
  return handle(async () => {
    if ((process.env.ALLOW_DEV_LOGIN ?? "true") === "false") return fail(403, "email_login_disabled");
    const body = await readJson<{ email?: string; phone?: string; password?: string }>(req);
    const id = (body.email ?? body.phone ?? "").trim();
    let user = null;
    if (isPhone(id)) {
      // 휴대폰 가입 학생: 번호 + 비밀번호
      for (const u of await prisma.user.findMany({ where: { phone: normalizePhone(id) } })) if (u.passwordHash && body.password && (await bcrypt.compare(body.password, u.passwordHash))) user = u;
    } else if (id) {
      user = await prisma.user.findUnique({ where: { email: id.toLowerCase() } });
      if (user && !(user.passwordHash && body.password && (await bcrypt.compare(body.password, user.passwordHash)))) user = null;
    }
    if (!user) return fail(401, "invalid_credentials", "이메일(또는 휴대폰 번호) 또는 비밀번호가 올바르지 않습니다.");
    if (user.status !== "active") return fail(403, "suspended");
    const token = await signToken(user.id, "mobile", "30d");
    return ok({ token, user: { id: user.id, name: user.name, email: user.email } });
  }, req);
}
