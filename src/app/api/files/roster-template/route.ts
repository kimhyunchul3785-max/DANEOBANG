import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAcademyContext } from "@/lib/auth";

/** 학생 등록 양식(.xlsx): 시트 = 반, 열 = 이름 · 학교 · 학년 · 휴대폰 · 이메일(선택). 현재 반이 있으면 시트로 미리 만들어 준다 */
export async function GET() {
  const ctx = await getAcademyContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "단어방";
  const classes = await prisma.classRoom.findMany({ where: { academyId: ctx.member.academyId, archived: false }, orderBy: { name: "asc" } });
  const names = classes.length ? classes.map((c) => c.name) : ["A반", "B반"];
  for (const [i, name] of names.entries()) {
    const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    ws.columns = [
      { header: "이름", key: "name", width: 14 },
      { header: "학교", key: "school", width: 16 },
      { header: "학년(예: 고1)", key: "grade", width: 14 },
      { header: "휴대폰(인증번호 발송)", key: "phone", width: 20 },
      { header: "이메일(선택)", key: "email", width: 28 },
    ];
    ws.getRow(1).font = { bold: true };
    if (i === 0) {
      ws.addRow({ name: "예시) 김민준", school: "한빛고", grade: "고1", phone: "010-1234-5678", email: "minjun@example.com" });
      ws.getRow(2).font = { color: { argb: "FF8B8780" } };
    }
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("학생등록양식.xlsx")}`,
      "cache-control": "no-store",
    },
  });
}
