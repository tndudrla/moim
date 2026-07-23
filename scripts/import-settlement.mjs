// 법인카드 미정산내역 엑셀(동적 리스트 조회 형식)을 파싱해
//  1) 가맹점명을 기존 식당(restaurants.json + 서브모듈)과 매칭하고
//  2) 미등록 가맹점은 스텁 식당으로 DB 서브모듈(src/data/importedRestaurants.json)에 추가하며
//  3) 가맹점별 방문 통계를 서브모듈 stats에 합산한다.
// src/lib/settle.ts(브라우저 업로드)와 같은 규칙의 node 포팅 — 파일 영속화용.
//
// 실행: node scripts/import-settlement.mjs "<엑셀 경로>" [--apply]
//   --apply 없이 실행하면 드라이런(요약만 출력).
//   반영된 거래는 txKeys에 지문이 남아 같은 엑셀을 재실행해도 중복 집계되지 않는다.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";

const APPLY = process.argv.includes("--apply");
const xlsxPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!xlsxPath) {
  console.error('사용법: node scripts/import-settlement.mjs "<엑셀 경로>" [--apply]');
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const subPath = path.join(dir, "..", "src", "data", "importedRestaurants.json");
const sub = JSON.parse(readFileSync(subPath, "utf8"));
const { restaurants: curated } = JSON.parse(
  readFileSync(path.join(dir, "..", "src", "data", "restaurants.json"), "utf8")
);

// --- 엑셀 파싱 (src/lib/xlsx.ts 와 동일 규칙) ---
// XML 문자 참조 해제 (&#54620; → 한). 일부 내보내기(v4)는 한글을 전부 숫자 참조로 기록
const decodeXml = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const files = unzipSync(new Uint8Array(readFileSync(xlsxPath)));
const sstFile = files["xl/sharedStrings.xml"];
const sst = sstFile
  ? [...strFromU8(sstFile).matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
      decodeXml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""))
    )
  : [];
