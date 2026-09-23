import fs from "fs";
import path from "path";
import { extractDocument, PARSER_ERRORS } from "../src/lib/parsers";

async function run(file: string) {
  const buf = fs.readFileSync(path.join("fixtures", file));
  try {
    const { type, result } = await extractDocument(buf, file);
    console.log(`\n== ${file} (${type}) rows=${result.rows.length} warnings=${result.warnings.length}`);
    for (const r of result.rows) console.log(`  ${r.dayLabel ?? "?"} | ${r.english} | ${r.pos ?? ""} | ${r.meaning} | ${r.source}${r.warning ? " | ⚠ " + r.warning : ""}`);
    for (const w of result.warnings) console.log("  ⚠", w);
    return result.rows.length;
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    console.log(`\n== ${file} → ERROR ${code}: ${PARSER_ERRORS[code] ?? "(unmapped)"}`);
    return -1;
  }
}

(async () => {
  const results: Record<string, number> = {};
  for (const f of ["sample.hwpx", "sample.docx", "sample.pdf", "fake.hwpx", "legacy.hwp", "legacy-renamed.hwpx"]) results[f] = await run(f);
  const ok = results["sample.hwpx"] === 8 && results["sample.docx"] === 8 && results["sample.pdf"] === 8 && results["fake.hwpx"] === -1 && results["legacy.hwp"] === -1 && results["legacy-renamed.hwpx"] === -1;
  console.log("\nRESULT:", ok ? "PASS" : "FAIL", results);
  process.exit(ok ? 0 : 1);
})();
