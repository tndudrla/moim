'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CUISINES,
  DIST_BANDS,
  HQ_OFFICE,
  PRICE_LABEL,
  RESTAURANTS,
  buildRestaurants,
  type Cuisine,
  type Restaurant,
} from '@/lib/data';
import { buildStats, type Stats } from '@/lib/assign';
import { parseCardXlsx } from '@/lib/xlsx';
import { OFFICES, officesByCategory, type Office, type OfficeCategory } from '@/lib/offices';
import { restaurantsForOffice } from '@/lib/officeRestaurants';
import { cultureOf } from '@/lib/culture';
import RestaurantCard from './RestaurantCard';
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

type Kind = 'office' | 'trip'; // 사업장 vs 출장지
type Style = 'all' | 'exec' | 'casual'; // 식사 성격
type Gender = 'all' | 'm' | 'f';

const STYLE_ACCOUNT: Record<Style, string | null> = {
  all: null,
  exec: '접대비',
  casual: '경상회의비',
};

const AGES = [20, 30, 40, 50] as const;
const AGE_LABEL: Record<number, string> = { 20: '20대', 30: '30대', 40: '40대', 50: '50대+' };

// 사업장(회사) 카테고리 = 출장지를 제외한 전부
const OFFICE_CATS: OfficeCategory[] = ['본사', '해외법인', '국내 도시가스 자회사', '발전·집단에너지 자회사', '수소 자회사'];
const groups = officesByCategory();
const TRIP_OFFICES = groups['출장지'] ?? [];
const FIRST_TRIP = TRIP_OFFICES[0]?.name ?? HQ_OFFICE;

