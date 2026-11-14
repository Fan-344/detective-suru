// 從遊戲狀態算出助理 App 要顯示的東西：備忘錄兩欄、時間軸、到達的結論、心聲。
// 只讀狀態，不改狀態。

import type { CaseContent, Conclusion, Item, VoiceLine } from '../content/types';
import { parseWhen } from '../content/when';
import type { Engine } from './engine';
import type { GameState } from './types';

export interface Memo {
  records: Item[];
  statements: Item[];
  /** 有時間的 item，依故事內的時間排序 */
  timeline: Item[];
}

export function memo(content: CaseContent, state: GameState): Memo {
  const byId = new Map(content.items.map((i) => [i.id, i]));
  // 跟案情無關的生活內容看得到，但不進備忘錄
  const seen = state.seen.flatMap((id) => byId.get(id) ?? []).filter((i) => !i.flavor);
  const sortKey = (i: Item) => (i.when ? (parseWhen(i.when, content.meta.dayOrder)?.sort ?? null) : null);
  const timeline = seen
    .map((item) => ({ item, key: sortKey(item) }))
    .filter((x): x is { item: Item; key: number } => x.key !== null)
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
  return {
    records: seen.filter((i) => i.kind === 'record'),
    statements: seen.filter((i) => i.kind === 'statement'),
    timeline,
  };
}

/** 這個結論走通了哪幾條路（路上的 item 全部看過） */
export function routesReached(conclusion: Conclusion, state: GameState): number[] {
  return conclusion.routes.flatMap((route, i) => (route.every((id) => state.seen.includes(id)) ? [i] : []));
}

export function reachedConclusions(content: CaseContent, state: GameState): string[] {
  return content.conclusions.filter((c) => routesReached(c, state).length > 0).map((c) => c.id);
}

/**
 * 現在該出現的心聲。
 * - 綁結論的：結論還沒到達才出現；每隔一段電量沒有新進展升一級，顯示目前那一級
 * - 沒綁結論的：條件成立就出現
 */
export function voice(engine: Engine, state: GameState): VoiceLine[] {
  const { content, rules } = engine;
  const every = rules.voiceEvery ?? content.meta.battery.voiceTickEvery ?? content.meta.battery.ladderTickEvery;
  const reached = new Set(reachedConclusions(content, state));
  const lines: VoiceLine[] = [];
  for (const line of content.voice) {
    if (!engine.holds(state, line.when)) continue;
    if (!line.conclusion) {
      lines.push(line);
      continue;
    }
    if (reached.has(line.conclusion)) continue;
    const idle = state.spent - (state.voiceClock[line.conclusion] ?? 0);
    const level = Math.min(3, 1 + Math.floor(idle / every));
    if ((line.level ?? 1) === level) lines.push(line);
  }
  return lines;
}
