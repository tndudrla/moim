'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATCH_PLACES,
  COMPANY,
  CUISINE_COLOR,
  CUISINES,
  DIST_BANDS,
  HQ_OFFICE,
  NEW_PLACES,
  NEW_PLACES_CUTOFF,
  PRICE_LABEL,
  RESTAURANTS,
  buildRestaurants,
  travelLabel,
  type CatchPlace,
  type Cuisine,
  type NewPlace,
  type Restaurant,
} from '@/lib/data';
import { buildStats, type Stats } from '@/lib/assign';
import { applySettlement, type ImportedRestaurant } from '@/lib/settle';
import { parseCardXlsx } from '@/lib/xlsx';
import { OFFICES, TRIP_CATEGORIES, officesByCategory, type Office, type OfficeCategory } from '@/lib/offices';
import { officeLatLng, restaurantsForOffice } from '@/lib/officeRestaurants';
import { cultureOf } from '@/lib/culture';
import RestaurantCard from './RestaurantCard';
import ReservationForm from './ReservationForm';
import SniperBanner from './SniperBanner';
import MapView from './MapView';
import KakaoMap from './KakaoMap';
import DetailSheet from './DetailSheet';

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

type Sort = 'visits' | 'rating' | 'distance';

const SORT_LABEL: Record<Sort, string> = {
  visits: '방문횟수순',
  rating: '평점순',
  distance: '가까운순',
};

type Kind = 'office' | 'trip'; // 국내 사업장 vs 해외 출장지
type Style = 'all' | 'exec' | 'casual'; // 식사 성격
type Gender = 'all' | 'm' | 'f';
type Mode = 'card' | 'new' | 'catch'; // 서비스 3축: 법인카드 검증 맛집 / 새로 오픈 / 캐치테이블 예약

const MODE_META: Record<Mode, { icon: string; label: string; active: string }> = {
  card: { icon: '💳', label: '법인카드', active: 'bg-rose-600 text-white shadow' },
  new: { icon: '🆕', label: '새로 오픈', active: 'bg-emerald-500 text-white shadow' },
  catch: { icon: '🎯', label: '캐치테이블', active: 'bg-orange-500 text-white shadow' },
};

const STYLE_ACCOUNT: Record<Style, string | null> = {
  all: null,
  exec: '접대비',
  casual: '경상회의비',
};

// 캐치테이블 priceHint ↔ 예산 필터 tier 매핑 (김영란법 필터도 '고급'=3 기준)
const HINT_TIER: Record<CatchPlace['priceHint'], number> = { 저렴: 1, 보통: 2, 고급: 3 };
const HINT_STYLE: Record<CatchPlace['priceHint'], string> = {
  저렴: 'bg-sky-100 text-sky-700',
  보통: 'bg-amber-100 text-amber-700',
  고급: 'bg-slate-800 text-white',
};

const AGES = [20, 30, 40, 50] as const;
const AGE_LABEL: Record<number, string> = { 20: '20대', 30: '30대', 40: '40대', 50: '50대+' };

// 국내 사업장 = 본사 + 국내 자회사, 해외 출장지 = 해외법인
const OFFICE_CATS: OfficeCategory[] = ['본사', '국내 도시가스 자회사', '발전·집단에너지 자회사', '수소 자회사'];
// 카테고리 세그먼트용 짧은 라벨 (콤보박스에 전 회사를 나열하면 너무 길어서 2단 선택)
const CAT_SHORT: Record<OfficeCategory, string> = {
  본사: '🏢 본사',
  '국내 도시가스 자회사': '🔥 도시가스',
  '발전·집단에너지 자회사': '⚡ 발전·집단E',
  '수소 자회사': '💧 수소',
  해외법인: '✈️ 해외법인',
};
const groups = officesByCategory();
const TRIP_OFFICES = TRIP_CATEGORIES.flatMap((cat) => groups[cat] ?? []);
const FIRST_TRIP = TRIP_OFFICES[0]?.name ?? HQ_OFFICE;

