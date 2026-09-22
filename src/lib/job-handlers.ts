import { prisma } from "./db";
import { registerJobHandler, PermanentJobError } from "./jobs";
import { readFile } from "./storage";
import { extractDocument, PARSER_ERRORS, type ExtractedRow } from "./parsers";
import { planDays, distribution, DEFAULT_SPLIT_DAYS, type SplitMode } from "./day-split";
import { writeLog } from "./logger";

function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * 추출된 행을 바로 단어장에 저장한다 (검수 화면 없음).
 * DAY: 문서에 DAY 표기가 충분하면(80% 이상) 그대로, 없으면 기본 7일로 균등 분할.
 * 기존 단어장에 추가하는 경우 새 DAY 는 기존 마지막 DAY 다음부터 이어 붙인다.
 */
export async function saveRowsToBook(params: { academyId: string; createdById: string; bookId: string | null; title: string; rows: ExtractedRow[] }) {
  const { academyId, createdById, rows } = params;
  const withDay = rows.filter((r) => r.dayNo && r.dayNo > 0).length;
  const mode: SplitMode = rows.length && withDay >= rows.length * 0.8 ? "doc" : "days";
  return prisma.$transaction(async (tx) => {
    let bookId = params.bookId;
    if (!bookId) {
      const b = await tx.vocabBook.create({ data: { academyId, createdById, title: params.title } });
      bookId = b.id;
    }
    const existingMax = await tx.bookDay.aggregate({ where: { bookId }, _max: { dayNo: true } });
    const sortBase = (await tx.word.aggregate({ where: { bookId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const offset = mode === "doc" ? 0 : (existingMax._max.dayNo ?? 0);
    const plan = planDays(
      rows.map((r) => ({ dayNo: r.dayNo, section: r.section })),
      mode,
      DEFAULT_SPLIT_DAYS,
      offset,
    );
    const dayIds = new Map<number, string>();
    for (const d of distribution(plan)) {
      const day = await tx.bookDay.upsert({ where: { bookId_dayNo: { bookId, dayNo: d.dayNo } }, update: {}, create: { bookId, dayNo: d.dayNo, label: d.label } });
      dayIds.set(d.dayNo, day.id);
    }
    // 같은 단어장 안의 영어+뜻 중복은 건너뛴다
    const existing = await tx.word.findMany({ where: { bookId }, select: { english: true, meaning: true } });
    const seen = new Set(existing.map((w) => `${w.english.toLowerCase()}|${w.meaning}`));
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const key = `${r.english.toLowerCase()}|${r.meaning}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      await tx.word.create({
        data: { bookId, dayId: dayIds.get(plan[i].dayNo)!, english: r.english, pos: r.pos, meaning: r.meaning, synonyms: r.synonyms, section: r.section, sortOrder: sortBase + 1 + i },
      });
      created++;
    }
    return { bookId, created, skipped, mode, days: dayIds.size };
  });
}

// ───── 문서 분석 → 단어장 자동 저장 ─────
registerJobHandler("import", async ({ resourceId }) => {
  const imp = await prisma.import.findUnique({ where: { id: resourceId } });
  if (!imp) throw new PermanentJobError("import_not_found");
  await prisma.import.update({ where: { id: imp.id }, data: { status: "processing" } });
  try {
    const buf = await readFile(imp.filePath);
    const { type, result } = await extractDocument(buf, imp.fileName);
    if (!result.rows.length) {
      await prisma.import.update({
        where: { id: imp.id },
        data: { fileType: type, status: "failed", errorCode: "no_rows", warnings: JSON.stringify([...result.warnings, "추출된 단어가 없습니다. 지원 양식: 번호형 항목(001 / 표제어 / 품사 뜻), DAY 제목 + 영어/품사/뜻 표, 또는 '영어 품사 뜻' 한 줄 형식."]), meta: JSON.stringify(result.meta) },
      });
      throw new PermanentJobError("no_rows");
    }
    await prisma.$transaction([
      prisma.importRow.deleteMany({ where: { importId: imp.id } }),
      ...result.rows.map((r, i) =>
        prisma.importRow.create({
          data: { importId: imp.id, seq: i + 1, dayLabel: r.dayLabel, dayNo: r.dayNo, english: r.english, pos: r.pos, meaning: r.meaning, synonyms: r.synonyms, section: r.section, source: r.source, warning: r.warning, status: "approved" },
        }),
      ),
    ]);
    const saved = await saveRowsToBook({ academyId: imp.academyId, createdById: imp.createdById, bookId: imp.bookId, title: titleFromFileName(imp.fileName), rows: result.rows });
    const sections = new Set(result.rows.map((r) => r.section).filter(Boolean)).size;
    await prisma.$transaction([
      prisma.import.update({
        where: { id: imp.id },
        data: {
          fileType: type,
          bookId: saved.bookId,
          status: "approved",
          errorCode: null,
          warnings: JSON.stringify(result.warnings),
          meta: JSON.stringify({ ...result.meta, words: saved.created, skipped: saved.skipped, dayMode: saved.mode, days: saved.days, sections, docDayRows: result.rows.filter((r) => r.dayNo).length }),
        },
      }),
      prisma.usageEvent.create({ data: { academyId: imp.academyId, kind: "import_page", amount: Number((result.meta as { pages?: number }).pages ?? 1) } }),
    ]);
    writeLog({ kind: "job", academy: imp.academyId, event: "import:saved", detail: { importId: imp.id, bookId: saved.bookId, words: saved.created, skipped: saved.skipped, dayMode: saved.mode, days: saved.days, profile: result.meta.profile } });
    return { rows: result.rows.length, bookId: saved.bookId, words: saved.created, dayMode: saved.mode, days: saved.days };
  } catch (e) {
    const code = e instanceof Error ? e.message : "unknown";
    if (code === "no_rows") throw e;
    const known = PARSER_ERRORS[code];
    await prisma.import.update({
      where: { id: imp.id },
      data: { status: "failed", errorCode: code, warnings: JSON.stringify([known ?? `분석 실패: ${code}`]) },
    });
    throw new PermanentJobError(code);
  }
});

// ───── 종이 시험지 렌더 / 사진 판독 (omr 모듈에서 등록) ─────
import "./omr/handlers";
