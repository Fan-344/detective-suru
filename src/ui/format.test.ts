import { describe, expect, it } from 'vitest';
import {
  batteryTone,
  clampBattery,
  groupByDay,
  lastLine,
  tensionFromBattery,
  tensionStage,
  tensionVisual,
  totalUnread,
  unreadLabel,
} from './format';
import type { ChatThread } from './types';

const thread = (over: Partial<ChatThread>): ChatThread => ({
  id: 't',
  title: 't',
  group: false,
  members: [],
  messages: [],
  unread: 0,
  ...over,
});

describe('format', () => {
  it('電量限制在 0 到 100', () => {
    expect(clampBattery(64)).toBe(64);
    expect(clampBattery(-5)).toBe(0);
    expect(clampBattery(140)).toBe(100);
    expect(clampBattery(Number.NaN)).toBe(0);
  });

  it('電量顏色分三段', () => {
    expect(batteryTone(64)).toBe('ok');
    expect(batteryTone(20)).toBe('low');
    expect(batteryTone(10)).toBe('critical');
  });

  it('未讀數：零不顯示，超過 99 顯示 99+', () => {
    expect(unreadLabel(0)).toBe('');
    expect(unreadLabel(5)).toBe('5');
    expect(unreadLabel(120)).toBe('99+');
  });

  it('聊天未讀數加總', () => {
    expect(totalUnread([thread({ unread: 31 }), thread({ unread: 5 }), thread({ unread: 0 })])).toBe(36);
  });

  it('最後一句：文字或圖片描述', () => {
    expect(lastLine(thread({}))).toBe('');
    expect(lastLine(thread({ messages: [{ id: '1', from: 'a', day: 'd', time: 't', text: '嗨' }] }))).toBe('嗨');
    expect(
      lastLine(thread({ messages: [{ id: '1', from: 'a', day: 'd', time: 't', image: { tone: 0, description: '照片' } }] })),
    ).toBe('［照片］');
  });

  it('依日期分組', () => {
    const groups = groupByDay([{ day: 'A' }, { day: 'A' }, { day: 'B' }]);
    expect(groups.map((g) => [g.day, g.items.length])).toEqual([['A', 2], ['B', 1]]);
  });

  it('緊張程度隨電量下降而升高，分四個階段', () => {
    expect(tensionFromBattery(64, 64)).toBe(0);
    expect(tensionFromBattery(32, 64)).toBe(0.5);
    expect(tensionFromBattery(0, 64)).toBe(1);
    expect(tensionFromBattery(80, 64)).toBe(0);
    expect(tensionFromBattery(10, 0)).toBe(0);
    expect([0, 0.3, 0.6, 0.9].map(tensionStage)).toEqual([0, 1, 2, 3]);
  });

  it('畫面強度在前段就拉高，頭尾不變', () => {
    expect(tensionVisual(0)).toBe(0);
    expect(tensionVisual(1)).toBe(1);
    expect(tensionVisual(0.25)).toBeGreaterThan(0.4);
  });
});