// --- 추천 부스트 (v1 느낌: 식사성격/연령/성별로 정렬 우대) ---
function styleBoost(r: Restaurant, style: Style): number {
  const f = r.features;
  if (style === 'exec') return (f.premium ? 1 : 0) + (f.room ? 1 : 0) + (f.quiet ? 1 : 0) + (f.english ? 1 : 0);
  if (style === 'casual') return (f.group ? 1 : 0) + (r.priceTier <= 2 ? 1 : 0);
  return 0;
}
function ageBoost(r: Restaurant, age: number | null): number {
  if (!age) return 0;
  if (age <= 30) {
    return (r.isNew ? 1 : 0) + (r.priceTier <= 2 ? 1 : 0) + (['양식', '일식', '동남아'].includes(r.cuisine) ? 1 : 0);
  }
  return (['한식', '중식'].includes(r.cuisine) ? 1 : 0) + (r.features.quiet ? 1 : 0) + (r.priceTier >= 2 ? 1 : 0);
}
function genderBoost(r: Restaurant, gender: Gender): number {
  if (gender === 'f') return (['일식', '양식', '동남아'].includes(r.cuisine) ? 1 : 0) + (r.isNew ? 1 : 0);
  if (gender === 'm') return (['한식', '중식'].includes(r.cuisine) ? 1 : 0) + (r.features.group ? 1 : 0);
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
            value === o.v ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
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
        active ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-600'
      }`}
    >
      {children}
    </button>
  );
}

export default function MosimApp() {
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
  const [newOnly, setNewOnly] = useState(false);
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'map') setView('map');
  }, []);

  // 엑셀 업로드 통계 (본사 전용)
  const [restaurants, setRestaurants] = useState<Restaurant[]>(RESTAURANTS);
  const [uploaded, setUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mosim-stats');
      if (saved) {
        setRestaurants(buildRestaurants(JSON.parse(saved) as Record<string, Stats>));
        setUploaded(true);
      }
    } catch {
      localStorage.removeItem('mosim-stats');
    }
  }, []);

  // 위치 종류(사업장/출장지) 전환 시 해당 종류의 첫 위치로
  useEffect(() => {
    setOfficeName(kind === 'trip' ? FIRST_TRIP : HQ_OFFICE);
  }, [kind]);

  // 위치 변경 시 할랄 자동 ON/OFF + 식문화 접기
  useEffect(() => {
    setHalalOnly(cultureOf(selectedOffice.country)?.halal ?? false);
    setShowCulture(false);
  }, [selectedOffice]);

  const onFile = async (file: File) => {
    try {
      const txs = parseCardXlsx(await file.arrayBuffer());
      const stats = buildStats(txs);
      localStorage.setItem('mosim-stats', JSON.stringify(stats));
      setRestaurants(buildRestaurants(stats));
      setUploaded(true);
      alert(`법인카드 내역 ${txs.length}건을 반영했어요.\n(식당 배정은 시연용 더미 매핑)`);
    } catch (e) {
      alert(`엑셀을 읽지 못했어요: ${e instanceof Error ? e.message : e}`);
    }
  };

  const resetData = () => {
    localStorage.removeItem('mosim-stats');
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
      if (halalOnly && !r.features.halal) return false;
      if (newOnly && !r.isNew) return false;
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
  }, [sourceList, style, age, gender, budget, dist, cuisines, antiGraft, halalOnly, newOnly, sort, boostActive]);

  const toggleCuisine = (c: Cuisine) => {
    setCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const activeDetailCount =
    (age !== null ? 1 : 0) + (gender !== 'all' ? 1 : 0) + (budget ? 1 : 0) + (dist ? 1 : 0) + cuisines.size;
  const account = STYLE_ACCOUNT[style];

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        {/* 브랜드 + 뷰 전환 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <h1 className="text-xl font-black text-slate-900">
              모심 <span className="text-rose-600">.</span>
            </h1>
            <p className="text-xs text-slate-500">상황 맞춤 식당 추천 AI</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
              >
                {v === 'list' ? '목록' : '지도'}
              </button>
            ))}
          </div>
        </div>

        {/* 위치: 사업장 / 출장지 구분 */}
        <div className="px-4 pb-2">
          <div className="mb-2">
            <Seg<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { v: 'office', label: '🏢 사업장' },
                { v: 'trip', label: '✈️ 출장지' },
              ]}
            />
          </div>
          <select
            value={officeName}
            onChange={(e) => setOfficeName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          >
            {kind === 'trip'
              ? TRIP_OFFICES.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.flag} {o.city}
                  </option>
                ))
              : OFFICE_CATS.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {groups[cat]?.map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.flag} {o.name}
                        {cat !== '본사' ? ` · ${o.city}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
          </select>
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

        {/* 식사 성격 */}
        <div className="px-4 pb-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">식사 성격</span>
            {account && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{account}</span>}
          </div>
          <Seg<Style>
            value={style}
            onChange={setStyle}
            options={[
              { v: 'all', label: '전체' },
              { v: 'exec', label: '임원 식사' },
              { v: 'casual', label: '캐주얼 식사' },
            ]}
          />
        </div>

        {/* 빠른 토글 + 상세 필터 열기 */}
        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto px-4 pb-2">
          <button
            onClick={() => setNewOnly((v) => !v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              newOnly ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            🆕 새로 오픈
          </button>
          <button
            onClick={() => setAntiGraft((v) => !v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              antiGraft ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            ⚖️ 김영란법
          </button>
          {isOverseas && (
            <button
              onClick={() => setHalalOnly((v) => !v)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                halalOnly ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              ☪️ 할랄만
            </button>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`ml-auto shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              showFilters || activeDetailCount > 0
                ? 'border-rose-500 bg-rose-50 text-rose-600'
                : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            상세 필터{activeDetailCount > 0 ? ` (${activeDetailCount})` : ''} {showFilters ? '▲' : '▾'}
          </button>
        </div>

        {/* 상세 필터 (접이식) */}
        {showFilters && (
          <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
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

      {/* 정렬 · 결과 수 */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <b className="text-slate-900">{results.length}</b>곳
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
                <button onClick={() => fileRef.current?.click()} className="text-xs text-slate-400 underline">
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
              className={`rounded-full px-2.5 py-1 ${sort === s ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      {view === 'map' ? (
        KAKAO_KEY && !isOverseas ? (
          <KakaoMap appKey={KAKAO_KEY} restaurants={results} selected={selected} onSelect={setSelected} />
        ) : (
          <MapView
            restaurants={results}
            selected={selected}
            onSelect={setSelected}
            centerBadge={officeName === HQ_OFFICE ? 'SK' : selectedOffice.flag}
            centerLabel={officeName === HQ_OFFICE ? '서린빌딩' : selectedOffice.city}
          />
        )
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
          {results.length === 0 && (
            <li className="rounded-xl bg-white p-8 text-center text-sm text-slate-400">
              조건에 맞는 식당이 없어요. 필터를 조정해 보세요.
            </li>
          )}
        </ul>
      )}

      {selected && <DetailSheet restaurant={selected} onClose={() => setSelected(null)} />}
    </div>
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
