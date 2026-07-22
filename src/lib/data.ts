import restaurantsJson from '@/data/restaurants.json';
import visitsJson from '@/data/visits.json';

export type Purpose = '점심' | '저녁 회식' | '접대';
export type Cuisine = '한식' | '일식' | '중식' | '양식' | '동남아';

export interface Visit {
  date: string; // YYYYMMDD
  amount: number;
  account: string;
  card: string;
}

// 접대/회식 상황 매칭용 식당 특성 플래그 (mosim 목업의 f.* 이식)
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
  google: { score: number; count: number };
  naverBooking: boolean;
  catchtable: boolean;
  loc: string; // 소속 사업장(office name). 기본 본사(SK서린빌딩)
  features: RestaurantFeatures;
  isNew: boolean; // 최근 새로 오픈
  // 파생 필드
  visitCount: number;
  totalAmount: number;
  lastDate: string;
  byAccount: Record<string, number>;
  recent: Visit[];
  rating: number; // 카카오/구글 리뷰 개수 가중평균
  reviewCount: number;
  walkMin: number;
}

export const COMPANY = 'SK서린빌딩';

// SK서린빌딩(종로구 종로 26) 대략 좌표. dx/dy(m)를 위경도로 환산해 실지도에 표시
export const COMPANY_LATLNG = { lat: 37.5688, lng: 126.9804 };

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
export const CUISINES: Cuisine[] = ['한식', '일식', '중식', '양식', '동남아'];
export const DIST_BANDS = [500, 1000, 1500] as const;

export const CUISINE_COLOR: Record<Cuisine, string> = {
  한식: '#E11D48',
  일식: '#0284C7',
  중식: '#D97706',
  양식: '#7C3AED',
  동남아: '#059669',
};

import type { Stats } from './assign';

export const HQ_OFFICE = 'SK서린빌딩';

// json 식당의 기존 필드로 접대 특성(features)을 유추 (목업엔 수기였던 f.* 대체)
function inferFeatures(
  r: { priceTier: number; naverBooking: boolean; catchtable: boolean; purposes: Purpose[] }
): RestaurantFeatures {
  const bookable = r.naverBooking || r.catchtable;
  return {
    premium: r.priceTier === 3,
    room: r.priceTier === 3 || (r.priceTier === 2 && bookable),
    quiet: r.priceTier >= 2,
    group: r.purposes.includes('저녁 회식'),
    english: r.purposes.includes('접대') && bookable,
    halal: false, // 본사 주변 식당은 할랄 미표기
  };
}

// 방문 통계(기본: visits.json, 업로드 시: 브라우저에서 재계산)로 식당 목록 구성
export function buildRestaurants(stats: Record<string, Stats>): Restaurant[] {
  return (
    restaurantsJson.restaurants as (Omit<
      Restaurant,
      | 'loc'
      | 'features'
      | 'isNew'
      | 'visitCount'
      | 'totalAmount'
      | 'lastDate'
      | 'byAccount'
      | 'recent'
      | 'rating'
      | 'reviewCount'
      | 'walkMin'
    > & { isNew?: boolean })[]
  ).map((r) => {
    const s = stats[r.id];
    const reviewCount = r.kakao.count + r.google.count;
    return {
      ...r,
      loc: HQ_OFFICE,
      features: inferFeatures(r),
      isNew: r.isNew ?? false,
      visitCount: s?.count ?? 0,
      totalAmount: s?.totalAmount ?? 0,
      lastDate: s?.lastDate ?? '',
      byAccount: s?.byAccount ?? {},
      recent: s?.recent ?? [],
      rating:
        Math.round(
          ((r.kakao.score * r.kakao.count + r.google.score * r.google.count) / reviewCount) * 10
        ) / 10,
      reviewCount,
      walkMin: Math.max(1, Math.round(r.distM / 67)),
    };
  });
}

export const RESTAURANTS: Restaurant[] = buildRestaurants(
  visitsJson.stats as Record<string, Stats>
);

export function formatDate(ymd: string): string {
  if (ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

export function formatAmount(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
