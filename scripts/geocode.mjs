// 카카오 로컬 키워드 검색 API로 식당 실좌표·주소를 조회해 restaurants.json에 반영한다.
// 실행: KAKAO_REST_KEY=<REST API 키> node scripts/geocode.mjs [--apply]
//   --apply 없이 실행하면 조회 결과만 출력(드라이런), --apply 시 파일 갱신.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) {
  console.error("KAKAO_REST_KEY 환경변수가 필요합니다");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const dir = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(dir, "..", "src", "data", "restaurants.json");
const data = JSON.parse(readFileSync(jsonPath, "utf8"));

async function search(query, x, y) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  if (x) {
    url.searchParams.set("x", x);
    url.searchParams.set("y", y);
    url.searchParams.set("radius", "3000");
    url.searchParams.set("sort", "distance");
  }
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).documents;
}

// 1) 회사(SK서린빌딩) 실좌표
const company = (await search("SK서린빌딩"))[0];
const cx = Number(company.x), cy = Number(company.y);
console.log(`회사: ${company.place_name} / ${company.road_address_name} / lng=${cx}, lat=${cy}\n`);

// 2) 식당별 조회 (음식점 카테고리 + 이름 포함 매칭 우선)
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((cy * Math.PI) / 180);
const QUERY_OVERRIDES = {
  "gwanghwamun-gukbap": "광화문국밥 본점",
  dowon: "더플라자 도원",
};
const norm = (s) => s.replace(/\s/g, "");
const results = [];
for (const r of data.restaurants) {
  const docs = await search(QUERY_OVERRIDES[r.id] ?? r.name, cx, cy);
  const food = docs.filter((d) => d.category_group_code === "FD6");
  const core = norm(r.name.split(" ")[0]); // 지점명 제외한 상호
  const best =
    food.find((d) => norm(d.place_name).includes(core)) ??
    docs.find((d) => norm(d.place_name).includes(core)) ??
    food[0] ??
    docs[0];
  if (!best) {
    results.push({ id: r.id, name: r.name, found: null });
    continue;
  }
  const dx = Math.round((Number(best.x) - cx) * M_PER_LNG);
  const dy = Math.round((Number(best.y) - cy) * M_PER_LAT);
  results.push({
    id: r.id, name: r.name, found: best.place_name,
    address: best.road_address_name || best.address_name,
    distM: Number(best.distance), dx, dy, placeUrl: best.place_url,
    category: best.category_name.split(" > ").pop(),
  });
  await new Promise((s) => setTimeout(s, 120)); // rate limit 배려
}

// 3) 결과 출력
for (const r of results) {
  if (!r.found) console.log(`❌ ${r.name}: 검색 결과 없음`);
  else console.log(`${r.name} → ${r.found} | ${r.category} | ${r.distM}m | ${r.address}`);
}

// 4) 반영
if (APPLY) {
  for (const r of data.restaurants) {
    const g = results.find((x) => x.id === r.id);
    if (!g?.found) continue;
    r.dx = g.dx;
    r.dy = g.dy;
    r.distM = g.distM;
    r.address = g.address;
    r.placeUrl = g.placeUrl;
  }
  data._comment =
    "식당명·좌표·거리·주소는 카카오 로컬 API 실측(2026-07-22). 평점/리뷰수는 여전히 시연용 가상 값. dx/dy는 SK서린빌딩 기준 상대좌표(m).";
  writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log("\nrestaurants.json 갱신 완료");
}
