'use client';

import { useState } from 'react';
import SniperLauncher from './SniperLauncher';

// 예약 진입점 — 인원·날짜·시간은 Claude 빈자리 감시(SniperLauncher) 조건으로만 쓰이므로
// 캐치테이블 입점 식당에서만 노출한다. 미입점 식당은 네이버 딥링크 안내만 남긴다.
// 실제로 동작하지 않는 "자동 예약 시뮬레이션"은 제거하고 실동작 경로만 노출한다.
export default function ReservationForm({
  name,
  catchtable,
  catchtableUrl,
  overseas = false,
  googleUrl,
  address,
}: {
  name: string;
  catchtable: boolean;
  catchtableUrl?: string;
  overseas?: boolean; // 해외법인 소속 — 네이버 대신 구글 지도로 안내
  googleUrl?: string; // 구글맵 장소 페이지 (해외 실측 placeUrl)
  address?: string;
}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const defaultDate = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  const [people, setPeople] = useState(4);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('12:00');

  const naverHref = `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
  const googleHref =
    googleUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ? `${name} ${address}` : name)}`;

  // 캐치테이블 실제 번들(ct_main/bootstrap.js)에서 확인한 비공식 쿼리 파라미터.
  // 상점 상세 페이지(HostDatePersonSelectorSlot)가 date(YYMMDD)·time(HHmm)·personCount를
  // URL에서 읽어 예약 인원·날짜 선택기를 그대로 채운다. 공식 문서는 없으므로 배포로 깨질 수 있음.
  const withCatchtableParams = (base: string) => {
    const params = new URLSearchParams({
      date: date.replace(/-/g, '').slice(2),
      time: time.replace(':', ''),
      personCount: String(people),
    });
    return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
  };

  if (!catchtable) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <a
          href={overseas ? googleHref : naverHref}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center justify-center rounded-xl py-3 text-sm font-bold text-white ${
            overseas ? 'bg-[#1A73E8]' : 'bg-[#03C75A]'
          }`}
        >
          {overseas ? 'Google 지도에서 예약·전화 확인' : '네이버에서 예약·전화 확인'}
        </a>
        <p className="mt-1.5 text-[11px] text-slate-400">
          {overseas
            ? '해외 식당이에요 — Google 지도에서 Reserve(예약) 버튼이나 전화번호를 확인해 주세요.'
            : '캐치테이블 미입점 식당이에요 — 네이버 지도에서 예약 버튼이나 전화번호를 확인해 주세요.'}
        </p>
      </div>
    );
  }

  const catchHref = withCatchtableParams(
    catchtableUrl ?? `https://app.catchtable.co.kr/ct/search?keyword=${encodeURIComponent(name)}`,
  );

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
            min={todayStr}
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

      <div className="mt-3 flex items-stretch gap-2">
        <a
          href={catchHref}
          target="_blank"
          rel="noreferrer"
          className="flex flex-[1.5] items-center justify-center rounded-xl bg-orange-500 py-3 text-sm font-bold text-white"
        >
          🎯 캐치테이블에서 예약
        </a>
        <a
          href={naverHref}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center rounded-xl bg-[#03C75A]/10 py-3 text-xs font-bold text-[#03A050]"
        >
          네이버에서 보기
        </a>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        자리가 없나요? 위 인원·날짜·시간 그대로 아래 🎯 버튼을 누르면 Claude가 취소표를 감시해요.
      </p>
      <SniperLauncher name={name} date={date} time={time} people={people} />
    </div>
  );
}
