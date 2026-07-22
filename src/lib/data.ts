import restaurantsJson from '@/data/restaurants.json';
import visitsJson from '@/data/visits.json';
import newPlacesJson from '@/data/newPlaces.json';

export type Purpose = '점심' | '저녁 회식' | '접대';
export type Cuisine = '한식' | '일식' | '중식' | '양식' | '동남아' | '기타';

export interface Visit {
  date: string; // YYYYMMDD
  amount: number;
  account: string;
  card: string;
}

// 접대/회식 상황 매칭용 식당 특성 플래그 (본사 실데이터는 미기입 → undefined)
export interface RestaurantFeatures {
  room?: boolean; // 룸/개별실
  quiet?: boolean; // 조용한 분위기
  premium?: boolean; // 고급/프리미엄
  group?: boolean; // 단체석
  english?: boolean; // 영어 메뉴/응대
  halal?: boolean; // 할랄
}

export interface Restaurant {
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
  address?: string; // 카카오 로컬 API 실측
  placeUrl?: string; // 카카오맵 장소 페이지
  loc?: string; // 소속 사업장(office name). 미기입은 본사
  features?: RestaurantFeatures; // 위치별 더미 식당에만 기입
  isNew?: boolean; // 최근 새로 오픈
  // 파생 필드
  visitCount: number;
  totalAmount: number;
  lastDate: string;
  byAccount: Record<string, number>;
  recent: Visit[];
  rating: number; // 카카오/네이버/구글 리뷰 개수 가중평균 (엑셀 '통합평점'과 동일 공식)
  reviewCount: number;
  walkMin: number;
}

export const COMPANY = 'SK서린빌딩';
export const HQ_OFFICE = COMPANY; // offices.json의 본사 name과 동일해야 함

// SK서린빌딩(종로구 종로 26) — 카카오 로컬 API 실측 좌표. dx/dy(m)를 위경도로 환산해 실지도에 표시
export const COMPANY_LATLNG = { lat: 37.56978877, lng: 126.98033123 };

export function latLngOf(r: { dx: number; dy: number }): { lat: number; lng: number } {
  return {
    lat: COMPANY_LATLNG.lat + r.dy / 111320,
    lng: COMPANY_LATLNG.lng + r.dx / (111320 * Math.cos((COMPANY_LATLNG.lat * Math.PI) / 180)),
  };
}

export const PRICE_LABEL: Record<number, string> = {
  1: '2~3만원대',
  2: '4~6만원대',
  3: '10만원 이상',
};

export const ACCOUNT_BY_PURPOSE: Record<Purpose, string> = {
  점심: '의욕관리비',
  '저녁 회식': '경상회의비',
  접대: '접대비',
};

export const PURPOSES: Purpose[] = ['점심', '저녁 회식', '접대'];
export const CUISINES: Cuisine[] = ['한식', '일식', '중식', '양식', '동남아', '기타'];
export const DIST_BANDS = [500, 1000, 1500] as const;

export const CUISINE_COLOR: Record<Cuisine, string> = {
  한식: '#E11D48',
  일식: '#0284C7',
  중식: '#D97706',
  양식: '#7C3AED',
  동남아: '#059669',
  기타: '#64748B',
};

import type { Stats } from './assign';

// 방문 통계(기본: visits.json, 업로드 시: 브라우저에서 재계산)로 식당 목록 구성
export function buildRestaurants(stats: Record<string, Stats>): Restaurant[] {
  return (
    restaurantsJson.restaurants as Omit<
      Restaurant,
      'visitCount' | 'totalAmount' | 'lastDate' | 'byAccount' | 'recent' | 'rating' | 'reviewCount' | 'walkMin'
    >[]
  ).map((r) => {
    const s = stats[r.id];
    const reviewCount = r.kakao.count + r.naver.count + r.google.count;
    return {
      ...r,
      visitCount: s?.count ?? 0,
      totalAmount: s?.totalAmount ?? 0,
      lastDate: s?.lastDate ?? '',
      byAccount: s?.byAccount ?? {},
      recent: s?.recent ?? [],
      rating:
        Math.round(
          ((r.kakao.score * r.kakao.count + r.naver.score * r.naver.count + r.google.score * r.google.count) /
            reviewCount) *
            10
        ) / 10,
      reviewCount,
      walkMin: Math.max(1, Math.round(r.distM / 67)),
    };
  });
}

export const RESTAURANTS: Restaurant[] = buildRestaurants(
  visitsJson.stats as Record<string, Stats>
);

// --- 신규 오픈 식당 (서울시 LOCALDATA 인허가, scripts/new-restaurants.mjs 생성) ---
export interface NewPlace {
  name: string;
  category: string; // LOCALDATA 업태 (한식/경양식/일식...)
  opened: string; // 인허가일 YYYY-MM-DD
  address: string;
  dx: number;
  dy: number;
  distM: number;
  cuisine: Cuisine;
}

function cuisineOfUptae(c: string): Cuisine {
  if (c.includes('한식')) return '한식';
  if (/일식|횟집|복어/.test(c)) return '일식';
  if (c.includes('중국')) return '중식';
  if (c.includes('경양식')) return '양식';
  if (c.includes('외국음식')) return '동남아'; // 외국음식전문점(인도, 태국 등)
  return '기타';
}

export const NEW_PLACES: NewPlace[] = (newPlacesJson.places as Omit<NewPlace, 'cuisine'>[]).map((p) => ({
  ...p,
  cuisine: cuisineOfUptae(p.category),
}));

export const NEW_PLACES_CUTOFF = newPlacesJson.cutoff as string;

export function formatDate(ymd: string): string {
  if (ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

export function formatAmount(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
