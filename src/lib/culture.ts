// 해외 접대 식문화 가이드 — mosim-mockup/index.html 의 CULTURE 를 이식.
// 국가명(offices.json 의 country 값)으로 조회한다. halal=true 국가는 할랄 필터를 기본 ON.

export interface CultureInfo {
  flag: string;
  halal: boolean;
  tips: string[];
}

export const CULTURE: Record<string, CultureInfo> = {
  일본: {
    flag: '🇯🇵',
    halal: false,
    tips: [
      '접대는 개인룸(코시츠) 선호, 정숙한 분위기',
      '술은 상대 잔을 채워주고 첫 건배까지 대기',
      '명함 교환은 두 손으로 정중히',
      '생선/날것 호불호 미리 확인',
    ],
  },
  중국: {
    flag: '🇨🇳',
    halal: false,
    tips: [
      '원형 테이블·회전판, 호스트가 주문 주도',
      '건배(간베이) 문화 — 술 강권은 피하기',
      '요리는 짝수로, 생선은 통째로가 길함',
      '상석 배치·예약 격식 중시',
    ],
  },
  인도네시아: {
    flag: '🇮🇩',
    halal: true,
    tips: [
      '무슬림 다수 → 할랄 필수, 돼지고기·주류 금지',
      '오른손으로 식사·전달',
      '라마단 기간 낮 식사·회식 배려',
    ],
  },
  UAE: {
    flag: '🇦🇪',
    halal: true,
    tips: [
      '할랄 필수, 돼지고기·주류 원칙 금지',
      '주류는 호텔 내 라이선스 레스토랑만',
      '라마단 기간 낮 시간 식사 자제',
      '왼손 사용·발바닥 노출 지양',
    ],
  },
  미국: {
    flag: '🇺🇸',
    halal: false,
    tips: [
      '팁 문화(15~20%) 반영',
      '알레르기·비건·글루텐프리 옵션 확인',
      '예약 시 dietary restriction 미리 고지',
      '호스트가 계산 주체를 명확히',
    ],
  },
  싱가포르: {
    flag: '🇸🇬',
    halal: false,
    tips: [
      '다민족(중화·말레이·인도) — 손님 배경별 배려',
      '무슬림엔 할랄, 힌두엔 소고기·채식 확인',
      '호커센터~파인다이닝까지 선택폭 넓음',
    ],
  },
  베트남: {
    flag: '🇻🇳',
    halal: false,
    tips: [
      '더운 날씨 — 시원한 실내/룸 선호',
      '접대는 격식 레스토랑, 건배 문화 있음',
      '고수·향신료 호불호 미리 확인',
    ],
  },
  독일: {
    flag: '🇩🇪',
    halal: false,
    tips: [
      '시간 엄수·예약 필수',
      '채식·글루텐프리 옵션 확인',
      '비즈니스 디너는 조용한 분위기',
      '팁 5~10% 관례',
    ],
  },
  // 목업엔 없던 국가 보강 (offices.json 의 호주·영국)
  호주: {
    flag: '🇦🇺',
    halal: false,
    tips: [
      '캐주얼한 다이닝 문화, 과한 격식은 지양',
      '커피·브런치 문화 발달 — 낮 미팅 활용',
      '채식·글루텐프리 옵션 흔함, 미리 확인',
      '팁 의무 아님(고급식당 10% 선택)',
    ],
  },
  영국: {
    flag: '🇬🇧',
    halal: false,
    tips: [
      '예약·시간 엄수, 정중한 톤 유지',
      '펍 문화 — 캐주얼 회식에 적합',
      '채식·알레르기 옵션 사전 고지',
      '서비스 차지(12.5%) 포함 여부 확인',
    ],
  },
};

// 국내(대한민국)는 식문화 안내 없음 → undefined 반환.
export function cultureOf(country: string | null | undefined): CultureInfo | undefined {
  if (!country || country === '대한민국') return undefined;
  return CULTURE[country];
}
