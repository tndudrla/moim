'use client';

import { CUISINE_COLOR, PRICE_LABEL, type Restaurant } from '@/lib/data';

export default function RestaurantCard({
  restaurant: r,
  rank,
  onClick,
}: {
  restaurant: Restaurant;
  rank?: number;
  onClick: () => void;
}) {
  return (
    <li
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-[#fffdf8] p-4 shadow-md transition-shadow active:shadow-lg"
      style={{ animation: 'cardIn 0.25s ease both' }}
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
              rank <= 3 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-slate-900">{r.name}</h3>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: CUISINE_COLOR[r.cuisine] }}
            >
              {r.cuisine}
            </span>
            {r.isNew && (
              <span className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                🆕 새로 오픈
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{r.desc}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-amber-500">
              ★ {r.rating.toFixed(1)}
              <span className="ml-0.5 font-normal text-slate-400">({r.reviewCount.toLocaleString()})</span>
            </span>
            <span>
              {r.distM}m · 도보 {r.walkMin}분
            </span>
            <span>{PRICE_LABEL[r.priceTier]}</span>
            {r.features?.room && <span className="text-slate-500">🚪 룸</span>}
            {r.features?.parking && <span className="text-slate-500">🅿️ 주차</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-black text-slate-900">{r.visitCount}</p>
          <p className="text-[10px] text-slate-400">방문</p>
        </div>
      </div>
    </li>
  );
}
