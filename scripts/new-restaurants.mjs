// 서울 열린데이터광장 LOCALDATA(일반음식점 인허가)로 회사 인근 신규 오픈 식당을 수집한다.
// 실행: SEOUL_OPENDATA_KEY=<인증키> node scripts/new-restaurants.mjs [--months 12] [--apply]
//   --apply 없이 실행하면 결과만 출력(드라이런), --apply 시 src/data/newPlaces.json 갱신.
// 좌표: LOCALDATA의 X/Y(TM 중부원점)는 기존 restaurants.json 실측 dx/dy와 상호명 매칭한
//   앵커들의 중앙값 오프셋으로 회사 원점을 역산해 상대좌표(m)로 환산한다(반경 1.5km에서 오차 수 m).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

let KEY = process.env.SEOUL_OPENDATA_KEY;
if (!KEY) {
  // .env.local 폴백 (Windows에서 인라인 env 지정이 번거로움)
  try {
    const env = readFileSync(path.join(root, ".env.local"), "utf8");
    KEY = env.match(/^SEOUL_OPENDATA_KEY=(.+)$/m)?.[1]?.trim();
  } catch {}
}
if (!KEY) {
  console.error("SEOUL_OPENDATA_KEY 환경변수(.env.local 가능)가 필요합니다");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const monthsIdx = process.argv.indexOf("--months");
const MONTHS = monthsIdx > -1 ? Number(process.argv[monthsIdx + 1]) : 12;
const MAX_DIST = 1500;

const cutoffDate = new Date();
cutoffDate.setMonth(cutoffDate.getMonth() - MONTHS);
const CUTOFF = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD (인허가일자 포맷과 동일)

// 서린빌딩 반경 1.5km가 걸치는 자치구: 종로구(JN), 중구(JG)
const SERVICES = ["LOCALDATA_072404_JN", "LOCALDATA_072404_JG"];
const PAGE = 1000;

async function fetchAll(service) {
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= total; start += PAGE) {
    const end = Math.min(start + PAGE - 1, total);
    const url = `http://openapi.seoul.go.kr:8088/${KEY}/json/${service}/${start}/${end}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${service} ${res.status}`);
    const body = (await res.json())[service];
    if (!body) throw new Error(`${service} 응답 이상: ${JSON.stringify(await res.json()).slice(0, 200)}`);
    total = body.list_total_count;
    rows.push(...body.row);
    process.stdout.write(`\r${service}: ${rows.length}/${total}`);
  }
  console.log();
  return rows;
}

const t = (s) => (s ?? "").trim();
const norm = (s) => t(s).replace(/[\s()·'-]/g, "");

console.log(`인허가 기준일: ${CUTOFF} 이후 (최근 ${MONTHS}개월), 반경 ${MAX_DIST}m\n`);
const all = [];
for (const svc of SERVICES) all.push(...(await fetchAll(svc)));
const open = all.filter((r) => t(r.TRDSTATENM).startsWith("영업") && t(r.X) && t(r.Y));
console.log(`\n전체 ${all.length}건 중 영업+좌표 보유 ${open.length}건`);

// --- 앵커 보정: 기존 실측 식당(dx/dy)과 상호명 매칭 → 회사 원점(TM) 역산 ---
const restaurants = JSON.parse(readFileSync(path.join(root, "src", "data", "restaurants.json"), "utf8")).restaurants;
const offsets = [];
for (const r of restaurants) {
  const core = norm(r.name.split(" ")[0]);
  if (core.length < 2) continue;
  const hit = open.find((row) => {
    const n = norm(row.BPLCNM);
    return n === core || (core.length >= 3 && (n.startsWith(core) || core.startsWith(n)));
  });
  if (hit) offsets.push({ name: r.name, ox: Number(hit.X) - r.dx, oy: Number(hit.Y) - r.dy });
}
if (offsets.length < 5) {
  console.error(`앵커 매칭이 ${offsets.length}건뿐이라 좌표 보정 신뢰 불가`);
  process.exit(1);
}
const median = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const originX = median(offsets.map((o) => o.ox));
const originY = median(offsets.map((o) => o.oy));
// 중앙값에서 200m 넘게 벗어난 앵커는 오매칭으로 보고 통계만 출력
const good = offsets.filter((o) => Math.hypot(o.ox - originX, o.oy - originY) < 200);
console.log(`앵커 ${offsets.length}건 매칭(정합 ${good.length}건) → 회사 TM 원점 (${originX.toFixed(1)}, ${originY.toFixed(1)})\n`);

// --- 신규 오픈 추출 ---
const seen = new Set();
const places = open
  .filter((r) => t(r.APVPERMYMD) >= CUTOFF)
  .map((r) => {
    const dx = Math.round(Number(r.X) - originX);
    const dy = Math.round(Number(r.Y) - originY);
    return {
      name: t(r.BPLCNM),
      category: t(r.UPTAENM) || "기타",
      opened: t(r.APVPERMYMD),
      address: t(r.RDNWHLADDR) || t(r.SITEWHLADDR),
      dx,
      dy,
      distM: Math.round(Math.hypot(dx, dy)),
    };
  })
  .filter((p) => p.distM <= MAX_DIST)
  .filter((p) => {
    const k = norm(p.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => a.distM - b.distM);

for (const p of places) console.log(`🆕 ${p.opened} | ${p.distM}m | ${p.name} (${p.category}) | ${p.address}`);
console.log(`\n신규 오픈 ${places.length}곳 (${CUTOFF} 이후 인허가, ${MAX_DIST}m 이내)`);

if (APPLY) {
  const out = {
    _comment: `서울 열린데이터광장 LOCALDATA 일반음식점 인허가(종로구·중구). 최근 ${MONTHS}개월 내 인허가 + 영업 중 + 회사 ${MAX_DIST}m 이내. node scripts/new-restaurants.mjs --apply 로 재생성`,
    generatedAt: new Date().toISOString().slice(0, 10),
    cutoff: CUTOFF,
    places,
  };
  writeFileSync(path.join(root, "src", "data", "newPlaces.json"), JSON.stringify(out, null, 2));
  console.log("src/data/newPlaces.json 갱신 완료");
}
