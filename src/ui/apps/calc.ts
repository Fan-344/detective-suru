// 計算機的運算邏輯。這是手機裡一個背景 App 的功能，跟遊戲規則無關。

export type CalcOp = '+' | '-' | '×' | '÷';

export interface CalcState {
  display: string;
  acc: number | null;
  op: CalcOp | null;
  /** 下一個數字鍵會開始輸入新的數字 */
  fresh: boolean;
}

export const CALC_START: CalcState = { display: '0', acc: null, op: null, fresh: true };

function apply(a: number, b: number, op: CalcOp): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '×') return a * b;
  return b === 0 ? Number.NaN : a / b;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '錯誤';
  const rounded = Number(n.toPrecision(10));
  const text = String(rounded);
  return text.length > 11 ? rounded.toExponential(5) : text;
}

export function calcPress(state: CalcState, key: string): CalcState {
  if (key === 'AC') return CALC_START;
  const current = Number(state.display);
  const broken = !Number.isFinite(current);

  if (/^[0-9]$/.test(key)) {
    if (state.fresh || broken) return { ...state, display: key, fresh: false };
    if (state.display.replace(/[-.]/g, '').length >= 9) return state;
    return { ...state, display: state.display === '0' ? key : state.display + key };
  }
  if (key === '.') {
    if (state.fresh || broken) return { ...state, display: '0.', fresh: false };
    return state.display.includes('.') ? state : { ...state, display: `${state.display}.` };
  }
  if (broken) return state;
  if (key === '±') return { ...state, display: formatNumber(-current) };
  if (key === '%') return { ...state, display: formatNumber(current / 100), fresh: true };

  if (key === '+' || key === '-' || key === '×' || key === '÷') {
    // 連續按運算鍵只換運算，不重複計算
    if (state.op && state.fresh && state.acc !== null) return { ...state, op: key };
    const acc = state.op && state.acc !== null ? apply(state.acc, current, state.op) : current;
    return { display: formatNumber(acc), acc, op: key, fresh: true };
  }
  if (key === '=') {
    if (!state.op || state.acc === null) return { ...state, fresh: true };
    return { display: formatNumber(apply(state.acc, current, state.op)), acc: null, op: null, fresh: true };
  }
  return state;
}

/** 某年某月的月曆格子：前面補空格，讓 1 號落在正確的星期 */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(m)}:${two(s)}.${two(cs)}`;
}

export function formatTrackTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
