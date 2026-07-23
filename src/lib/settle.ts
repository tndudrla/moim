import restaurantsJson from '@/data/restaurants.json';
import importedJson from '@/data/importedRestaurants.json';
import visitsJson from '@/data/visits.json';
import type { Tx } from './xlsx';
import type { Cuisine, Purpose } from './data';
import { mergeStats, type Stats } from './assign';

// 미정산내역(가맹점명 포함) 거래를 DB에 반영한다.
//  1) 가맹점명을 기존 식당(큐레이션 166곳 + 서브모듈)의 name/aliases와 정규화 매칭
//  2) 매칭 실패한 가맹점은 스키마에 맞는 스텁 식당으로 자동 생성해 DB를 보강
//  3) 거래 통계는 기본 visits.json + 서브모듈 통계 위에 합산
// scripts/import-settlement.mjs 는 같은 규칙의 node 포팅(파일 영속화용).

// 스텁 식당 — restaurants.json 레코드와 같은 필수 스키마 + 자동생성 표식
export interface ImportedRestaurant {
  id: string;
  name: string;
  cuisine: Cuisine;
  desc: string;
  priceTier: 1 | 2 | 3;
  purposes: Purpose[];
  distM: number;
  dx: number;
  dy: number;
  kakao: { score: number; count: number };
  naver: { score: number; count: number };
  google: { score: number; count: number };
  naverBooking: boolean;
  catchtable: boolean;
  address?: string;
  aliases: string[]; // 카드 전표상 가맹점명 (매칭 키)
  source: 'import';
  pending: true; // 좌표/평점 미보강 — 지도 표시 제외
}

// 상호 정규화: 대문자 통일 + 공백/기호 제거 (전표 표기 흔들림 흡수)
export const normName = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^0-9A-Z가-힣]/g, '');

// 업태 → 음식종류 (미상은 기타)
export function cuisineOfUptae(u: string): Cuisine {
  if (/한식|식당|국밥|갈비|해장|백반/.test(u)) return '한식';
  if (/일식|횟집|초밥|복어|이자카야/.test(u)) return '일식';
  if (/중국|중식/.test(u)) return '중식';
  if (/경양식|양식|서양|이탈리|피자|스테이크/.test(u)) return '양식';
  if (/베트남|태국|동남아|아시안/.test(u)) return '동남아';
  return '기타';
}

// 평균 결제금액 → 가격대 (1: 2~3만원대, 2: 4~6만원대, 3: 10만원 이상)
export function tierOfAvgAmount(avg: number): 1 | 2 | 3 {
  if (avg <= 40_000) return 1;
  if (avg <= 120_000) return 2;
  return 3;
}

// 사용시간 → 용도 (06~15시 결제는 점심, 그 외 저녁 회식)
export function purposeOfTime(time?: string): Purpose {
  const h = Number((time ?? '').slice(0, 2));
  return h >= 6 && h < 15 ? '점심' : '저녁 회식';
}

export interface SettleResult {
  stats: Record<string, Stats>; // 기본 통계 + 정산분 합산 (buildRestaurants에 그대로 전달)
  imported: ImportedRestaurant[]; // 이번 반영으로 DB에 추가된 스텁 (서브모듈 기존분 제외)
  matchedTx: number; // 기존 식당에 매칭된 거래 수
  newTx: number; // 신규 스텁으로 흘러간 거래 수
}

interface NamedRecord {
  id: string;
  name: string;
  aliases?: string[];
}

export function applySettlement(txs: Tx[]): SettleResult {
  // 매칭 인덱스: 큐레이션 + 서브모듈의 name/aliases
  const index = new Map<string, string>();
  const register = (r: NamedRecord) => {
    index.set(normName(r.name), r.id);
    for (const a of r.aliases ?? []) index.set(normName(a), r.id);
  };
  (restaurantsJson.restaurants as NamedRecord[]).forEach(register);
  (importedJson.restaurants as NamedRecord[]).forEach(register);

  // 스텁 id는 서브모듈 이후 번호로 이어붙임 (S001, S002, ...)
  let seq = (importedJson.restaurants as NamedRecord[]).length;
  const stubs = new Map<string, { r: ImportedRestaurant; amounts: number[] }>();
  const settleStats: Record<string, Stats> = {};
  let matchedTx = 0;
  let newTx = 0;

  for (const t of txs) {
    if (!t.merchant) continue;
    const key = normName(t.merchant);
    let rid = index.get(key);

    // 이번 업로드에서 방금 만든 스텁의 후속 거래도 '신규' 쪽으로 집계
    if (!rid || stubs.has(key)) {
      let stub = stubs.get(key);
      if (!stub) {
        rid = `S${String(++seq).padStart(3, '0')}`;
        stub = {
          r: {
            id: rid,
            name: t.merchant,
            cuisine: cuisineOfUptae(t.uptae ?? ''),
            desc: `${t.uptae || '업태 미상'} · 법인카드 정산 자동 등록`,
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
            address: t.region || undefined,
            aliases: [t.merchant],
            source: 'import',
            pending: true,
          },
          amounts: [],
        };
        stubs.set(key, stub);
        index.set(key, rid);
      } else {
        rid = stub.r.id;
      }
      stub.amounts.push(t.amount);
      const p = purposeOfTime(t.time);
      if (!stub.r.purposes.includes(p)) stub.r.purposes.push(p);
      newTx++;
    } else {
      matchedTx++;
    }

    const s = (settleStats[rid] ??= { count: 0, totalAmount: 0, lastDate: '', byAccount: {}, recent: [] });
    s.count++;
    s.totalAmount += t.amount;
    s.byAccount[t.account] = (s.byAccount[t.account] ?? 0) + 1;
    if (t.date > s.lastDate) s.lastDate = t.date;
    s.recent.push({ date: t.date, amount: t.amount, account: t.account, card: t.card });
  }

  for (const s of Object.values(settleStats)) {
    s.recent.sort((a, b) => b.date.localeCompare(a.date));
    s.recent = s.recent.slice(0, 5);
  }

  const imported = [...stubs.values()].map(({ r, amounts }) => ({
    ...r,
    priceTier: tierOfAvgAmount(amounts.reduce((a, b) => a + b, 0) / Math.max(1, amounts.length)),
  }));

  return {
    stats: mergeStats(
      visitsJson.stats as Record<string, Stats>,
      importedJson.stats as Record<string, Stats>,
      settleStats
    ),
    imported,
    matchedTx,
    newTx,
  };
}
