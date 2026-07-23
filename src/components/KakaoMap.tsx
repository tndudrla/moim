'use client';

import { useEffect, useRef } from 'react';
import { CUISINES, CUISINE_COLOR, type CatchPlace, type NewPlace, type Restaurant } from '@/lib/data';

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => object;
        Map: new (el: HTMLElement, opts: object) => { setCenter: (p: object) => void; panTo?: (p: object) => void };
        Circle: new (opts: object) => { setMap: (m: object | null) => void };
        Marker: new (opts: object) => { setMap: (m: object | null) => void };
        CustomOverlay: new (opts: object) => { setMap: (m: object | null) => void };
      };
    };
  }
}

const SDK_ID = 'kakao-map-sdk';

export default function KakaoMap({
  appKey,
  center,
  centerLabel,
  restaurants,
  newPlaces = [],
  catchPlaces = [],
  selected,
  onSelect,
}: {
  appKey: string;
  center: { lat: number; lng: number }; // 사업장 실좌표 (부모에서 key={officeName}로 위치별 리마운트)
  centerLabel: string; // 중심 마커 라벨 (본사=SK서린빌딩, 자회사=회사명)
  restaurants: Restaurant[];
  newPlaces?: NewPlace[]; // 🆕 서울시 인허가 기반 신규 오픈 (필터 ON일 때만 전달됨)
  catchPlaces?: CatchPlace[]; // 🎯 방문 이력 없는 캐치테이블 입점 (캐치테이블 탭에서만 전달됨)
  selected: Restaurant | null;
  onSelect: (r: Restaurant) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 사업장 기준 상대좌표(dx/dy, m) → 위경도
  const toLatLng = (p: { dx: number; dy: number }) => ({
    lat: center.lat + p.dy / 111320,
    lng: center.lng + p.dx / (111320 * Math.cos((center.lat * Math.PI) / 180)),
  });
  const mapRef = useRef<{ setCenter: (p: object) => void; panTo?: (p: object) => void } | null>(null);
  const overlaysRef = useRef<{ setMap: (m: object | null) => void }[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // SDK 로드 + 지도 생성 (1회)
  useEffect(() => {
    const init = () => {
      window.kakao!.maps.load(() => {
        const { maps } = window.kakao!;
        if (!containerRef.current || mapRef.current) return;
        const centerPos = new maps.LatLng(center.lat, center.lng);
        // 식당이 멀리 퍼져 있으면 초기 배율을 한 단계씩 축소 (자회사 반경 2~5km 대응)
        const maxDist = Math.max(0, ...restaurants.map((r) => r.distM));
        const level = maxDist > 3000 ? 6 : maxDist > 1500 ? 5 : 4;
        const map = new maps.Map(containerRef.current, { center: centerPos, level });
        mapRef.current = map;

        // 거리 동심원 + 사업장 마커
        for (const radius of [500, 1000, 1500]) {
          new maps.Circle({
            center: centerPos,
            radius,
            strokeWeight: 1.5,
            strokeColor: '#64748B',
            strokeStyle: 'dashed',
            fillColor: '#64748B',
            fillOpacity: 0.03,
          }).setMap(map);
        }
        new maps.CustomOverlay({
          position: centerPos,
          content: `<div style="background:#3d0b12;color:#fff;font-weight:900;font-size:11px;padding:4px 8px;border-radius:8px">${centerLabel}</div>`,
          yAnchor: 0.5,
        }).setMap(map);

        renderPins();
      });
    };

    if (window.kakao?.maps) {
      init();
      return;
    }
    let script = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SDK_ID;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => script?.removeEventListener('load', init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // 식당 핀 렌더 (필터 결과 바뀔 때마다)
  const renderPins = () => {
    const map = mapRef.current;
    const kakao = window.kakao;
    if (!map || !kakao) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    for (const r of restaurants) {
      const { lat, lng } = toLatLng(r);
      const isSel = selected?.id === r.id;
      // 지름 11~33px 정확히 3배 차이 — 방문 1회→11px, 상한 40회→33px, 제곱근 스케일
      const t = (Math.sqrt(Math.min(Math.max(r.visitCount, 1), 40)) - 1) / (Math.sqrt(40) - 1);
      const base = Math.round(11 + 22 * t);
      const size = isSel ? Math.max(base, 24) : base;
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer';
      el.innerHTML = `
        <div style="font-size:11px;font-weight:${isSel ? 900 : 600};color:#1e293b;
          text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap">${r.name}</div>
        <div style="width:${size}px;height:${size}px;border-radius:50%;
          background:${CUISINE_COLOR[r.cuisine]};border:2.5px solid #fff;
          box-shadow:0 0 0 1.5px rgba(0,0,0,.35),0 2px 5px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center">${
            r.visitCount >= 10
              ? `<span style="color:#fff;font-size:9px;font-weight:800;line-height:1">${r.visitCount}</span>`
              : ''
          }</div>`;
      el.addEventListener('click', () => onSelectRef.current(r));
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(lat, lng),
        content: el,
        yAnchor: 1,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 🆕 신규 오픈 핀 — 흰 바탕 + 에메랄드 테두리로 방문실적 핀과 구분, 탭하면 카카오맵 검색
    for (const p of newPlaces) {
      const { lat, lng } = toLatLng(p);
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer';
      el.innerHTML = `
        <div style="font-size:10px;font-weight:600;color:#065f46;
          text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap">🆕 ${p.name}</div>
        <div style="width:13px;height:13px;border-radius:50%;background:#fff;
          border:3.5px solid #10b981;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`;
      el.addEventListener('click', () =>
        window.open(`https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`, '_blank')
      );
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(lat, lng),
        content: el,
        yAnchor: 1,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 🎯 캐치테이블 입점 핀 — 흰 바탕 + 오렌지 테두리, 탭하면 캐치테이블 예약 페이지
    for (const p of catchPlaces) {
      const { lat, lng } = toLatLng(p);
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer';
      el.innerHTML = `
        <div style="font-size:10px;font-weight:600;color:#9a3412;
          text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap">🎯 ${p.name}</div>
        <div style="width:13px;height:13px;border-radius:50%;background:#fff;
          border:3.5px solid #f97316;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`;
      el.addEventListener('click', () => window.open(p.url, '_blank'));
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(lat, lng),
        content: el,
        yAnchor: 1,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(renderPins, [restaurants, newPlaces, catchPlaces, selected]);

  // 목록 스트립/핀에서 선택 시 해당 위치로 부드럽게 이동
  useEffect(() => {
    const map = mapRef.current;
    const kakao = window.kakao;
    if (!selected || !map || !kakao) return;
    const { lat, lng } = toLatLng(selected);
    const pos = new kakao.maps.LatLng(lat, lng);
    if (map.panTo) map.panTo(pos);
    else map.setCenter(pos);
  }, [selected]);

  const legendCuisines = CUISINES.filter((c) => restaurants.some((r) => r.cuisine === c));

  return (
    <div className="px-4">
      <div className="relative">
        {/* [&_img]:grayscale — 지도 타일(img)만 흑백, 핀(div)은 컬러 유지 */}
        <div
          ref={containerRef}
          className="h-[420px] w-full overflow-hidden rounded-xl bg-slate-200 shadow-sm [&_img]:grayscale"
        />
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-lg bg-white/90 px-2.5 py-2 shadow-md">
          {newPlaces.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <span className="inline-block h-3 w-3 rounded-full border-[3px] border-emerald-500 bg-white" />
              신규 오픈
            </div>
          )}
          {catchPlaces.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
              <span className="inline-block h-3 w-3 rounded-full border-[3px] border-orange-500 bg-white" />
              미방문 입점
            </div>
          )}
          {legendCuisines.map((c) => (
            <div key={c} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <span
                className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
                style={{ background: CUISINE_COLOR[c] }}
              />
              {c}
            </div>
          ))}
          <div className="mt-0.5 flex flex-col items-center gap-1 border-t border-slate-300/60 pt-1.5">
            <div className="flex items-end gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span className="h-3 w-3 rounded-full bg-slate-500" />
              <span className="h-4 w-4 rounded-full bg-slate-500" />
            </div>
            <span className="text-[10px] font-semibold leading-none text-slate-600">클수록 방문 많음</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        핀 크기·숫자 = 방문횟수 · 탭하면 상세 보기
      </p>
    </div>
  );
}
