'use client';

import { useState } from 'react';
import {
  ACCOUNT_BY_PURPOSE,
  CUISINE_COLOR,
  PRICE_LABEL,
  formatAmount,
  formatDate,
  type Restaurant,
} from '@/lib/data';
import ReservationForm from './ReservationForm';

export default function DetailSheet({
  restaurant: r,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const [showReservation, setShowReservation] = useState(false);

  return (
    <div className="fixed inset-0 z-30" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" style={{ animation: 'fadeIn 0.2s ease' }} />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-2xl bg-white p-5 pb-8"
        style={{ animation: 'sheetUp 0.25s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

        {/* 기본 정보 */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">{r.name}</h2>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: CUISINE_COLOR[r.cuisine] }}
              >
                {r.cuisine}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{r.desc}</p>
            {r.address && <p className="mt-0.5 text-xs text-slate-400">{r.address}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-500"
          >
            닫기
          </button>
        </div>

        {/* 요약 지표 */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-black text-slate-900">{r.visitCount}</p>
            <p className="text-[11px] text-slate-400">임직원 방문</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-black text-amber-500">★ {r.rating.toFixed(1)}</p>
            <p className="text-[11px] text-slate-400">
              카카오 {r.kakao.score} · 구글 {r.google.score}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-black text-slate-900">{r.walkMin}분</p>
            <p className="text-[11px] text-slate-400">도보 {r.distM}m</p>
          </div>
        </div>

        {/* 태그 */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {PRICE_LABEL[r.priceTier]}
          </span>
          {r.purposes.map((p) => (
            <span key={p} className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-600">
              {p} · {ACCOUNT_BY_PURPOSE[p]}
            </span>
          ))}
        </div>

        {/* 최근 법인카드 사용 내역 */}
        {r.recent.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-slate-400">최근 법인카드 사용 내역</h3>
            <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {r.recent.map((v, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-slate-500">{formatDate(v.date)}</span>
                  <span className="text-slate-400">{v.account}</span>
                  <span className="font-semibold text-slate-700">{formatAmount(v.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 액션 */}
        <div className="mt-4 flex gap-2">
          <a
            href={r.placeUrl ?? `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-xl bg-slate-900 py-3 text-center text-sm font-bold text-white"
          >
            지도에서 보기
          </a>
          <button
            onClick={() => setShowReservation((v) => !v)}
            className={`flex-1 rounded-xl py-3 text-sm font-bold ${
              r.naverBooking || r.catchtable
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            {showReservation ? '예약 접기' : r.naverBooking || r.catchtable ? '예약하기' : '예약 문의'}
          </button>
        </div>

        {showReservation && <ReservationForm restaurant={r} />}
      </div>
    </div>
  );
}
