import restaurantsJson from '@/data/restaurants.json';
import type { Tx } from './xlsx';

// 거래 → 식당 배정 + 집계. scripts/parse-xlsx.mjs 와 동일한 결정적(seed) 로직의 TS 포팅.
// 엑셀에 식당명이 없어서(기획서 참고) 목적에 맞는 식당군에 가중 배정한다.

export interface Stats {
  count: number;
  totalAmount: number;
  lastDate: string;
  byAccount: Record<string, number>;
  recent: { date: string; amount: number; account: string; card: string }[];
}

const LUNCH_WEIGHT: Record<string, number> = {
  'mugyodong-bugeoguk': 9, cheongjinok: 8, 'seorin-nakji': 8, mijin: 6,
  'imun-seolnongtang': 6, 'gwanghwamun-gukbap': 5, gomgooksijip: 5, misien: 4,
  buminok: 4, yonggeumok: 3, sushisora: 3, hanilkwan: 3,
};
const DINNER_WEIGHT: Record<string, number> = {
  'seorin-nakji': 5, yeolchajip: 6, cheongjinok: 4, bogeonok: 5,
  changhwadang: 4, 'la-cantina': 3, changgo43: 3, 'gwanghwamun-gukbap': 3,
};

interface BaseRestaurant {
  id: string;
  purposes: string[];
}

const base = restaurantsJson.restaurants as BaseRestaurant[];

function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pickWeighted(
  rand: () => number,
  pool: BaseRestaurant[],
  weights: Record<string, number>
): BaseRestaurant {
  const total = pool.reduce((s, r) => s + (weights[r.id] ?? 1), 0);
  let x = rand() * total;
  for (const r of pool) {
    x -= weights[r.id] ?? 1;
    if (x <= 0) return r;
  }
  return pool[pool.length - 1];
}

// 업로드된 점심 거래에 합성 저녁/접대 거래를 더해 식당별 통계 생성
export function buildStats(txs: Tx[]): Record<string, Stats> {
  const rand = createRng(20260722);
  const lunchPool = base.filter((r) => r.purposes.includes('점심'));
  const dinnerPool = base.filter((r) => r.purposes.includes('저녁 회식'));
  const hostPool = base.filter((r) => r.purposes.includes('접대'));

  const assigned = txs.map((t) => ({
    ...t,
    rid: pickWeighted(rand, lunchPool, LUNCH_WEIGHT).id,
  }));

  const cards = [...new Set(txs.map((t) => t.card).filter(Boolean))];
  const pad = (n: number) => String(n).padStart(2, '0');
  const randDate = () => `2026${pad(1 + Math.floor(rand() * 6))}${pad(1 + Math.floor(rand() * 28))}`;

  for (let i = 0; i < 130; i++) {
    assigned.push({
      date: randDate(),
      amount: Math.round((120000 + rand() * 480000) / 100) * 100,
      card: cards[Math.floor(rand() * cards.length)] ?? '법인카드',
      account: '경상회의비',
      synth: true,
      rid: pickWeighted(rand, dinnerPool, DINNER_WEIGHT).id,
    });
  }
  for (let i = 0; i < 70; i++) {
    assigned.push({
      date: randDate(),
      amount: Math.round((150000 + rand() * 650000) / 100) * 100,
      card: cards[Math.floor(rand() * cards.length)] ?? '법인카드',
      account: '접대비',
      synth: true,
      rid: pickWeighted(rand, hostPool, {}).id,
    });
  }

  const stats: Record<string, Stats> = {};
  for (const t of assigned) {
    const s = (stats[t.rid] ??= {
      count: 0,
      totalAmount: 0,
      lastDate: '',
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
  return stats;
}
