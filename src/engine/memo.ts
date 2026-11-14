// 從遊戲狀態算出助理 App 要顯示的東西：備忘錄兩欄、時間軸、到達的結論。
// 只讀狀態，不改狀態。

import type { CaseContent, CharacterId, Conclusion, Item, ItemId, When } from '../content/types';
import { parseWhen } from '../content/when';
import type { GameState } from './types';

export interface Memo {
  records: Item[];
  statements: Item[];
  /** 發生過的事：一開局就有的列（meta.timelineStart），加上看過的 item 寫在 timeline 欄位裡的每一列，依故事內的時間排序 */
  timeline: TimelineRow[];
}

/** 時間軸上的一列。一筆 item 可以有好幾列 */
export interface TimelineRow {
  /** 這一列自己的 id（item id 加第幾列；開局就有的列是 start#1 這類），畫面拿來當 key */
  id: string;
  /** 這一列出自哪一筆 item。開局就有的列（開場就告訴玩家的事）沒有 */
  item?: ItemId;
  /** 只拿來排先後，不給玩家看 */
  when: When;
  /** 畫面上顯示的大概時段，例如「週六晚上」。同一個 label 的列會排在一起 */
  label: string;
  text: string;
  /** 這一列講的是誰的行蹤；講東西（不是人）的列沒有 */
  who?: CharacterId;
}

export function memo(content: CaseContent, state: GameState): Memo {
  const byId = new Map(content.items.map((i) => [i.id, i]));
  // 跟案情無關的生活內容看得到，但不進備忘錄
  const seen = state.seen.flatMap((id) => byId.get(id) ?? []).filter((i) => !i.flavor);
  // 每一列用自己的時間排，不看 item 本身的 when；時間讀不懂的排最後
  const fromStart = (content.meta.timelineStart ?? []).map((row, i): TimelineRow => ({ id: 'start#' + (i + 1), when: row.when, label: row.label, text: row.text, ...(row.who ? { who: row.who } : {}) }));
  const fromItems = seen
    .flatMap((item) => (item.timeline ?? []).map((row, i): TimelineRow => ({ id: item.id + '#' + (i + 1), item: item.id, when: row.when, label: row.label, text: row.text, ...(row.who ? { who: row.who } : {}) })));
  // 開局就有的列不看有沒有看過；時間一樣時排在前面
  const timeline = [...fromStart, ...fromItems]
    .map((row) => ({ row, key: parseWhen(row.when, content.meta.dayOrder)?.sort ?? Infinity }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.row);
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
