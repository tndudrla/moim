'use client';

import { CUISINE_COLOR, type Restaurant } from '@/lib/data';

// SVG 목업 지도 — 서린빌딩(0,0) 기준 상대좌표(m). 추후 카카오맵 SDK로 교체 예정.
const R = 1650; // viewBox 반경(m)

export default function MapView({
  restaurants,
  selected,
  onSelect,
  centerBadge = 'SK',
  centerLabel = '서린빌딩',
}: {
  restaurants: Restaurant[];
  selected: Restaurant | null;
  onSelect: (r: Restaurant) => void;
  centerBadge?: string; // 중심 마커 안 표시(본사='SK', 그 외=국기)
  centerLabel?: string; // 중심 마커 아래 라벨(사업장/도시명)
}) {
  // 라벨이 겹치지 않게 방문횟수 상위 8곳 + 선택된 곳만 이름 표시
  const labeled = new Set(
    [...restaurants]
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 8)
      .map((r) => r.id)
  );

  return (
    <div className="px-4">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <svg viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="block w-full">
          {/* 거리 동심원 */}
          {[500, 1000, 1500].map((d) => (
            <g key={d}>
              <circle
                cx={0}
                cy={0}
                r={d}
                fill="none"
                stroke="#CBD5E1"
                strokeWidth={6}
                strokeDasharray="24 18"
              />
              <text x={20} y={-d + 60} fontSize={80} fill="#94A3B8">
                {d >= 1000 ? `${d / 1000}km` : `${d}m`}
              </text>
            </g>
          ))}

          {/* 식당 핀 */}
          {restaurants.map((r) => {
            const isSel = selected?.id === r.id;
            return (
              <g
                key={r.id}
                transform={`translate(${r.dx}, ${-r.dy})`}
                onClick={() => onSelect(r)}
                className="cursor-pointer"
              >
                <circle
                  r={isSel ? 90 : 55 + Math.min(r.visitCount, 30) * 1.5}
                  fill={CUISINE_COLOR[r.cuisine]}
                  fillOpacity={isSel ? 1 : 0.85}
                  stroke="#fff"
                  strokeWidth={isSel ? 20 : 10}
                />
                {(isSel || labeled.has(r.id)) && (
                  <text
                    y={-110}
                    fontSize={95}
                    fontWeight={isSel ? 900 : 500}
                    fill="#334155"
                    stroke="#F8FAFC"
                    strokeWidth={20}
                    paintOrder="stroke"
                    textAnchor="middle"
                  >
                    {r.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* 중심(사업장) 마커 — 선택 위치에 따라 라벨/뱃지 변경 */}
          <g>
            <rect x={-90} y={-90} width={180} height={180} rx={40} fill="#0F172A" />
            <text y={35} fontSize={85} fill="#fff" textAnchor="middle" fontWeight={900}>
              {centerBadge}
            </text>
            <text
              y={280}
              fontSize={95}
              fill="#0F172A"
              textAnchor="middle"
              fontWeight={900}
              stroke="#F8FAFC"
              strokeWidth={20}
              paintOrder="stroke"
            >
              {centerLabel}
            </text>
          </g>
        </svg>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        핀 크기 = 방문횟수 · 탭하면 상세 보기 (목업 지도, 카카오맵 연동 예정)
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {Object.entries(CUISINE_COLOR).map(([c, color]) => (
          <span key={c} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
