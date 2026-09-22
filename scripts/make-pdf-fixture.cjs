const PDFDocument = require("pdfkit");
const fs = require("fs");
const words = {
  14: [["abandon", "v.", "버리다, 포기하다"], ["accurate", "a.", "정확한"], ["acquire", "v.", "얻다, 습득하다"]],
  15: [["apparent", "a.", "명백한"], ["assess", "v.", "평가하다"], ["barrier", "n.", "장벽, 장애물"]],
  17: [["derive", "v.", "얻다, 유래하다"], ["distinct", "a.", "뚜렷한, 별개의"]],
};
const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("fixtures/sample.pdf"));
doc.registerFont("KR", "assets/fonts/NotoSansKR-Regular.otf");
doc.font("KR");
let y = 60;
for (const d of [14, 15, 17]) {
  doc.fontSize(14).text(`DAY ${d}`, 50, y); y += 26;
  doc.fontSize(11);
  for (const [e, p, m] of words[d]) { doc.text(e, 50, y); doc.text(p, 200, y); doc.text(m, 240, y); y += 18; }
  y += 10;
}
doc.addPage(); // 빈 페이지(스캔 흉내)
doc.end();
