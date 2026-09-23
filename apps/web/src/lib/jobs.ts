import { prisma } from "./db";
import { writeLog } from "./logger";

export type JobType = "import" | "render_print" | "analyze_scan";

type Handler = (job: { id: string; resourceId: string; payload: Record<string, unknown>; academyId: string | null }) => Promise<unknown>;
const handlers: Partial<Record<JobType, Handler>> = {};

export function registerJobHandler(type: JobType, h: Handler) {
  handlers[type] = h;
}

/** 영속 job 등록 후 즉시 백그라운드 실행. 같은 idempotencyKey 는 재등록하지 않는다. */
export async function enqueueJob(type: JobType, resourceId: string, academyId: string | null, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
  const key = idempotencyKey ?? `${type}:${resourceId}`;
  const existing = await prisma.job.findUnique({ where: { idempotencyKey: key } });
  if (existing && existing.status !== "failed") return existing;
  const job = existing
    ? await prisma.job.update({ where: { id: existing.id }, data: { status: "queued", error: null, availableAt: new Date(), attempts: 0 } })
    : await prisma.job.create({ data: { type, resourceId, academyId, payload: JSON.stringify(payload), idempotencyKey: key } });
  setImmediate(() => runJob(job.id).catch((e) => console.error("job failed", job.id, e)));
  return job;
}

const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export async function runJob(id: string) {
  // lease 확보 (동시 실행 방지)
  const now = new Date();
  const claimed = await prisma.job.updateMany({
    where: { id, OR: [{ status: "queued" }, { status: "running", leaseExpiresAt: { lt: now } }] },
    data: { status: "running", leaseExpiresAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;
  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  const handler = handlers[job.type as JobType];
  if (!handler) {
    await ensureHandlers();
    return runJobWithHandler(job);
  }
  return runJobWithHandler(job);
}

async function runJobWithHandler(job: { id: string; type: string; resourceId: string; payload: string; academyId: string | null; attempts: number }) {
  const handler = handlers[job.type as JobType];
  if (!handler) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "failed", error: "no_handler" } });
    return;
  }
  const t0 = Date.now();
  try {
    const result = await handler({ id: job.id, resourceId: job.resourceId, payload: JSON.parse(job.payload || "{}"), academyId: job.academyId });
    await prisma.job.update({ where: { id: job.id }, data: { status: "done", result: JSON.stringify(result ?? null), leaseExpiresAt: null } });
    writeLog({ kind: "job", academy: job.academyId, event: `${job.type}:done`, detail: { jobId: job.id, resourceId: job.resourceId, result }, ms: Date.now() - t0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeLog({ kind: "job", academy: job.academyId, event: `${job.type}:failed`, detail: { jobId: job.id, resourceId: job.resourceId, error: msg, attempt: job.attempts }, ms: Date.now() - t0 });
    const permanent = (e as { permanent?: boolean }).permanent === true || job.attempts >= MAX_ATTEMPTS;
    await prisma.job.update({
      where: { id: job.id },
      data: permanent ? { status: "failed", error: msg, leaseExpiresAt: null } : { status: "queued", error: msg, availableAt: new Date(Date.now() + 5000 * job.attempts), leaseExpiresAt: null },
    });
    if (!permanent) setTimeout(() => runJob(job.id).catch(() => null), 5000 * job.attempts);
  }
}

export class PermanentJobError extends Error {
  permanent = true;
}

/** 서버 시작 시 남아있는 queued/만료 running job 재개 */
export async function resumePendingJobs() {
  await ensureHandlers();
  const jobs = await prisma.job.findMany({ where: { OR: [{ status: "queued" }, { status: "running", leaseExpiresAt: { lt: new Date() } }] }, take: 100 });
  for (const j of jobs) setImmediate(() => runJob(j.id).catch(() => null));
  return jobs.length;
}

let ensured = false;
async function ensureHandlers() {
  if (ensured) return;
  ensured = true;
  await import("./job-handlers");
}