const sheetName = Object.keys(files).find((k) => /^xl\/worksheets\/sheet1?\.xml$/.test(k));
if (!sheetName) throw new Error("워크시트를 찾을 수 없습니다");
const rows = [];
for (const rm of strFromU8(files[sheetName]).matchAll(/<row [^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
  const cells = {};
  // 셀 값 3형태 지원: t="s"(sharedStrings 인덱스) / t="inlineStr"(<is><t>…) / 숫자(<v>…)
  for (const cm of rm[2].matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const [, attrs, inner = ""] = cm;
    const c = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
    if (!c) continue;
    const type = /t="(\w+)"/.exec(attrs)?.[1];
    if (type === "inlineStr") {
      cells[c] = decodeXml([...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""));
    } else {
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? "";
      cells[c] = type === "s" ? (sst[Number(v)] ?? "") : decodeXml(v);
    }
  }
  rows.push(cells);
}

// 헤더 행(컬럼명 → 열 문자) — 중복 컬럼명('카드회원' 2회)은 앞의 열 사용
let headerIdx = -1;
const col = {};
for (let i = 0; i < Math.min(rows.length, 10); i++) {
  const vals = Object.values(rows[i]);
  if (vals.includes("카드번호") && vals.includes("사용일자") && vals.includes("금액")) {
    headerIdx = i;
    for (const [c, name] of Object.entries(rows[i])) if (name && !(name in col)) col[name] = c;
    break;
  }
}
if (headerIdx < 0) throw new Error("미정산내역 형식이 아닙니다 (카드번호/사용일자/금액 헤더 없음)");

const maskName = (n) =>
  n.length >= 2 ? `${n[0]}${"*".repeat(n.length - 2)}${n.slice(-1)}` : n;

const txs = [];
for (const cells of rows.slice(headerIdx + 1)) {
  const get = (name) => String(cells[col[name]] ?? "").trim();
  const date = get("사용일자").replace(/\D/g, "").slice(0, 8);
  const amount = Number(get("금액").replace(/[^\d]/g, ""));
  if (date.length !== 8 || !(amount > 0)) continue;
  if (/취소|거절|반려/.test(get("상태"))) continue;
  const holder = maskName(get("관리자"));
  const company = get("카드회사") || "법인카드";
  txs.push({
    date,
    amount,
    card: holder ? `${company}_${holder}` : company,
    account: get("계정명").replace(/-+$/, "") || "미분류",
    merchant: get("카드회원"), // 이 형식에서 '카드회원' 열이 가맹점명
    uptae: get("업태"),
    region: get("가맹점주"),
    time: get("사용시간"),
    key: [date, amount, get("카드회원"), get("사용시간"), get("승인번호")].join("|"),
  });
}

// --- 매칭 규칙 (settle.ts 동일) ---
const norm = (s) => s.normalize("NFKC").toUpperCase().replace(/[^0-9A-Z가-힣]/g, "");
const cuisineOfUptae = (u) => {
  if (/한식|식당|국밥|갈비|해장|백반/.test(u)) return "한식";
  if (/일식|횟집|초밥|복어|이자카야/.test(u)) return "일식";
  if (/중국|중식/.test(u)) return "중식";
  if (/경양식|양식|서양|이탈리|피자|스테이크/.test(u)) return "양식";
  if (/베트남|태국|동남아|아시안/.test(u)) return "동남아";
  return "기타";
};
const tierOfAvg = (avg) => (avg <= 40_000 ? 1 : avg <= 120_000 ? 2 : 3);
const purposeOfTime = (t) => {
  const h = Number((t ?? "").slice(0, 2));
  return h >= 6 && h < 15 ? "점심" : "저녁 회식";
};

const index = new Map();
const register = (r) => {
  index.set(norm(r.name), r.id);
  for (const a of r.aliases ?? []) index.set(norm(a), r.id);
};
curated.forEach(register);
sub.restaurants.forEach(register);

const seen = new Set(sub.txKeys ?? []);
let seq = sub.restaurants.length;
const newStubs = new Map(); // normName → { r, amounts }
const matched = {}; // rid → count (기존 식당 매칭 현황 출력용)
let dup = 0;

for (const t of txs) {
  if (seen.has(t.key)) {
    dup++;
    continue;
  }
  seen.add(t.key);

  const key = norm(t.merchant);
  let rid = index.get(key);
  // 이번 실행에서 방금 만든 스텁의 후속 거래도 '신규' 쪽으로 집계
  if (!rid || newStubs.has(key)) {
    let stub = newStubs.get(key);
    if (!stub) {
      rid = `S${String(++seq).padStart(3, "0")}`;
      stub = {
        r: {
          id: rid,
          name: t.merchant,
          cuisine: cuisineOfUptae(t.uptae),
          desc: `${t.uptae || "업태 미상"} · 법인카드 정산 자동 등록`,
          priceTier: 1,
          purposes: [],
          distM: 0,
          dx: 0,
          dy: 0,
          kakao: { score: 0, count: 0 },
          naver: { score: 0, count: 0 },
          google: { score: 0, count: 0 },
          naverBooking: false,
          catchtable: false,
          ...(t.region ? { address: t.region } : {}),
          aliases: [t.merchant],
          source: "import",
          pending: true,
        },
        amounts: [],
      };
      newStubs.set(key, stub);
      index.set(key, rid);
    }
    rid = stub.r.id;
    stub.amounts.push(t.amount);
    const p = purposeOfTime(t.time);
    if (!stub.r.purposes.includes(p)) stub.r.purposes.push(p);
  } else {
    matched[rid] = (matched[rid] ?? 0) + 1;
  }

  const s = (sub.stats[rid] ??= { count: 0, totalAmount: 0, lastDate: "", byAccount: {}, recent: [] });
  s.count++;
  s.totalAmount += t.amount;
  s.byAccount[t.account] = (s.byAccount[t.account] ?? 0) + 1;
  if (t.date > s.lastDate) s.lastDate = t.date;
  s.recent.push({ date: t.date, amount: t.amount, account: t.account, card: t.card });
}
for (const s of Object.values(sub.stats)) {
  s.recent.sort((a, b) => b.date.localeCompare(a.date));
  s.recent = s.recent.slice(0, 5);
}

for (const { r, amounts } of newStubs.values()) {
  r.priceTier = tierOfAvg(amounts.reduce((a, b) => a + b, 0) / Math.max(1, amounts.length));
  sub.restaurants.push(r);
}
sub.txKeys = [...seen];
sub.source = path.basename(xlsxPath);
sub.importedAt = new Date().toISOString().slice(0, 10);

// --- 결과 출력 ---
const nameOf = (rid) =>
  curated.find((r) => r.id === rid)?.name ?? sub.restaurants.find((r) => r.id === rid)?.name ?? rid;
console.log(`거래 ${txs.length}건 파싱 (신규 ${txs.length - dup}건, 이미 반영된 중복 ${dup}건 스킵)\n`);
console.log(`기존 식당 매칭: ${Object.keys(matched).length}곳`);
for (const [rid, n] of Object.entries(matched)) console.log(`  ✅ ${nameOf(rid)} (${rid}) — ${n}건`);
console.log(`\n신규 등록(스텁): ${newStubs.size}곳`);
for (const { r } of newStubs.values()) {
  const s = sub.stats[r.id];
  console.log(
    `  🆕 ${r.name} (${r.id}) — ${r.desc} | ${r.cuisine} | ${r.purposes.join("/")} | ${s.count}건 ${s.totalAmount.toLocaleString()}원`
  );
}

if (APPLY) {
  writeFileSync(subPath, JSON.stringify(sub, null, 2));
  console.log(`\nimportedRestaurants.json 갱신 완료 (식당 ${sub.restaurants.length}곳, 거래 지문 ${sub.txKeys.length}건)`);
  console.log("좌표 미확인(pending) 식당은 지도 제외 — geocode 보강은 추후 별도 실행");
} else {
  console.log("\n드라이런 — 반영하려면 --apply 를 붙여 실행하세요");
}
