import { strFromU8, unzipSync } from 'fflate';

// 법인카드 엑셀 브라우저 파싱. 두 가지 형식을 자동 감지한다.
//  1) SAP 내보내기(20260722사용원가): 헤더 1행, D 증빙일 / J 금액 / K 품목텍스트 / M 계정번호(카드) — 가맹점명 없음
//  2) 미정산내역(동적 리스트 조회): 헤더 행에 '카드번호'·'사용일자'·'금액' 포함, 가맹점명(카드회원)·업태·계정명 존재

export interface Tx {
  date: string; // YYYYMMDD
  amount: number;
  card: string;
  account: string;
  synth: boolean;
  // ↓ 미정산내역 형식에만 존재 (가맹점 매칭 → DB 자동 보강용)
  merchant?: string; // 가맹점명
  uptae?: string; // 업태
  region?: string; // 가맹점 소재지
  time?: string; // 사용시간 HH:MM:SS
}

// 카드 소지자 실명 마스킹 ("현대법인카드_이충환" → "현대법인카드_이*환")
export function maskCard(card: string): string {
  return card.replace(/_(\S+)$/, (_, name: string) =>
    name.length >= 2 ? `_${name[0]}${'*'.repeat(name.length - 2)}${name.slice(-1)}` : `_${name}`
  );
}

export function maskName(name: string): string {
  return name.length >= 2 ? `${name[0]}${'*'.repeat(name.length - 2)}${name.slice(-1)}` : name;
}

interface Row {
  num: string;
  cells: Record<string, string>;
}

// XML 문자 참조 해제 (&#54620; → 한). 일부 내보내기(v4 미정산내역)는 한글을 전부 숫자 참조로 기록
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readRows(buf: ArrayBuffer): Row[] {
  const files = unzipSync(new Uint8Array(buf));

  const sstFile = files['xl/sharedStrings.xml'];
  const sst: string[] = sstFile
    ? [...strFromU8(sstFile).matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
        decodeXml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))
      )
    : [];

  const sheetName = Object.keys(files).find((k) => /^xl\/worksheets\/sheet1?\.xml$/.test(k));
  if (!sheetName) throw new Error('워크시트를 찾을 수 없습니다');
  const sheet = strFromU8(files[sheetName]);

  const rows: Row[] = [];
  for (const rm of sheet.matchAll(/<row [^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const cells: Record<string, string> = {};
    // 셀 값 3형태 지원: t="s"(sharedStrings 인덱스) / t="inlineStr"(<is><t>…) / 숫자(<v>…)
    for (const cm of rm[2].matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const [, attrs, inner = ''] = cm;
      const col = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!col) continue;
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      let val: string;
      if (type === 'inlineStr') {
        val = decodeXml([...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''));
      } else {
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? '';
        val = type === 's' ? (sst[Number(v)] ?? '') : decodeXml(v);
      }
      cells[col] = val;
    }
    rows.push({ num: rm[1], cells });
  }
  return rows;
}

// 미정산내역 형식: 헤더 행을 찾아 컬럼명 → 열 문자 매핑 (같은 컬럼명이 중복되면 앞의 열 사용)
function findSettlementHeader(rows: Row[]): { index: number; col: Record<string, string> } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = Object.values(rows[i].cells);
    if (vals.includes('카드번호') && vals.includes('사용일자') && vals.includes('금액')) {
      const col: Record<string, string> = {};
      for (const [c, name] of Object.entries(rows[i].cells)) {
        if (name && !(name in col)) col[name] = c;
      }
      return { index: i, col };
    }
  }
  return null;
}

function parseSettlementRows(rows: Row[], headerIdx: number, col: Record<string, string>): Tx[] {
  const get = (cells: Record<string, string>, name: string) => String(cells[col[name]] ?? '').trim();
  const txs: Tx[] = [];
  for (const { cells } of rows.slice(headerIdx + 1)) {
    const date = get(cells, '사용일자').replace(/\D/g, '').slice(0, 8); // 2020.03.05 → 20200305
    const amount = Number(get(cells, '금액').replace(/[^\d]/g, ''));
    if (date.length !== 8 || !(amount > 0)) continue;
    if (/취소|거절|반려/.test(get(cells, '상태'))) continue;
    const holder = maskName(get(cells, '관리자'));
    const company = get(cells, '카드회사') || '법인카드';
    txs.push({
      date,
      amount,
      card: holder ? `${company}_${holder}` : company,
      account: get(cells, '계정명').replace(/-+$/, '') || '미분류',
      synth: false,
      merchant: get(cells, '카드회원'), // 이 형식에서 '카드회원' 열이 가맹점명
      uptae: get(cells, '업태'),
      region: get(cells, '가맹점주'),
      time: get(cells, '사용시간'),
    });
  }
  return txs;
}

export function parseCardXlsx(buf: ArrayBuffer): Tx[] {
  const rows = readRows(buf);

  // 형식 감지: 미정산내역(동적 리스트) 헤더가 있으면 그쪽 규칙으로
  const settle = findSettlementHeader(rows);
  if (settle) {
    const txs = parseSettlementRows(rows, settle.index, settle.col);
    if (txs.length === 0) throw new Error('유효한 거래 행이 없습니다 (형식을 확인해 주세요)');
    return txs;
  }

  // SAP 형식(기존): 1행 헤더, 고정 열
  const txs: Tx[] = [];
  for (const { num, cells } of rows) {
    if (num === '1') continue; // header
    const date = String(cells.D ?? '').trim().replace(/\.0$/, '');
    const amount = Number(String(cells.J ?? '0').replace(/[^\d]/g, ''));
    if (!date || !(amount > 0)) continue;
    txs.push({
      date,
      amount,
      card: maskCard(String(cells.M ?? '').trim()),
      account: '의욕관리비',
      synth: false,
    });
  }
  if (txs.length === 0) throw new Error('유효한 거래 행이 없습니다 (형식을 확인해 주세요)');
  return txs;
}
