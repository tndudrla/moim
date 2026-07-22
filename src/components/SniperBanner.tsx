'use client';

import { useState } from 'react';
import { AGENT, SETUP_CMD } from './SniperLauncher';

// 첫 화면의 빈자리 감시 기능 소개 배너 — 펼치면 사용법·내 PC 에이전트 상태·설치 명령 표시
export default function SniperBanner() {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<'unknown' | 'ready' | 'partial' | 'none'>('unknown');
  const [copied, setCopied] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && agent === 'unknown') {
      try {
        const res = await fetch(`${AGENT}/status`, { signal: AbortSignal.timeout(2000) });
        const s = (await res.json()) as { claude: boolean; skill: boolean };
        setAgent(s.claude && s.skill ? 'ready' : 'partial');
      } catch {
        setAgent('none');
      }
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(SETUP_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="px-4 pt-3">
      <div className="overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50">
        <button onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <span className="text-lg">🎯</span>
          <span className="min-w-0 flex-1">
            <b className="text-sm text-violet-800">
              Claude 빈자리 감시
              <span className="ml-1.5 rounded bg-violet-600 px-1 py-0.5 text-[9px] font-bold text-white align-middle">NEW</span>
            </b>
            <span className="block truncate text-[11px] text-violet-600">
              꽉 찬 식당도 취소표가 나오면 내 PC의 Claude가 자동 예약
            </span>
          </span>
          <span className="text-violet-400">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="border-t border-violet-100 px-3 py-2.5">
            <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
              <li>
                식당을 골라 상세 → 예약에서 <b className="text-violet-700">🎯 빈자리 감시</b> 버튼을 누르면
              </li>
              <li>
                <b>내 PC</b>의 로그인된 크롬에서 Claude가 캐치테이블 취소표를 30초 간격으로 감시하고 예약을 시도해요
                (결제 단계는 반드시 직접 확인)
              </li>
              <li>최초 1회 PC 설정이 필요해요 (PowerShell에 한 줄 붙여넣기)</li>
            </ol>

            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold">
              {agent === 'ready' && <span className="text-emerald-600">✅ 이 PC는 준비 완료 — 바로 사용할 수 있어요</span>}
              {agent === 'partial' && <span className="text-amber-600">⚠️ 에이전트는 있지만 설치가 덜 됐어요 — 아래 명령 재실행</span>}
              {agent === 'none' && <span className="text-rose-500">❌ 이 기기에는 아직 설정되지 않았어요</span>}
              {agent === 'unknown' && <span className="text-slate-400">에이전트 확인 중...</span>}
            </div>

            {agent !== 'ready' && (
              <button
                onClick={copy}
                className="mt-1.5 w-full rounded-lg bg-slate-800 px-2 py-1.5 text-left font-mono text-[10px] text-emerald-300"
              >
                {copied ? '✅ 복사됨! PC의 PowerShell에 붙여넣으세요' : `${SETUP_CMD}  📋`}
              </button>
            )}
            <p className="mt-1.5 text-[10px] text-slate-400">
              감시·예약은 본인 PC·본인 캐치테이블 계정으로 실행됩니다 · 모바일에서는 설치/실행 불가 (PC 브라우저 전용)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
