'use client';

import { useState } from 'react';
import type { Restaurant } from '@/lib/data';
import SniperLauncher from './SniperLauncher';

// 예약 자동화 목업 — 기획서의 "인원·시간 입력 → 네이버예약/캐치테이블 자동 예약" 흐름.
// 실제 자동화(스나이핑) 대신 딥링크 + 시뮬레이션으로 UX만 구현한 단계.
export default function ReservationForm({ restaurant: r }: { restaurant: Restaurant }) {
  const today = new Date();
  const defaultDate = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  const [people, setPeople] = useState(4);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('12:00');
  const [status, setStatus] = useState<'idle' | 'booking' | 'done'>('idle');

  const simulate = () => {
    setStatus('booking');
    setTimeout(() => setStatus('done'), 1500);
  };

  if (status === 'done') {
    return (
      <div className="mt-3 rounded-xl bg-emerald-50 p-4 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-1 text-sm font-bold text-emerald-700">예약 요청 완료 (시뮬레이션)</p>
        <p className="mt-1 text-xs text-emerald-600">
          {r.name} · {date} {time} · {people}명
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          실제 자동 예약은 네이버예약/캐치테이블 연동 후 제공됩니다
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-2 text-xs font-medium text-emerald-700 underline"
        >
          다시 입력
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-slate-500">
          인원
          <select
            value={people}
            onChange={(e) => setPeople(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-[#fffdf8] px-2 py-2 text-sm font-semibold text-slate-900"
          >
            {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          날짜
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-[#fffdf8] px-2 py-2 text-sm font-semibold text-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          시간
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-[#fffdf8] px-2 py-2 text-sm font-semibold text-slate-900"
          >
            {['11:30', '12:00', '12:30', '17:30', '18:00', '18:30', '19:00', '19:30'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        onClick={simulate}
        disabled={status === 'booking'}
        className="mt-3 w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {status === 'booking' ? '예약 요청 중...' : '자동 예약 (시뮬레이션)'}
      </button>

      <div className="mt-2 flex gap-2">
        <a
          href={`https://map.naver.com/p/search/${encodeURIComponent(r.name)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-[#03C75A]/10 py-2 text-center text-xs font-bold text-[#03A050]"
        >
          네이버에서 예약
        </a>
        {r.catchtable ? (
          <a
            href={r.catchtableUrl ?? `https://app.catchtable.co.kr/ct/search?keyword=${encodeURIComponent(r.name)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-orange-500/10 py-2 text-center text-xs font-bold text-orange-600"
          >
            캐치테이블에서 예약
          </a>
        ) : (
          <span className="flex-1 rounded-lg bg-slate-100 py-2 text-center text-xs font-medium text-slate-400">
            캐치테이블 미입점
          </span>
        )}
      </div>

      {/* Claude 자동 예약은 캐치테이블 입점 식당에서만 */}
      {r.catchtable && <SniperLauncher name={r.name} date={date} time={time} people={people} />}
    </div>
  );
}
