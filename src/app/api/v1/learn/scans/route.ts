import { getCurrentUser } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/api";
import { submitStudentScan, listStudentScans } from "@/lib/paper";
import { audit } from "@/lib/auth";

/** 학생 본인의 종이 시험 사진 제출 (multipart: files[]) / 최근 제출 상태 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const expectToken = String(form.get("token") ?? "") || undefined;
    if (!files.length) return fail(422, "no_files", "사진을 선택하세요.");
    const results: { fileName: string; ok: boolean; message?: string; scanId?: string; pageNo?: number; pages?: number; attemptId?: string; examTitle?: string }[] = [];
    for (const f of files.slice(0, 10)) {
      try {
        const r = await submitStudentScan({ buf: Buffer.from(await f.arrayBuffer()), fileName: f.name, userId: user.id, expectToken });
        results.push({ fileName: f.name, ok: true, ...r });
      } catch (e) {
        results.push({ fileName: f.name, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    await audit({ userId: user.id, action: "scan.student_submit", detail: `${results.filter((r) => r.ok).length}/${results.length}` });
    return ok({ results });
  }, req);
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    return ok(await listStudentScans(user.id));
  }, req);
}
