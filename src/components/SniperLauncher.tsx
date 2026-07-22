'use client';

import { useState } from 'react';

// 캐치테이블 빈자리 감시 — 개인 PC의 모심 에이전트(localhost 브리지)를 통해
// 본인 PC·본인 계정으로 Claude Code(catchtable-sniper 스킬)를 실행한다.
export const AGENT = 'http://localhost:43110';
export const SETUP_CMD = 'irm https://moim-blush.vercel.app/setup.ps1 | iex';

type AgentStatus = { agent: boolean; claude: boolean; skill: boolean };

export default function SniperLauncher({
  name,
  date,
  time,
  people,
}: {
  name: string;
  date: string;
  time: string;
  people: number;
}) {
  const [state, setState] = useState<'idle' | 'checking' | 'launched' | 'setup'>('idle');
  const [status, setStatus] = useState<AgentStatus>({ agent: false, claude: false, skill: false });
  const [copied, setCopied] = useState(false);

  const launch = async () => {
    setState('checking');
    try {
      const res = await fetch(`${AGENT}/status`, { signal: AbortSignal.timeout(2500) });
      const s = (await res.json()) as Omit<AgentStatus, 'agent'>;
      setStatus({ agent: true, ...s });
      if (!s.claude || !s.skill) {
        setState('setup');
        return;
      }
      await fetch(`${AGENT}/snipe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, date, time, people }),
      });
      setState('launched');
    } catch {
      setStatus({ agent: false, claude: false, skill: false });
      setState('setup');
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(SETUP_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (state === 'launched') {
    return (
      <div className="mt-2 rounded-xl bg-violet-50 p-3 text-center">
        <p className="text-sm font-bold text-violet-700">🎯 PC에서 감시를 시작했어요</p>
        <p className="mt-1 text-[11px] leading-relaxed text-violet-600">
          방금 열린 터미널에서 Claude가 캐치테이블 빈자리를 감시합니다.
          <br />
          결제가 필요한 단계에서는 반드시 직접 확인을 요청해요.
        </p>
        <button onClick={() => setState('idle')} className="mt-1 text-[11px] text-violet-500 underline">
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={launch}
        disabled={state === 'checking'}
        className="w-full rounded-lg bg-violet-600/10 py-2 text-center text-xs font-bold text-violet-700 disabled:opacity-60"
      >
        {state === 'checking' ? '내 PC 에이전트 확인 중...' : '🎯 Claude로 빈자리 감시 (내 PC에서 실행)'}
      </button>

      {state === 'setup' && (
        <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-xs font-bold text-slate-700">PC 에이전트 설정이 필요해요</p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-slate-600">
            <CheckRow ok={status.agent} label="모심 PC 에이전트 실행" />
            <CheckRow ok={status.claude} label="Claude Code 설치" />
            <CheckRow ok={status.skill} label="catchtable-sniper 스킬 설치" />
            <li className="flex items-center gap-1.5">
              <span>🔗</span>
              <a href="https://claude.ai/chrome" target="_blank" rel="noreferrer" className="underline">
                Claude 크롬 확장
              </a>
              <span className="text-slate-400">· 캐치테이블 로그인 (직접 확인)</span>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            PC의 PowerShell에 아래 한 줄을 붙여넣으면 자동 설치됩니다:
          </p>
          <button
            onClick={copy}
            className="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1.5 text-left font-mono text-[10px] text-emerald-300"
          >
            {copied ? '✅ 복사됨! PowerShell에 붙여넣으세요' : `${SETUP_CMD}  📋`}
          </button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
            감시·예약은 본인 PC의 로그인된 크롬에서 본인 계정으로 실행됩니다. 모바일에서는 실행할 수
            없어요 — PC 브라우저로 모심을 열어 눌러주세요.
          </p>
        </div>
      )}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span>{ok ? '✅' : '❌'}</span>
      <span className={ok ? '' : 'font-semibold text-rose-600'}>{label}</span>
    </li>
  );
}
