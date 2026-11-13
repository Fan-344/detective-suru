import type { AppDef, ChatThread } from './types';

export function clampBattery(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type BatteryTone = 'ok' | 'low' | 'critical';

/** 只決定電量顯示的顏色，不是遊戲規則 */
export function batteryTone(value: number): BatteryTone {
  const v = clampBattery(value);
  if (v <= 10) return 'critical';
  if (v <= 20) return 'low';
  return 'ok';
}

export function unreadLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
}

export function totalUnread(threads: ChatThread[]): number {
  return threads.reduce((sum, t) => sum + Math.max(0, t.unread), 0);
}

export function appUnread(app: AppDef, threads: ChatThread[]): number {
  return app.layout === 'chat' ? totalUnread(threads) : (app.unread ?? 0);
}

/** 聊天列表顯示的最後一句 */
export function lastLine(thread: ChatThread): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return '';
  if (last.text) return last.text;
  return last.image ? `［${last.image.description}］` : '';
}

/** 把連續同一天的訊息分成一組，供聊天室顯示日期分隔線 */
export function groupByDay<T extends { day: string }>(items: T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    if (current && current.day === item.day) current.items.push(item);
    else groups.push({ day: item.day, items: [item] });
  }
  return groups;
}

/**
 * 緊張程度 0 到 1，只用來決定畫面氣氛（飽和度、暗角、脈動），不是遊戲規則。
 * 外觀框架先用「電量掉了多少」來算；步驟三可以改由 engine 提供。
 */
export function tensionFromBattery(battery: number, start: number): number {
  if (!(start > 0)) return 0;
  const t = 1 - clampBattery(battery) / start;
  return Math.max(0, Math.min(1, t));
}

export type TensionStage = 0 | 1 | 2 | 3;

/** 四個階段：正常、有點不對、明顯不對、快撐不住 */
export function tensionStage(tension: number): TensionStage {
  if (tension >= 0.75) return 3;
  if (tension >= 0.5) return 2;
  if (tension >= 0.25) return 1;
  return 0;
}

/** 畫面上實際用的強度：前段拉高，讓變化早一點看得出來 */
export function tensionVisual(tension: number): number {
  const t = Math.max(0, Math.min(1, tension));
  return Math.pow(t, 0.6);
}
