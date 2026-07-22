'use client';

import { useEffect, useRef } from 'react';
import { COMPANY_LATLNG, CUISINES, CUISINE_COLOR, latLngOf, type NewPlace, type Restaurant } from '@/lib/data';

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => object;
        Map: new (el: HTMLElement, opts: object) => { setCenter: (p: object) => void };
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
  restaurants,
  newPlaces = [],
  selected,
  onSelect,
}: {
  appKey: string;
  restaurants: Restaurant[];
  newPlaces?: NewPlace[]; // 🆕 서울시 인허가 기반 신규 오픈 (필터 ON일 때만 전달됨)
  selected: Restaurant | null;
  onSelect: (r: Restaurant) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ setCenter: (p: object) => void } | null>(null);
  const overlaysRef = useRef<{ setMap: (m: object | null) => void }[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // SDK 로드 + 지도 생성 (1회)
  useEffect(() => {
    const init = () => {
      window.kakao!.maps.load(() => {
        const { maps } = window.kakao!;
        if (!containerRef.current || mapRef.current) return;
        const center = new maps.LatLng(COMPANY_LATLNG.lat, COMPANY_LATLNG.lng);
        const map = new maps.Map(containerRef.current, { center, level: 4 });
        mapRef.current = map;

        // 거리 동심원 + 회사 마커
        for (const radius of [500, 1000, 1500]) {
          new maps.Circle({
            center,
            radius,
            strokeWeight: 1.5,
            strokeColor: '#64748B',
            strokeStyle: 'dashed',
            fillColor: '#64748B',
            fillOpacity: 0.03,
          }).setMap(map);
        }
        new maps.CustomOverlay({
          position: center,
          content:
            '<div style="background:#3d0b12;color:#fff;font-weight:900;font-size:11px;padding:4px 8px;border-radius:8px">SK서린빌딩</div>',
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
      const { lat, lng } = latLngOf(r);
      const isSel = selected?.id === r.id;
      const size = isSel ? 24 : 14 + Math.min(r.visitCount, 30) / 2.5;
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
      const { lat, lng } = latLngOf(p);
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
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(renderPins, [restaurants, newPlaces, selected]);

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
