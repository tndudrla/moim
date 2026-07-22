// 현재 식당 DB(restaurants.json + visits.json)를 팀원 공유용 엑셀로 내보낸다.
// 팀원이 행을 추가해 돌려주면 다시 반영하는 용도 (편집 대상: 식당목록 시트).
// 실행: node scripts/export-xlsx.mjs → 모심_식당목록.xlsx

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const { restaurants } = JSON.parse(readFileSync(path.join(root, "src/data/restaurants.json"), "utf8"));
const { stats } = JSON.parse(readFileSync(path.join(root, "src/data/visits.json"), "utf8"));

const PRICE = { 1: "2~3만원대", 2: "4~6만원대", 3: "10만원 이상" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

// 셀: 문자열은 inlineStr, 숫자는 v. s=1 이면 굵게(헤더)
function rowXml(r, cells, headerStyle = false) {
  const cs = cells
    .map((v, i) => {
      const ref = `${colLetter(i)}${r}`;
      const s = headerStyle ? ' s="1"' : "";
      if (v === null || v === undefined || v === "") return "";
      if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    })
    .join("");
  return `<row r="${r}">${cs}</row>`;
}

function sheetXml(rows, widths) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

// --- 시트1: 식당목록 ---
const HEADERS = ["식당명", "음식종류", "한줄소개", "가격대(1인)", "목적(쉼표로 복수)", "회사에서 거리(m)", "네이버예약(Y/N)", "캐치테이블(Y/N)", "방문횟수(자동집계)", "평점(참고)", "비고"];
const rows1 = [rowXml(1, HEADERS, true)];
const sorted = [...restaurants].sort((a, b) => (stats[b.id]?.count ?? 0) - (stats[a.id]?.count ?? 0));
sorted.forEach((r, i) => {
  const s = stats[r.id];
  const rating = ((r.kakao.score * r.kakao.count + r.google.score * r.google.count) / (r.kakao.count + r.google.count)).toFixed(1);
  rows1.push(
    rowXml(i + 2, [
      r.name, r.cuisine, r.desc, PRICE[r.priceTier], r.purposes.join(", "), r.distM,
      r.naverBooking ? "Y" : "N", r.catchtable ? "Y" : "N", s?.count ?? 0, Number(rating), "",
    ])
  );
});
const sheet1 = sheetXml(rows1, [22, 10, 40, 14, 20, 16, 14, 14, 16, 10, 30]);

// --- 시트2: 작성안내 ---
const guide = [
  ["모심(Mosim) 식당 DB — 작성 안내"],
  [""],
  ["새 식당을 추가하려면 '식당목록' 시트 맨 아래에 행을 추가해 주세요."],
  ["필수: 식당명 / 음식종류 / 가격대(1인) / 목적. 나머지는 비워도 됩니다."],
  [""],
  ["허용 값"],
  ["음식종류", "한식, 일식, 중식, 양식, 동남아 중 하나"],
  ["가격대(1인)", "2~3만원대, 4~6만원대, 10만원 이상 중 하나"],
  ["목적", "점심, 저녁 회식, 접대 — 복수면 쉼표로 (예: 점심, 저녁 회식)"],
  ["회사에서 거리(m)", "SK서린빌딩 기준 도보 거리(m). 모르면 비워두세요 (지도로 자동 계산 예정)"],
  ["네이버예약/캐치테이블", "Y 또는 N. 모르면 비워두세요"],
  [""],
  ["주의"],
  ["- 방문횟수/평점 열은 자동 집계 값이라 수정해도 반영되지 않습니다."],
  ["- 기존 행의 식당명은 수정하지 말아 주세요 (내부 데이터와 매칭 키)."],
  ["- 회사 반경 1.5km 안팎의 실제 영업 중인 식당으로 부탁드립니다."],
];
const rows2 = guide.map((cells, i) => rowXml(i + 1, cells, i === 0 || cells[0] === "허용 값" || cells[0] === "주의"));
const sheet2 = sheetXml(rows2, [24, 70]);

// --- 패키징 ---
const xml = (s) => strToU8(s);
const files = {
  "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
  "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
  "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="식당목록" sheetId="1" r:id="rId1"/><sheet name="작성안내" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  "xl/styles.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
  "xl/worksheets/sheet1.xml": xml(sheet1),
  "xl/worksheets/sheet2.xml": xml(sheet2),
};

const out = path.join(root, "모심_식당목록.xlsx");
writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`생성 완료: ${out} (식당 ${sorted.length}곳)`);
