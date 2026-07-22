// 위치(해외법인·자회사)별 더미 식당을 결정적(seed)으로 생성한다.
// 본사(SK서린빌딩)는 실제 데이터(restaurants.json 기반 RESTAURANTS)를 그대로 쓰고,
// 그 외 사업장은 실 식당 데이터가 없으므로 office 이름을 seed 삼아 매번 동일한 목록을 만든다.
// (scripts/parse-xlsx.mjs 의 "결정적 seed" 사상과 동일 — 시연용 가짜 데이터)

import { HQ_OFFICE, RESTAURANTS, type Cuisine, type Purpose, type Restaurant } from './data';
import { cultureOf } from './culture';
import type { Office } from './offices';

// --- 결정적 난수 (문자열 seed → mulberry32) ---
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 음식종류별 식당명 템플릿 ({city} 치환). 도시명을 넣어 현지 느낌.
const NAME_TEMPLATES: Record<Cuisine, string[]> = {
  한식: ['{city} 한정식', '{city} 한우 다이닝', '고향집 {city}점', '{city} 비빔'],
  일식: ['{city} 스시 오마카세', '{city} 이자카야', '{city} 라멘', '스시 {city}'],
  중식: ['{city} 팰리스', '{city} 딤섬 하우스', '황실 {city}', '{city} 누들바'],
  양식: ['{city} 스테이크하우스', '트라토리아 {city}', '{city} 그릴', '{city} 비스트로'],
  동남아: ['{city} 스파이스 가든', '{city} 사테 하우스', '{city} 아시안 다이닝', '{city} 누들'],
  기타: ['{city} 키친', '{city} 다이닝', '카페 {city}', '{city} 테이블'],
};

const DESC_BY_CUISINE: Record<Cuisine, string> = {
  한식: '현지 교민·주재원에게 인기인 한식당',
  일식: '깔끔한 스시·정갈한 상차림',
  중식: '접대·회식에 무난한 중식 다이닝',
  양식: '격식 있는 접대에 적합한 다이닝',
  동남아: '현지 향신료를 살린 캐주얼 다이닝',
  기타: '가볍게 들르기 좋은 현지 다이닝',
};

const CUISINES_ALL: Cuisine[] = ['한식', '일식', '중식', '양식', '동남아'];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// 한 사업장의 더미 식당 생성 (6~9곳)
function generate(office: Office): Restaurant[] {
  const rng = mulberry32(hashSeed(office.name));
  const culture = cultureOf(office.country);
  const halalCountry = culture?.halal ?? false;
  const overseas = office.category === '해외법인' || office.country !== '대한민국';
  const count = 6 + Math.floor(rng() * 4); // 6~9

  // 할랄 국가는 동남아/양식 비중을 높인다
  const cuisinePool: Cuisine[] = halalCountry
    ? ['동남아', '동남아', '양식', '양식', '한식', '중식']
    : CUISINES_ALL;

  const out: Restaurant[] = [];
  for (let i = 0; i < count; i++) {
    const cuisine = pick(rng, cuisinePool);
    const priceTier = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
    const name = pick(rng, NAME_TEMPLATES[cuisine]).replace('{city}', office.city);

    // 해외 사업장은 업무 목적(접대·회식) 위주, 국내 자회사는 점심 포함
    const purposes: Purpose[] = overseas
      ? rng() < 0.5
        ? ['접대', '저녁 회식']
        : ['저녁 회식']
      : rng() < 0.5
        ? ['점심', '저녁 회식']
        : ['점심'];

    const distM = 150 + Math.floor(rng() * 1050); // 150~1200m
    const angle = rng() * Math.PI * 2;
    const dx = Math.round(Math.cos(angle) * distM);
    const dy = Math.round(Math.sin(angle) * distM);

    const kakaoScore = Math.round((3.8 + rng() * 0.8) * 10) / 10;
    const kakaoCount = 80 + Math.floor(rng() * 1200);
    const naverScore = Math.round((3.8 + rng() * 0.8) * 10) / 10;
    const naverCount = 50 + Math.floor(rng() * 700);
    const googleScore = Math.round((3.9 + rng() * 0.7) * 10) / 10;
    const googleCount = 60 + Math.floor(rng() * 900);
    const reviewCount = kakaoCount + naverCount + googleCount;

    const halal = halalCountry && (cuisine === '동남아' || cuisine === '양식' || rng() < 0.6);

    out.push({
      id: `off-${hashSeed(office.name).toString(36)}-${i}`,
      name,
      cuisine,
      desc: DESC_BY_CUISINE[cuisine],
      priceTier,
      purposes,
      distM,
      dx,
      dy,
      kakao: { score: kakaoScore, count: kakaoCount },
      naver: { score: naverScore, count: naverCount },
      google: { score: googleScore, count: googleCount },
      naverBooking: !overseas && rng() < 0.5,
      catchtable: !overseas && rng() < 0.4,
      loc: office.name,
      features: {
        premium: priceTier === 3,
        room: priceTier >= 2 && rng() < 0.7,
        quiet: priceTier >= 2,
        group: purposes.includes('저녁 회식'),
        english: overseas || rng() < 0.3,
        halal,
      },
      isNew: rng() < 0.25, // 약 1/4는 새로 오픈
      visitCount: Math.floor(rng() * 9), // 0~8
      totalAmount: 0,
      lastDate: '',
      byAccount: {},
      recent: [],
      rating:
        Math.round(
          ((kakaoScore * kakaoCount + naverScore * naverCount + googleScore * googleCount) / reviewCount) * 10
        ) / 10,
      reviewCount,
      walkMin: Math.max(1, Math.round(distM / 67)),
    });
  }
  return out;
}

// 사업장별 식당 목록. 본사면 실 데이터, 그 외엔 생성한 더미.
export function restaurantsForOffice(office: Office): Restaurant[] {
  if (office.name === HQ_OFFICE) return RESTAURANTS;
  return generate(office);
}
