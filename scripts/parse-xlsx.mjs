// 법인카드 사용내역 엑셀(20260722사용원가(실적).xlsx)을 파싱해
// 식당별 방문 통계(src/data/visits.json)를 생성한다.
//
// 엑셀에는 식당명이 없으므로(기획서 참고) 각 거래를 더미 식당에
// 결정적(seed 기반)으로 배정한다. 엑셀 원본은 전부 의욕관리비(점심)라서
// 경상회의비(저녁 회식)/접대비 거래는 시연용으로 합성해 채운다(synth: true).
//
// 입력: scripts/data-src/sheet1.xml, sharedStrings.xml (엑셀에서 추출)
// 출력: src/data/visits.json
// 실행: npm run data

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(dir, "data-src", f), "utf8");

// --- sharedStrings ---
const sst = [...read("sharedStrings.xml").matchAll(/<si>(.*?)<\/si>/gs)].map(
  (m) =>
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")
);

// --- sheet rows ---
const rows = [];
for (const rm of read("sheet1.xml").matchAll(/<row [^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
  if (rm[1] === "1") continue; // header
  const cells = {};
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(t="s")?\s*><v>([^<]*)<\/v><\/c>/g)) {
    const [, col, isStr, v] = cm;
    cells[col] = isStr ? sst[Number(v)] : v;
  }
  rows.push(cells);
}

// 컬럼: A No, B 회사코드, C 전표번호, D 증빙일, E 전기일, F 코스트센터,
//       G 원가요소, H 원가요소명, I 차/대, J 금액, K 품목텍스트, L 상계계정번호, M 계정번호(카드)
// 카드 소지자 실명 마스킹 — 공개 배포 시 개인정보 노출 방지 ("현대법인카드_이충환" → "현대법인카드_이*환")
const maskCard = (card) =>
  card.replace(/_(\S+)$/, (_, name) =>
    name.length >= 2 ? `_${name[0]}${"*".repeat(name.length - 2)}${name.slice(-1)}` : `_${name}`
  );

const txs = rows
  .map((c) => ({
    date: String(c.D ?? "").trim(), // YYYYMMDD
    amount: Number(String(c.J ?? "0").replace(/[^\d]/g, "")),
    memo: String(c.K ?? ""),
    card: maskCard(String(c.M ?? "").trim()),
    account: "의욕관리비",
    synth: false,
  }))
  .filter((t) => t.date && t.amount > 0);

// --- 결정적 난수 (재실행해도 같은 결과) ---
let seed = 20260722;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

// --- 식당 배정 ---
const { restaurants } = JSON.parse(
  readFileSync(path.join(dir, "..", "src", "data", "restaurants.json"), "utf8")
);

// 점심 인기 가중치 — 방문횟수 순위가 자연스럽게 벌어지도록
const LUNCH_WEIGHT = {
  "mugyodong-bugeoguk": 9, "cheongjinok": 8, "seorin-nakji": 8, "mijin": 6,
  "imun-seolnongtang": 6, "gwanghwamun-gukbap": 5, "gomgooksijip": 5, "misien": 4,
  "buminok": 4, "yonggeumok": 3, "sushisora": 3, "hanilkwan": 3,
};
const DINNER_WEIGHT = {
  "seorin-nakji": 5, "yeolchajip": 6, "cheongjinok": 4, "bogeonok": 5,
  "changhwadang": 4, "la-cantina": 3, "changgo43": 3, "gwanghwamun-gukbap": 3,
};

const pickWeighted = (pool, weights) => {
  const total = pool.reduce((s, r) => s + (weights[r.id] ?? 1), 0);
  let x = rand() * total;
  for (const r of pool) {
    x -= weights[r.id] ?? 1;
    if (x <= 0) return r;
  }
  return pool[pool.length - 1];
};

const lunchPool = restaurants.filter((r) => r.purposes.includes("점심"));
const dinnerPool = restaurants.filter((r) => r.purposes.includes("저녁 회식"));
const hostPool = restaurants.filter((r) => r.purposes.includes("접대"));

for (const t of txs) t.rid = pickWeighted(lunchPool, LUNCH_WEIGHT).id;

// --- 합성 거래: 경상회의비(저녁 회식) 130건, 접대비 70건 (2026.01~06) ---
const cards = [...new Set(txs.map((t) => t.card).filter(Boolean))];
const pad = (n) => String(n).padStart(2, "0");
const randDate = () => {
  const m = 1 + Math.floor(rand() * 6);
  const d = 1 + Math.floor(rand() * 28);
  return `2026${pad(m)}${pad(d)}`;
};
const synth = [];
for (let i = 0; i < 130; i++) {
  synth.push({
    date: randDate(),
    amount: Math.round((120000 + rand() * 480000) / 100) * 100,
    memo: "경상회의비(합성)",
    card: cards[Math.floor(rand() * cards.length)] ?? "법인카드",
    account: "경상회의비",
    synth: true,
    rid: pickWeighted(dinnerPool, DINNER_WEIGHT).id,
  });
}
for (let i = 0; i < 70; i++) {
  synth.push({
    date: randDate(),
    amount: Math.round((150000 + rand() * 650000) / 100) * 100,
    memo: "접대비(합성)",
    card: cards[Math.floor(rand() * cards.length)] ?? "법인카드",
    account: "접대비",
    synth: true,
    rid: pickWeighted(hostPool, {}).id,
  });
}

// --- 집계 ---
const all = [...txs, ...synth];
const stats = {};
for (const t of all) {
  const s = (stats[t.rid] ??= {
    count: 0,
    totalAmount: 0,
    lastDate: "",
    byAccount: {},
    recent: [],
  });
  s.count++;
  s.totalAmount += t.amount;
  s.byAccount[t.account] = (s.byAccount[t.account] ?? 0) + 1;
  if (t.date > s.lastDate) s.lastDate = t.date;
  s.recent.push({ date: t.date, amount: t.amount, account: t.account, card: t.card });
}
for (const s of Object.values(stats)) {
  s.recent.sort((a, b) => b.date.localeCompare(a.date));
  s.recent = s.recent.slice(0, 5);
}

const out = {
  generatedFrom: "20260722사용원가(실적).xlsx (999건, 의욕관리비) + 합성 200건(경상회의비/접대비)",
  txCount: { excel: txs.length, synth: synth.length },
  stats,
};
writeFileSync(
  path.join(dir, "..", "src", "data", "visits.json"),
  JSON.stringify(out, null, 2)
);
console.log(
  `excel ${txs.length}건 + 합성 ${synth.length}건 → 식당 ${Object.keys(stats).length}곳 집계 완료`
);
const top = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
console.log("방문횟수 TOP5:", top.map(([id, s]) => `${id}(${s.count})`).join(", "));
