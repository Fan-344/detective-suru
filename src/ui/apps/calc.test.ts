import { describe, expect, it } from 'vitest';
import { CALC_START, calcPress, formatElapsed, formatTrackTime, monthCells, stepMonth } from './calc';

const run = (keys: string) => keys.split(' ').reduce(calcPress, CALC_START).display;

describe('計算機', () => {
  it('四則運算', () => {
    expect(run('1 2 + 3 =')).toBe('15');
    expect(run('9 - 1 0 =')).toBe('-1');
    expect(run('6 × 7 =')).toBe('42');
    expect(run('1 ÷ 4 =')).toBe('0.25');
  });
  it('連續運算、換運算鍵、小數誤差', () => {
    expect(run('2 + 3 × 4 =')).toBe('20');
    expect(run('2 + × 4 =')).toBe('8');
    expect(run('0 . 1 + 0 . 2 =')).toBe('0.3');
  });
  it('正負號、百分比、清除、除以零', () => {
    expect(run('5 ±')).toBe('-5');
    expect(run('5 0 %')).toBe('0.5');
    expect(run('5 + 5 AC')).toBe('0');
    expect(run('5 ÷ 0 =')).toBe('錯誤');
    expect(run('5 ÷ 0 = 7')).toBe('7');
  });
});

describe('行事曆與時間格式', () => {
  it('2026 年 11 月從星期日開始，共 30 天', () => {
    const cells = monthCells(2026, 11);
    expect(cells[0]).toBe(1);
    expect(cells.filter(Boolean).length).toBe(30);
    expect(cells.length % 7).toBe(0);
  });
  it('跨年換月', () => {
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it('碼錶與歌曲時間', () => {
    expect(formatElapsed(0)).toBe('00:00.00');
    expect(formatElapsed(83450)).toBe('01:23.45');
    expect(formatTrackTime(204)).toBe('3:24');
  });
});
