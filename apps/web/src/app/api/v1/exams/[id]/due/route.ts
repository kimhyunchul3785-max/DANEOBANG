import { prisma } from "@/lib/db";
import { getAcademyContext, audit } from "@/lib/auth";
import { studentScope } from "@/lib/scope";
import { handle, ok, fail, readJson } from "@/lib/api";
import { notifyUser } from "@/lib/notify";
import { fmtMDHM } from "@/lib/util";

/**
 * 마감 연장 (모바일 현장 처리) — 웹 시험 상세의 [마감 변경]과 같은 규칙.
 * body: { days?: number (지금부터 n일 뒤 23:59 KST), dueAt?: ISO | null, scope?: "open" | "overdue" }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await getAcademyContext();
    if (!ctx) return fail(403, "no_academy");
    const { id } = await params;
    const exam = await prisma.exam.findFirst({ where: { id, academyId: ctx.member.academyId }, select: { id: true, title: true } });
    if (!exam) return fail(404, "not_found");
    const body = await readJson<{ days?: number; dueAt?: string | null; scope?: string }>(req);
    let dueAt: Date | null;
    if (typeof body.days === "number" && body.days >= 0 && body.days <= 60) {
      const l = new Date(Date.now() + 9 * 3600e3);
      dueAt = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + Math.round(body.days), 14, 59));
    } else if (body.dueAt === null) dueAt = null;
    else if (typeof body.dueAt === "string" && !Number.isNaN(Date.parse(body.dueAt))) dueAt = new Date(body.dueAt);
    else return fail(422, "invalid_due", "마감(days 또는 dueAt)을 확인하세요.");
    if (dueAt && dueAt.getTime() <= Date.now()) return fail(422, "due_in_past", "마감은 지금보다 뒤여야 해요.");
    const scope = body.scope === "overdue" ? "overdue" : "open";
    const where = { examId: id, student: studentScope(ctx), status: { in: ["assigned", "in_progress"] }, ...(scope === "overdue" ? { dueAt: { lt: new Date() } } : {}) };
    const targets = await prisma.assignment.findMany({ where, select: { id: true, student: { select: { userId: true } } } });
    const r = await prisma.assignment.updateMany({ where, data: { dueAt } });
    await prisma.attempt.updateMany({ where: { assignment: where, status: "in_progress" }, data: { deadlineAt: dueAt } });
    for (const t of targets) if (t.student.userId) await notifyUser(t.student.userId, "시험 마감이 바뀌었어요", `${exam.title} · ${dueAt ? `${fmtMDHM(dueAt)}까지` : "마감 없음"}`, "/learn");
    await audit({ academyId: ctx.member.academyId, userId: ctx.user.id, action: "exam.due", target: id, detail: `mobile ${scope} → ${dueAt?.toISOString() ?? "none"} (${r.count})` });
    return ok({ updated: r.count, dueAt });
  }, req);
}
