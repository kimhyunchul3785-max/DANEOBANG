/** 서버 시작 시: 남아있는 job 재개 (worker 재시작 복구) */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumePendingJobs } = await import("./lib/jobs");
    try {
      const n = await resumePendingJobs();
      if (n) console.log(`[jobs] resumed ${n} pending job(s)`);
    } catch (e) {
      console.error("[jobs] resume failed", e);
    }
  }
}
