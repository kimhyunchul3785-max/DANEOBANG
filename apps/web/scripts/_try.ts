import fs from "fs";
import { extractDocument } from "../src/lib/parsers";
(async () => {
  const f = process.argv[2];
  const { type, result } = await extractDocument(fs.readFileSync(f), f);
  console.log(type, "rows", result.rows.length, "meta", JSON.stringify(result.meta), "warnings", result.warnings);
  const secs = [...new Set(result.rows.map((r) => r.section))];
  console.log("sections", secs.length, secs.slice(0, 5));
  console.log("with pos", result.rows.filter((r) => r.pos).length, "with syn", result.rows.filter((r) => r.synonyms).length, "dayNo set", result.rows.filter((r) => r.dayNo).length);
  const n = Number(process.argv[3] ?? 30);
  for (const r of result.rows.slice(0, n)) console.log(` ${r.source.padEnd(14)} | ${r.section ?? ""} | ${r.english} | ${r.pos ?? ""} | ${r.meaning} | syn=${r.synonyms ?? ""}`);
  const bad = result.rows.filter((r) => r.meaning.length > 30 || /[.!?]$/.test(r.meaning) || !/[가-힣]/.test(r.meaning));
  console.log("suspicious", bad.length, bad.slice(0, 10).map((r) => `${r.english} => ${r.meaning}`));
  const dup = result.rows.map((r) => r.english).filter((e, i, a) => a.indexOf(e) !== i);
  console.log("dup english", dup.length, dup.slice(0, 10));
})();
