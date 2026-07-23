// 웹 실사(2026-07-23)로 확인한 캐치테이블 입점 식당(법인카드 방문 이력 없는 곳)을
// 카카오 로컬 API로 지오코딩해 src/data/catchPlaces.json을 생성한다.
// 실행: node scripts/catch-places.mjs [--apply]  (KAKAO_REST_KEY는 .env.local 폴백 지원)
// 반경 1.5km 초과·미검색 식당은 제외하고 결과에 사유를 출력한다.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

let KEY = process.env.KAKAO_REST_KEY;
if (!KEY) {
  try {
    const env = readFileSync(path.join(root, ".env.local"), "utf8");
    KEY = env.match(/^KAKAO_REST_KEY=(.+)$/m)?.[1]?.trim();
  } catch {}
}
if (!KEY) {
  console.error("KAKAO_REST_KEY 환경변수(.env.local 가능)가 필요합니다");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const MAX_DIST = 1500;

// 실사 확정 목록 — slug가 null이면 캐치테이블 키워드 검색 링크로 폴백
// query: 카카오 로컬 검색어 (동명이점 방지를 위해 지점/지역 포함)
const SEEDS = [
  { name: "도우룸", query: "도우룸 광화문", cuisine: "양식", slug: "doughroom", priceHint: "보통" },
  { name: "울프강 스테이크하우스 광화문점", query: "울프강 스테이크하우스 광화문", cuisine: "양식", slug: "wolfgangssteakhouse_gwanghwa", priceHint: "고급" },
  { name: "고청담 광화문 디타워점", query: "고청담 디타워", cuisine: "한식", slug: "gocheongdam_gwm", priceHint: "고급" },
  { name: "스시 키마에", query: "스시 키마에 종로", cuisine: "일식", slug: null, priceHint: "보통" },
  { name: "KUT", query: "KUT", cuisine: "한식", slug: "KUT", priceHint: "고급" },
  // 뉵·청와성·아임쏘서울: catchtable.net 단독 출처 + 카카오 로컬 미등록이라 실존 근거 부족 — 제외
  { name: "우육면관 광화문점", query: "우육면관 관철동", cuisine: "중식", slug: "niuroumianguan", priceHint: "저렴" },
  { name: "꽃, 밥에피다", query: "꽃밥에피다 인사동", cuisine: "한식", slug: "flower_blossom_on_the_rice", priceHint: "보통" },
  { name: "온6.5", query: "온6.5 북촌", cuisine: "한식", slug: "on65", priceHint: "보통" },
  { name: "규반", query: "규반 을지로", cuisine: "한식", slug: "gyuban", priceHint: "고급" },
  { name: "진진만두 시청점", query: "진진만두 을지로1가", cuisine: "중식", slug: "jinjinmanducityhall", priceHint: "저렴" },
  { name: "왕비집 시청무교점", query: "왕비집 무교", cuisine: "한식", slug: "queenhousecityhall", priceHint: "보통" },
  // 주옥·오울: 카카오 로컬에 점포 미등록 — 소재 호텔 건물 좌표로 폴백(fallbackQuery)
  { name: "주옥", query: "주옥 한식 소공로", fallbackQuery: "더플라자호텔", cuisine: "한식", slug: "joook", priceHint: "고급" },
  { name: "무궁화", query: "무궁화 롯데호텔 서울", cuisine: "한식", slug: "lotteseoul_mugunghwa", priceHint: "고급" },
  { name: "오울", query: "포시즌스호텔 오울", fallbackQuery: "포시즌스호텔 서울", cuisine: "한식", slug: "fourseasons_oul", priceHint: "고급" },
];

async function search(query, x, y) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("x", x);
  url.searchParams.set("y", y);
  url.searchParams.set("radius", "3000");
  url.searchParams.set("sort", "distance");
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).documents;
}

const company = (await search("SK서린빌딩", "126.98033123", "37.56978877"))[0];
const cx = Number(company.x), cy = Number(company.y);
const M_PER_LAT = 111320;
const mPerLng = M_PER_LAT * Math.cos((cy * Math.PI) / 180);

const places = [];
for (const s of SEEDS) {
  let docs = await search(s.query, String(cx), String(cy));
  let doc = docs.find((d) => d.category_group_code === "FD6") ?? docs[0];
  if (!doc && s.fallbackQuery) {
    docs = await search(s.fallbackQuery, String(cx), String(cy));
    doc = docs[0];
    if (doc) console.log(`  (${s.name}: '${s.fallbackQuery}' 건물 좌표로 폴백)`);
  }
  if (!doc) {
    console.log(`✗ ${s.name}: 카카오 검색 실패 — 제외`);
    continue;
  }
  const dx = Math.round((Number(doc.x) - cx) * mPerLng);
  const dy = Math.round((Number(doc.y) - cy) * M_PER_LAT);
  const distM = Math.round(Math.hypot(dx, dy));
  if (distM > MAX_DIST) {
    console.log(`✗ ${s.name}: ${distM}m — 반경 ${MAX_DIST}m 초과로 제외`);
    continue;
  }
  places.push({
    name: s.name,
    cuisine: s.cuisine,
    priceHint: s.priceHint,
    url: s.slug
      ? `https://app.catchtable.co.kr/ct/shop/${s.slug}`
      : `https://app.catchtable.co.kr/ct/search?keyword=${encodeURIComponent(s.name)}`,
    address: doc.road_address_name || doc.address_name,
    placeUrl: doc.place_url,
    dx,
    dy,
    distM,
  });
  console.log(`✓ ${s.name}: ${distM}m (${doc.place_name} / ${doc.road_address_name || doc.address_name})`);
}

places.sort((a, b) => a.distM - b.distM);
console.log(`\n총 ${places.length}곳`);
if (APPLY) {
  const out = path.join(root, "src", "data", "catchPlaces.json");
  writeFileSync(out, JSON.stringify({ updated: "2026-07-23", places }, null, 2) + "\n");
  console.log(`저장: ${out}`);
}
