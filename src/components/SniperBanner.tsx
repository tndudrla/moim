'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT, SETUP_CMD } from './SniperLauncher';

// 빈자리 감시 기능 소개 — PC 전용 기능이라 모바일 컬럼 밖 오른쪽 빈 공간에
// 접이식 배너로 표시한다 (xl 미만 화면에서는 숨김). 접힌 상태에서도 상태등(빨강→초록)이
// 보이도록 라벨을 함께 표시하고, 준비 전에는 주기적으로 재확인해 설치 완료가 바로 반영된다.
export default function SniperBanner() {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<'unknown' | 'ready' | 'partial' | 'none'>('unknown');
  const [copied, setCopied] = useState(false);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT}/status`, { signal: AbortSignal.timeout(2000) });
      const s = (await res.json()) as { claude: boolean; skill: boolean; auth: boolean };
      setAgent(s.claude && s.skill && s.auth ? 'ready' : 'partial');
    } catch {
      setAgent('none');
    }
  }, []);

  // 배너가 보이는 넓은 화면에서만 에이전트 진단 (모바일에서 불필요한 localhost 요청 방지)
  // 준비 전에는 15초마다 재확인 — 설치를 마치면 빨강불이 초록불로 바뀌는 게 바로 보인다.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1280px)').matches) return;
    check();
    const id = setInterval(() => {
      if (agentRef.current !== 'ready') check();
    }, 15000);
    return () => clearInterval(id);
  }, [check]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('자동 복사가 막혀 있어요. 아래 명령을 직접 복사하세요:', SETUP_CMD);
    }
  };

  const DOT: Record<typeof agent, string> = {
    unknown: 'bg-slate-300',
    ready: 'bg-emerald-500',
    partial: 'bg-amber-400',
    none: 'bg-rose-500',
  };
  const LABEL: Record<typeof agent, { text: string; cls: string }> = {
    unknown: { text: '확인 중', cls: 'text-slate-400' },
    ready: { text: '준비 완료', cls: 'text-emerald-600' },
    partial: { text: '설정 미완', cls: 'text-amber-600' },
    none: { text: '설치 필요', cls: 'text-rose-500' },
  };

  return (
    <aside className="fixed left-[calc(50%+256px)] top-28 z-30 hidden w-72 xl:block">
      <div className="overflow-hidden rounded-xl border border-violet-200 bg-white/80 shadow-sm backdrop-blur">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <span>🎯</span>
          <b className="flex-1 truncate text-sm text-violet-800">Claude 빈자리 감시</b>
          <span
            className={`h-2.5 w-2.5 rounded-full ${DOT[agent]} ${agent !== 'ready' && agent !== 'unknown' ? 'animate-pulse' : ''}`}
            title="내 PC 에이전트 상태"
          />
          <span className={`text-[11px] font-bold ${LABEL[agent].cls}`}>{LABEL[agent].text}</span>
          <span className="text-xs text-violet-400">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="border-t border-violet-100 px-3 py-2.5">
            <p className="text-[11px] font-bold text-slate-700">사용법</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
              <li>
                식당 상세 → <b className="text-orange-600">캐치테이블에서 예약</b>으로 원하는 날짜에
                직접 예약을 시도해요.
              </li>
              <li>
                자리가 없으면 <b className="text-violet-700">🎯 빈자리 감시</b>를 열고
                인원·날짜·시간을 고르거나,{' '}
                <span className="text-slate-500">“온지음 5월 토요일 저녁 2인 빈자리 나오면 예약해줘”</span>
                처럼 자연어로 입력해요.
              </li>
              <li>
                <b>내 PC</b>의 Claude가 취소표를 감시하다가 자리가 나면 예약해요. 결제 단계는 반드시
                직접 확인해요.
              </li>
            </ol>

            <div className="mt-2 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${DOT[agent]}`} />
              <span className={`text-[11px] font-semibold ${LABEL[agent].cls}`}>
                {agent === 'ready' && '이 PC는 준비 완료 — 바로 사용할 수 있어요'}
                {agent === 'partial' && '설정 미완 — 아래 명령을 다시 실행하면 Claude가 안내해요'}
                {agent === 'none' && '미설정 — 최초 1회 설치가 필요해요'}
                {agent === 'unknown' && '에이전트 확인 중...'}
              </span>
            </div>

            {agent !== 'ready' && (
              <>
                <button
                  onClick={copy}
                  className="mt-1.5 w-full rounded-lg bg-slate-800 px-2 py-1.5 text-left font-mono text-[10px] text-emerald-300"
                >
                  {copied ? '✅ 복사됨! PowerShell에 붙여넣으세요' : `${SETUP_CMD}  📋`}
                </button>
                <p className="mt-1 text-[10px] text-slate-400">
                  설치가 끝나면 이 상태등이 자동으로 <b className="text-emerald-600">초록불</b>로
                  바뀌어요.
                </p>
              </>
            )}

            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
              본인 PC·본인 캐치테이블 계정으로 실행 · 결제 단계는 직접 확인 · Claude 크롬 확장 필요
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
