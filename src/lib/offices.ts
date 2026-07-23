import officesJson from '@/data/offices.json';

export type OfficeCategory =
  | '본사'
  | '해외법인'
  | '국내 도시가스 자회사'
  | '발전·집단에너지 자회사'
  | '수소 자회사';

export interface Office {
  category: OfficeCategory;
  name: string;
  country: string;
  flag: string; // 국기 이모지
  city: string;
  address: string;
  lat: number | null; // 지도 표시용 — 나중에 지오코딩으로 채움
  lng: number | null;
  tag: string | null; // ✨=신규정리, ⚠️=주소확인필요
}

export const OFFICES: Office[] = officesJson.offices as Office[];

export const OFFICE_CATEGORIES: OfficeCategory[] = [
  '본사',
  '해외법인',
  '국내 도시가스 자회사',
  '발전·집단에너지 자회사',
  '수소 자회사',
];

// 해외 출장지 = 해외법인
export const TRIP_CATEGORIES: OfficeCategory[] = ['해외법인'];

export const HQ_OFFICE_NAME = 'SK서린빌딩';

export const HQ_OFFICE: Office = OFFICES.find((o) => o.name === HQ_OFFICE_NAME)!;

// 카테고리별로 묶어서 반환 (지도/목록 그룹핑용)
export function officesByCategory(): Record<OfficeCategory, Office[]> {
  const out = {} as Record<OfficeCategory, Office[]>;
  for (const cat of OFFICE_CATEGORIES) {
    out[cat] = OFFICES.filter((o) => o.category === cat);
  }
  return out;
}

// 좌표가 아직 없는(지오코딩 필요) 법인 목록
export function officesMissingLatLng(): Office[] {
  return OFFICES.filter((o) => o.lat === null || o.lng === null);
}
