// 현재 식당 DB(restaurants.json + importedRestaurants.json + visits.json 통계)를 엑셀(.xlsx)로 내보낸다.
// 통합평점·방문횟수 등 파생 필드는 src/lib/data.ts buildRestaurants와 동일 공식.
// 사용: node scripts/export-restaurants-xlsx.mjs [출력경로=식당DB.xlsx]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, 'src/data', p), 'utf8'));

const restaurantsJson = readJson('restaurants.json');
const importedJson = readJson('importedRestaurants.json');
const visitsJson = readJson('visits.json');

// --- 통계 합산 (src/lib/assign.ts mergeStats와 동일) ---
function mergeStats(...sources) {
  const out = {};
  for (const src of sources) {
    for (const [rid, s] of Object.entries(src)) {
      const t = (out[rid] ??= { count: 0, totalAmount: 0, lastDate: '', byAccount: {}, recent: [] });
      t.count += s.count;
      t.totalAmount += s.totalAmount;
      if (s.lastDate > t.lastDate) t.lastDate = s.lastDate;
      for (const [a, n] of Object.entries(s.byAccount)) t.byAccount[a] = (t.byAccount[a] ?? 0) + n;
    }
  }
  return out;
}

const stats = mergeStats(visitsJson.stats, importedJson.stats ?? {});
const seeds = [...restaurantsJson.restaurants, ...(importedJson.restaurants ?? [])];

const PRICE_LABEL = { 1: '2~3만원대', 2: '4~6만원대', 3: '10만원 이상' };
const fmtDate = (ymd) => (ymd?.length >= 8 ? `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}` : '');

const rows = seeds.map((r) => {
  const s = stats[r.id];
  const reviewCount = r.kakao.count + r.naver.count + r.google.count;
  const rating =
    reviewCount > 0
      ? Math.round(
          ((r.kakao.score * r.kakao.count + r.naver.score * r.naver.count + r.google.score * r.google.count) /
            reviewCount) *
            10
        ) / 10
      : 0;
  // 룸/주차 추정 (data.ts와 동일 — features 기입 시 그 값 우선, pending 스텁은 추정 안 함)
  const f = r.features ?? (r.pending
    ? {}
    : { room: r.priceTier === 3 || (r.priceTier === 2 && r.purposes.includes('접대')), parking: r.priceTier === 3 });
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    desc: r.desc ?? '',
    priceTier: r.priceTier,
    priceLabel: PRICE_LABEL[r.priceTier] ?? '',
    purposes: (r.purposes ?? []).join(' · '),
    distM: r.distM,
    walkMin: Math.max(1, Math.round(r.distM / 67)),
    rating,
    reviewCount,
    kakaoScore: r.kakao.score, kakaoCount: r.kakao.count,
    naverScore: r.naver.score, naverCount: r.naver.count,
    googleScore: r.google.score, googleCount: r.google.count,
    naverBooking: r.naverBooking ? 'O' : '',
    catchtable: r.catchtable ? 'O' : '',
    room: f.room ? 'O' : '',
    parking: f.parking ? 'O' : '',
    visitCount: s?.count ?? 0,
    totalAmount: s?.totalAmount ?? 0,
    lastDate: fmtDate(s?.lastDate ?? ''),
    byAccount: Object.entries(s?.byAccount ?? {}).map(([a, n]) => `${a} ${n}`).join(' · '),
    address: r.address ?? '',
    placeUrl: r.placeUrl ?? '',
    source: r.source === 'import' ? '정산자동등록' : '큐레이션',
  };
});

// --- 컬럼 정의: [헤더, 너비, 값추출] ---
const COLS = [
  ['ID', 7, (r) => r.id],
  ['식당명', 22, (r) => r.name],
  ['음식종류', 9, (r) => r.cuisine],
  ['설명', 18, (r) => r.desc],
  ['가격대', 7, (r) => r.priceTier],
  ['가격대 라벨', 12, (r) => r.priceLabel],
  ['이용목적', 16, (r) => r.purposes],
  ['거리(m)', 8, (r) => r.distM],
  ['도보(분)', 8, (r) => r.walkMin],
  ['통합평점', 9, (r) => r.rating],
  ['리뷰수 합계', 11, (r) => r.reviewCount],
  ['카카오 평점', 11, (r) => r.kakaoScore],
  ['카카오 리뷰', 11, (r) => r.kakaoCount],
  ['네이버 평점', 11, (r) => r.naverScore],
  ['네이버 리뷰', 11, (r) => r.naverCount],
  ['구글 평점', 10, (r) => r.googleScore],
  ['구글 리뷰', 10, (r) => r.googleCount],
  ['네이버예약', 10, (r) => r.naverBooking],
  ['캐치테이블', 10, (r) => r.catchtable],
  ['룸(추정)', 9, (r) => r.room],
  ['주차(추정)', 10, (r) => r.parking],
  ['방문횟수', 9, (r) => r.visitCount],
  ['총사용금액(원)', 14, (r) => r.totalAmount],
  ['최근방문일', 11, (r) => r.lastDate],
  ['계정별 횟수', 24, (r) => r.byAccount],
  ['주소', 30, (r) => r.address],
  ['카카오맵', 36, (r) => r.placeUrl],
  ['출처', 12, (r) => r.source],
];

// --- 최소 xlsx 생성 (inline string, fflate zip) ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colName = (i) => {
  let n = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) n = String.fromCharCode(65 + ((i - 1) % 26)) + n;
  return n;
};
const cell = (col, row, v, styleId = 0) => {
  const ref = `${colName(col)}${row}`;
  const s = styleId ? ` s="${styleId}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (v === '' || v == null) return '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
};

const headerRow = `<row r="1">${COLS.map(([h], i) => cell(i, 1, h, 1)).join('')}</row>`;
const bodyRows = rows
  .map((r, ri) => `<row r="${ri + 2}">${COLS.map(([, , fn], ci) => cell(ci, ri + 2, fn(r))).join('')}</row>`)
  .join('');
const colsXml = `<cols>${COLS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${colsXml}<sheetData>${headerRow}${bodyRows}</sheetData></worksheet>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs></styleSheet>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="식당DB" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const files = {
  '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
  '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
  'xl/workbook.xml': strToU8(workbook),
  'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  'xl/worksheets/sheet1.xml': strToU8(sheet),
  'xl/styles.xml': strToU8(styles),
};

const out = process.argv[2] ?? join(root, '식당DB.xlsx');
writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`${out} — 식당 ${rows.length}곳 (curated ${seeds.length - (importedJson.restaurants?.length ?? 0)} + import ${importedJson.restaurants?.length ?? 0})`);