// --- 추천 부스트 (식사성격/연령/성별로 정렬 우대. features 미기입(본사 실데이터)은 0점 처리) ---
function styleBoost(r: Restaurant, style: Style): number {
  const f = r.features ?? {};
  if (style === 'exec') return (f.premium ? 1 : 0) + (f.room ? 1 : 0) + (f.quiet ? 1 : 0) + (f.english ? 1 : 0);
  if (style === 'casual') return (f.group ? 1 : 0) + (r.priceTier <= 2 ? 1 : 0);
  return 0;
}
function ageBoost(r: Restaurant, age: number | null): number {
  if (!age) return 0;
  if (age <= 30) {
    return (r.isNew ? 1 : 0) + (r.priceTier <= 2 ? 1 : 0) + (['양식', '일식', '동남아'].includes(r.cuisine) ? 1 : 0);
  }
  return (['한식', '중식'].includes(r.cuisine) ? 1 : 0) + (r.features?.quiet ? 1 : 0) + (r.priceTier >= 2 ? 1 : 0);
}
function genderBoost(r: Restaurant, gender: Gender): number {
  if (gender === 'f') return (['일식', '양식', '동남아'].includes(r.cuisine) ? 1 : 0) + (r.isNew ? 1 : 0);
  if (gender === 'm') return (['한식', '중식'].includes(r.cuisine) ? 1 : 0) + (r.features?.group ? 1 : 0);
  return 0;
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
            value === o.v ? 'bg-[#fffdf8] text-slate-900 shadow' : 'text-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-rose-600 bg-rose-600 text-white'
          : 'border-slate-300 bg-[#fffdf8] text-slate-600'
      }`}
    >
      {children}
    </button>
  );
}

export default function MoimApp() {
  const [kind, setKind] = useState<Kind>('office');
  const [officeName, setOfficeName] = useState<string>(HQ_OFFICE);
  const [style, setStyle] = useState<Style>('all');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>('all');
  const [budget, setBudget] = useState<number | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [cuisines, setCuisines] = useState<Set<Cuisine>>(new Set());
  const [antiGraft, setAntiGraft] = useState(false);
  const [halalOnly, setHalalOnly] = useState(false);
  const [mode, setMode] = useState<Mode>('card');
  const [roomOnly, setRoomOnly] = useState(false);
  const [parkOnly, setParkOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCulture, setShowCulture] = useState(false);
  const [sort, setSort] = useState<Sort>('visits');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const selectedOffice: Office = useMemo(
    () => OFFICES.find((o) => o.name === officeName) ?? OFFICES[0],
    [officeName]
  );
  const culture = cultureOf(selectedOffice.country);
  const isOverseas = !!culture;
  const mapCenter = officeLatLng(officeName); // 실좌표 있는 국내 위치만 카카오맵 실지도

  // ?view=map / ?mode=new|catch / ?office=<이름> 딥링크 (서버 렌더는 기본값이라 mount 후 반영)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'map') setView('map');
    const m = params.get('mode');
    if (m === 'new' || m === 'catch') setMode(m);
    const o = params.get('office');
    const office = o && OFFICES.find((x) => x.name === o);
    if (office) {
      deeplinkOffice.current = office.name; // kind 전환 이펙트가 첫 위치로 덮지 않게 예약
      setKind(office.country === '대한민국' ? 'office' : 'trip');
      setOfficeName(office.name);
    }
  }, []);

  // 엑셀 업로드로 교체된 방문 통계 (localStorage 영속화, 본사 전용)
  const [restaurants, setRestaurants] = useState<Restaurant[]>(RESTAURANTS);
  const [uploaded, setUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const settle = localStorage.getItem('moim-settle');
      if (settle) {
        const { stats, imported } = JSON.parse(settle) as {
          stats: Record<string, Stats>;
          imported: ImportedRestaurant[];
        };
        setRestaurants(buildRestaurants(stats, imported));
        setUploaded(true);
        return;
      }
      const saved = localStorage.getItem('moim-stats');
      if (saved) {
        setRestaurants(buildRestaurants(JSON.parse(saved) as Record<string, Stats>));
        setUploaded(true);
      }
    } catch {
      localStorage.removeItem('moim-settle');
      localStorage.removeItem('moim-stats');
    }
  }, []);

  // 위치 종류(국내 사업장/해외 출장지) 전환 시 해당 종류의 첫 위치로 (딥링크 진입 시엔 그 위치 유지)
  const kindMounted = useRef(false);
  const deeplinkOffice = useRef<string | null>(null);
  useEffect(() => {
    if (!kindMounted.current) {
      kindMounted.current = true;
      return;
    }
    if (deeplinkOffice.current) {
      setOfficeName(deeplinkOffice.current);
      deeplinkOffice.current = null;
      return;
    }
    setOfficeName(kind === 'trip' ? FIRST_TRIP : HQ_OFFICE);
  }, [kind]);

  // 위치 변경 시 할랄 자동 ON/OFF + 식문화 접기
  useEffect(() => {
    setHalalOnly(cultureOf(selectedOffice.country)?.halal ?? false);
    setShowCulture(false);
  }, [selectedOffice]);

  // 캐치테이블은 국내 전용 — 해외 위치로 바꾸면 법인카드 탭으로 복귀
  useEffect(() => {
    if (isOverseas && mode === 'catch') setMode('card');
  }, [isOverseas, mode]);

  const onFile = async (file: File) => {
    try {
      const txs = parseCardXlsx(await file.arrayBuffer());
      if (txs.some((t) => t.merchant)) {
        // 미정산내역 형식: 가맹점명 실매칭 + 미등록 가맹점은 스텁으로 DB 자동 보강
        const res = applySettlement(txs);
        localStorage.setItem('moim-settle', JSON.stringify({ stats: res.stats, imported: res.imported }));
        localStorage.removeItem('moim-stats');
        setRestaurants(buildRestaurants(res.stats, res.imported));
        setUploaded(true);
        alert(
          `정산내역 ${txs.length}건을 반영했어요.\n` +
            `기존 식당 매칭 ${res.matchedTx}건 · 신규 등록 ${res.imported.length}곳(거래 ${res.newTx}건)\n` +
            `신규 등록 식당은 위치 확인 전이라 지도에는 표시되지 않아요.`
        );
      } else {
        // SAP 형식(가맹점명 없음): 시연용 더미 배정
        const stats = buildStats(txs);
        localStorage.setItem('moim-stats', JSON.stringify(stats));
        localStorage.removeItem('moim-settle');
        setRestaurants(buildRestaurants(stats));
        setUploaded(true);
        alert(`법인카드 내역 ${txs.length}건을 반영했어요.\n(식당 배정은 시연용 더미 매핑)`);
      }
    } catch (e) {
      alert(`엑셀을 읽지 못했어요: ${e instanceof Error ? e.message : e}`);
    }
  };

  const resetData = () => {
    localStorage.removeItem('moim-stats');
    localStorage.removeItem('moim-settle');
    setRestaurants(RESTAURANTS);
    setUploaded(false);
  };

  const sourceList = useMemo(
    () => (officeName === HQ_OFFICE ? restaurants : restaurantsForOffice(selectedOffice)),
    [officeName, restaurants, selectedOffice]
  );

  const boostActive = style !== 'all' || age !== null || gender !== 'all';

  const results = useMemo(() => {
    let list = sourceList.filter((r) => {
      if (style === 'exec' && !r.purposes.includes('접대')) return false;
      if (style === 'casual' && !(r.purposes.includes('저녁 회식') || r.purposes.includes('점심'))) return false;
      if (budget && r.priceTier !== budget) return false;
      if (dist && r.distM > dist) return false;
      if (cuisines.size > 0 && !cuisines.has(r.cuisine)) return false;
      if (antiGraft && r.priceTier === 3) return false;
      if (halalOnly && !r.features?.halal) return false;
      if (mode === 'new' && !r.isNew) return false;
      if (mode === 'catch' && !r.catchtable) return false;
      if (roomOnly && !r.features?.room) return false;
      if (parkOnly && !r.features?.parking) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (boostActive) {
        const d =
          styleBoost(b, style) * 2 + ageBoost(b, age) + genderBoost(b, gender) -
          (styleBoost(a, style) * 2 + ageBoost(a, age) + genderBoost(a, gender));
        if (d) return d;
      }
      if (sort === 'visits') return b.visitCount - a.visitCount || b.rating - a.rating;
      if (sort === 'rating') return b.rating - a.rating || b.visitCount - a.visitCount;
      return a.distM - b.distM;
    });
    return list;
  }, [sourceList, style, age, gender, budget, dist, cuisines, antiGraft, halalOnly, mode, roomOnly, parkOnly, sort, boostActive]);

  // 🆕 새로 오픈 탭 + 본사일 때 서울시 인허가 기반 신규 오픈 식당 (거리·음식종류 필터 적용)
  const newPlaces = useMemo(() => {
    if (mode !== 'new' || officeName !== HQ_OFFICE) return [];
    const list = NEW_PLACES.filter((p) => {
      if (dist && p.distM > dist) return false;
      if (cuisines.size > 0 && !cuisines.has(p.cuisine)) return false;
      return true;
    });
    return [...list].sort((a, b) =>
      sort === 'distance' ? a.distM - b.distM : b.opened.localeCompare(a.opened)
    );
  }, [mode, officeName, dist, cuisines, sort]);

  // 🎯 캐치테이블 탭 + 본사일 때 방문 이력 없는 입점 식당 (웹 실사, 거리·음식·예산·김영란법 필터 적용)
  const catchPlaces = useMemo(() => {
    if (mode !== 'catch' || officeName !== HQ_OFFICE) return [];
    const list = CATCH_PLACES.filter((p) => {
      if (dist && p.distM > dist) return false;
      if (cuisines.size > 0 && !cuisines.has(p.cuisine)) return false;
      if (budget && HINT_TIER[p.priceHint] !== budget) return false;
      if (antiGraft && p.priceHint === '고급') return false;
      return true;
    });
    return [...list].sort((a, b) => a.distM - b.distM);
  }, [mode, officeName, dist, cuisines, budget, antiGraft]);

  const toggleCuisine = (c: Cuisine) => {
    setCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const activeDetailCount =
    (style !== 'all' ? 1 : 0) + (age !== null ? 1 : 0) + (gender !== 'all' ? 1 : 0) +
    (roomOnly ? 1 : 0) + (parkOnly ? 1 : 0) + (budget ? 1 : 0) + (dist ? 1 : 0) + cuisines.size +
    (antiGraft ? 1 : 0) + (halalOnly ? 1 : 0);

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#fffdf8]/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-black text-slate-900">
                모심 <span className="text-rose-600">.</span>
              </h1>
              <p className="text-[10px] font-extrabold tracking-tight">
                <span className="text-[#ea002c]">SK</span>{' '}
                <span className="text-[#f47725]">innovation</span>{' '}
                <span className="text-[#f47725]">E&amp;S</span>
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {COMPANY} 법인카드 실적 기반 식당 지도
            </p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${
                  view === v ? 'bg-[#fffdf8] text-slate-900 shadow' : 'text-slate-500'
                }`}
              >
                {v === 'list' ? '목록' : '지도'}
              </button>
            ))}
          </div>
        </div>

        {/* 위치: 국내 사업장 / 해외 출장지 구분 */}
        <div className="px-4 pb-2">
          <div className="mb-2">
            <Seg<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { v: 'office', label: '🏢 국내 사업장' },
                { v: 'trip', label: '✈️ 해외 출장지' },
              ]}
            />
          </div>
          {kind === 'office' ? (
            <>
              {/* 2단 선택: 카테고리 먼저 → 해당 자회사만 콤보박스에 (전 회사 나열 방지) */}
              <div className="mb-2 flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                {OFFICE_CATS.map((cat) => {
                  const active = selectedOffice.category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() =>
                        setOfficeName(cat === '본사' ? HQ_OFFICE : (groups[cat]?.[0]?.name ?? HQ_OFFICE))
                      }
                      className={`flex-1 rounded-md px-1 py-1.5 transition-colors ${
                        active ? 'bg-[#fffdf8] font-bold text-slate-900 shadow' : 'text-slate-500'
                      }`}
                    >
                      {CAT_SHORT[cat]}
                    </button>
                  );
                })}
              </div>
              {(groups[selectedOffice.category]?.length ?? 0) > 1 && (
                <select
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-[#fffdf8] px-3 py-2 text-sm font-medium text-slate-800"
                >
                  {groups[selectedOffice.category]?.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.flag} {o.name} · {o.city}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <select
              value={officeName}
              onChange={(e) => setOfficeName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-[#fffdf8] px-3 py-2 text-sm font-medium text-slate-800"
            >
              {TRIP_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {groups[cat]?.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.flag} {o.name} · {o.city}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <p className="mt-1 text-[11px] text-slate-400">{selectedOffice.address}</p>

          {isOverseas && culture && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50">
              <button
                onClick={() => setShowCulture((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-amber-800"
              >
                <span>
                  {culture.flag} {selectedOffice.country} 접대 식문화
                  {culture.halal && (
                    <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">할랄 필수</span>
                  )}
                </span>
                <span className="text-amber-500">{showCulture ? '▲' : '▼'}</span>
              </button>
              {showCulture && (
                <ul className="list-disc space-y-1 px-6 pb-3 text-[11px] leading-relaxed text-amber-900">
                  {culture.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 서비스 3축 모드 — 기존 식사 성격 세그먼트 자리 */}
        <div className="px-4 pb-2">
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-bold">
            {(Object.keys(MODE_META) as Mode[]).map((m) => {
              const disabled = m === 'catch' && isOverseas;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={disabled}
                  title={disabled ? '캐치테이블은 국내 전용이에요' : undefined}
                  className={`flex-1 rounded-md px-2 py-2 transition-colors ${
                    mode === m ? MODE_META[m].active : disabled ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {MODE_META[m].icon} {MODE_META[m].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 상세 필터 열기 (김영란법·할랄은 상세 필터의 '기준' 행으로 이동) */}
        <div className="flex items-center px-4 pb-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`ml-auto shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              showFilters || activeDetailCount > 0
                ? 'border-rose-500 bg-rose-50 text-rose-600'
                : 'border-slate-300 bg-[#fffdf8] text-slate-600'
            }`}
          >
            상세 필터{activeDetailCount > 0 ? ` (${activeDetailCount})` : ''} {showFilters ? '▲' : '▾'}
          </button>
        </div>

        {/* 활성 모드·필터 기준 안내 */}
        {(mode !== 'card' || antiGraft) && (
          <div className="space-y-1 px-4 pb-2">
            {mode === 'new' && (
              <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-emerald-800">
                <b>🆕 새로 오픈</b> — 서울시 일반음식점 인허가 데이터 기준, 최근 1개월(
                {NEW_PLACES_CUTOFF.replaceAll('-', '.')} 이후) 개업 신고 + 영업 중 + 반경 1.5km 이내
                {officeName !== HQ_OFFICE && ' (본사에서만 제공)'}
              </p>
            )}
            {mode === 'catch' && (
              <p className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-orange-800">
                <b>🎯 캐치테이블</b> — 입점 식당만 모아 보여드려요. 카드를 탭해 바로 예약하고, 자리가
                없으면 <b>🎯 Claude 빈자리 감시</b>(내 PC)로 취소표를 잡아드려요.
                {officeName !== HQ_OFFICE && ' 미방문 입점 큐레이션은 본사에서만 제공돼요.'}
              </p>
            )}
            {antiGraft && (
              <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700">
                <b>⚖️ 김영란법</b> — 청탁금지법 식사 한도(1인 5만원)를 넘기 쉬운 &lsquo;
                {PRICE_LABEL[3]}&rsquo; 가격대 식당 제외
              </p>
            )}
          </div>
        )}

        {/* 상세 필터 (접이식) */}
        {showFilters && (
          <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
            <FilterRow label="기준">
              <Chip active={antiGraft} onClick={() => setAntiGraft((v) => !v)}>
                ⚖️ 김영란법
              </Chip>
              {isOverseas && (
                <Chip active={halalOnly} onClick={() => setHalalOnly((v) => !v)}>
                  ☪️ 할랄만
                </Chip>
              )}
            </FilterRow>
            <FilterRow label="성격">
              {([
                ['all', '전체'],
                ['exec', '임원 식사'],
                ['casual', '캐주얼 식사'],
              ] as [Style, string][]).map(([s, l]) => (
                <Chip key={s} active={style === s} onClick={() => setStyle(s)}>
                  {l}
                  {s !== 'all' && STYLE_ACCOUNT[s] && style === s ? ` · ${STYLE_ACCOUNT[s]}` : ''}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="연령대">
              {AGES.map((a) => (
                <Chip key={a} active={age === a} onClick={() => setAge(age === a ? null : a)}>
                  {AGE_LABEL[a]}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="성별">
              {([
                ['all', '전체'],
                ['m', '남성'],
                ['f', '여성'],
              ] as [Gender, string][]).map(([g, l]) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {l}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="시설">
              <Chip active={roomOnly} onClick={() => setRoomOnly((v) => !v)}>
                🚪 룸 보유
              </Chip>
              <Chip active={parkOnly} onClick={() => setParkOnly((v) => !v)}>
                🅿️ 주차 편리
              </Chip>
            </FilterRow>
            <FilterRow label="예산">
              {[1, 2, 3].map((t) => (
                <Chip key={t} active={budget === t} onClick={() => setBudget(budget === t ? null : t)}>
                  {PRICE_LABEL[t]}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="거리">
              {DIST_BANDS.map((d) => (
                <Chip key={d} active={dist === d} onClick={() => setDist(dist === d ? null : d)}>
                  ~{d >= 1000 ? `${d / 1000}km` : `${d}m`}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="음식">
              {CUISINES.map((c) => (
                <Chip key={c} active={cuisines.has(c)} onClick={() => toggleCuisine(c)}>
                  {c}
                </Chip>
              ))}
            </FilterRow>
          </div>
        )}
      </header>

      {/* 빈자리 감시 기능 소개 — 캐치테이블 탭에서만 (해외 위치에서는 탭 자체가 비활성) */}
      {mode === 'catch' && !isOverseas && <SniperBanner />}

      {/* 정렬 · 결과 수 */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <b className="text-slate-900">{results.length + newPlaces.length + catchPlaces.length}</b>곳
          {officeName === HQ_OFFICE ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
              {uploaded ? (
                <button onClick={resetData} className="text-xs text-rose-500 underline">
                  업로드 데이터 ✕
                </button>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-slate-400 underline"
                >
                  엑셀 업로드
                </button>
              )}
            </>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">시연용 예시 데이터</span>
          )}
        </p>
        <div className="flex gap-1 text-xs font-medium">
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-full px-2.5 py-1 ${
                sort === s ? 'bg-[#3d0b12] text-white' : 'text-slate-500'
              }`}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 — 카카오맵은 실좌표가 있는 본사만, 그 외 위치는 SVG 목업 지도 */}
      {view === 'map' ? (
        <div>
          {KAKAO_KEY && !isOverseas && mapCenter ? (
            <KakaoMap
              key={officeName}
              appKey={KAKAO_KEY}
              center={mapCenter}
              centerLabel={officeName === HQ_OFFICE ? 'SK서린빌딩' : officeName}
              restaurants={results.filter((r) => !r.pending)}
              newPlaces={newPlaces}
              catchPlaces={catchPlaces}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <MapView
              restaurants={results.filter((r) => !r.pending)}
              selected={selected}
              onSelect={setSelected}
              centerBadge={officeName === HQ_OFFICE ? 'SK' : selectedOffice.flag}
              centerLabel={officeName === HQ_OFFICE ? '서린빌딩' : selectedOffice.city}
            />
          )}
          <MapListStrip
            restaurants={results.filter((r) => !r.pending)}
            rankBase={sort === 'visits'}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      ) : (
        <ul className="space-y-3 px-4">
          {results.map((r, i) => (
            <RestaurantCard
              key={r.id}
              restaurant={r}
              rank={sort === 'visits' ? i + 1 : undefined}
              onClick={() => setSelected(r)}
            />
          ))}
          {newPlaces.length > 0 && (
            <li className="pt-1 text-center text-[11px] text-slate-400">
              🆕 서울시 일반음식점 인허가 데이터 기준 ({NEW_PLACES_CUTOFF} 이후 개업 신고)
            </li>
          )}
          {newPlaces.map((p) => (
            <NewPlaceCard key={`${p.name}-${p.address}`} place={p} />
          ))}
          {catchPlaces.length > 0 && (
            <li className="pt-1 text-center text-[11px] text-slate-400">
              🎯 아직 안 가본 캐치테이블 입점 식당 — 예약이 어려운 곳은 빈자리 감시로 잡아드려요
            </li>
          )}
          {catchPlaces.map((p) => (
            <CatchPlaceCard key={p.name} place={p} />
          ))}
          {results.length === 0 && newPlaces.length === 0 && catchPlaces.length === 0 && (
            <li className="rounded-xl bg-[#fffdf8] p-8 text-center text-sm text-slate-400">
              {mode === 'catch'
                ? officeName !== HQ_OFFICE
                  ? '이 위치에는 캐치테이블 입점 정보가 없어요. 미방문 입점 큐레이션은 본사(SK서린빌딩)에서 제공돼요.'
                  : '조건에 맞는 캐치테이블 입점 식당이 없어요. 필터를 조정해 보세요.'
                : mode === 'new'
                  ? '조건에 맞는 신규 오픈 식당이 없어요. 필터를 조정해 보세요.'
                  : '조건에 맞는 식당이 없어요. 필터를 조정해 보세요.'}
            </li>
          )}
        </ul>
      )}

      {selected && <DetailSheet restaurant={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// 신규 오픈 식당 카드 — 방문 실적이 없어 상세시트 대신 카카오맵 검색으로 연결
function NewPlaceCard({ place }: { place: NewPlace }) {
  return (
    <li>
      <button
        onClick={() =>
          window.open(`https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`, '_blank')
        }
        className="w-full rounded-xl border border-emerald-200 bg-[#fffdf8] p-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            🆕 새로 오픈
          </span>
          <b className="truncate text-slate-900">{place.name}</b>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {place.cuisine} · 도보 {Math.max(1, Math.round(place.distM / 67))}분 ({place.distM}m) · 개업{' '}
          {place.opened.replaceAll('-', '.')}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{place.address}</p>
      </button>
    </li>
  );
}

// 지도 아래 식당 미니카드 가로 스크롤 — 카드 탭 ↔ 지도 핀 선택 동기화
function MapListStrip({
  restaurants,
  rankBase,
  selected,
  onSelect,
}: {
  restaurants: Restaurant[];
  rankBase: boolean; // 방문횟수순일 때만 순위 배지 표시
  selected: Restaurant | null;
  onSelect: (r: Restaurant) => void;
}) {
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // 핀 클릭 등 외부에서 선택이 바뀌면 해당 카드를 스트립 중앙으로
  useEffect(() => {
    if (!selected) return;
    itemRefs.current.get(selected.id)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selected]);

  if (restaurants.length === 0) return null;

  return (
    <ul className="scrollbar-hide mt-2 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 pt-1">
      {restaurants.map((r, i) => {
        const isSel = selected?.id === r.id;
        return (
          <li
            key={r.id}
            ref={(el) => {
              if (el) itemRefs.current.set(r.id, el);
              else itemRefs.current.delete(r.id);
            }}
            onClick={() => onSelect(r)}
            style={{ borderLeftColor: CUISINE_COLOR[r.cuisine] }}
            className={`w-52 shrink-0 snap-center cursor-pointer rounded-xl border border-l-4 p-3 shadow-md transition-all ${
              isSel
                ? 'border-rose-500 bg-rose-50 shadow-lg ring-1 ring-rose-400'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {rankBase && (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-black ${
                    i < 3 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {i + 1}
                </span>
              )}
              <b className="min-w-0 flex-1 truncate text-sm text-slate-900">{r.name}</b>
              {r.visitCount > 0 && (
                <span className="shrink-0 rounded-md bg-[#3d0b12] px-1.5 py-0.5 text-[11px] font-black text-white">
                  {r.visitCount}회
                </span>
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <span className="font-bold" style={{ color: CUISINE_COLOR[r.cuisine] }}>
                {r.cuisine}
              </span>
              {r.reviewCount > 0 && (
                <span className="font-semibold text-amber-500">★ {r.rating.toFixed(1)}</span>
              )}
              <span>{travelLabel(r.distM)}</span>
              <span className="text-slate-400">{PRICE_LABEL[r.priceTier].replace('원대', '')}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// 캐치테이블 입점 식당 카드 — 방문 이력이 없어 상세시트는 없지만, 카드를 펼치면
// 예약 조건 입력 + 캐치테이블 딥링크 + Claude 빈자리 감시까지 한자리에서 이어진다.
// (탭 즉시 외부 이탈시키던 이전 방식은 정보 확인·감시 진입이 불가능했음)
function CatchPlaceCard({ place }: { place: CatchPlace }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden rounded-xl border border-orange-200 bg-[#fffdf8] shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-4 text-left">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            🎯 캐치테이블
          </span>
          <b className="truncate text-slate-900">{place.name}</b>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${HINT_STYLE[place.priceHint]}`}
          >
            {place.priceHint}
          </span>
          <span className="ml-auto shrink-0 text-xs text-orange-400">{open ? '▲' : '▼'}</span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {place.cuisine} · {travelLabel(place.distM)} ({place.distM}m) ·{' '}
          {open ? '접기' : '탭해서 예약 옵션 보기'}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{place.address}</p>
      </button>
      {open && (
        <div className="border-t border-orange-100 px-4 pb-4">
          <a
            href={place.placeUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-block text-[11px] font-medium text-slate-500 underline"
          >
            카카오맵에서 위치·리뷰 보기 ↗
          </a>
          <ReservationForm name={place.name} catchtable catchtableUrl={place.url} />
        </div>
      )}
    </li>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto">
      <span className="w-10 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      {children}
    </div>
  );
}
