import type { GameState } from '../../engine';
import type { GameUi } from './view';

// 自動存檔：每一步之後把進度寫進瀏覽器，重新整理或被手機瀏覽器回收之後可以接著玩。
// 瀏覽器的儲存空間可能不能用（無痕模式、空間滿、被關掉），所以讀寫全部包起來，失敗就當作沒有存檔。

/** 存檔格式本身改了（多存或少存東西）就把這個數字加一，舊存檔會直接作廢 */
const FORMAT = 4;

export interface Saved {
  game: GameState;
  ui: GameUi;
  introDone: boolean;
  /** 開局還沒送出那句話之前，已經捲進畫面的舊訊息 */
  coverSeen: string[];
}

const keyOf = (caseId: string) => 'detective-suru:save:' + caseId;

/**
 * 案件資料的指紋。資料檔只要改過任何一個字，指紋就不同，
 * 舊存檔對不上新資料時就不讀，直接從頭開始，免得讀進來變成怪狀況。
 */
export function fingerprint(content: unknown): string {
  const text = JSON.stringify(content);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return FORMAT + ':' + text.length + ':' + (h >>> 0).toString(36);
}

export function loadSave(caseId: string, version: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(keyOf(caseId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { version?: string; saved?: Saved };
    const s = data.saved;
    if (data.version !== version || !s || typeof s.game !== 'object' || !s.game || typeof s.ui !== 'object' || !s.ui) return null;
    return { game: s.game, ui: s.ui, introDone: !!s.introDone, coverSeen: Array.isArray(s.coverSeen) ? s.coverSeen : [] };
  } catch {
    return null;
  }
}

export function writeSave(caseId: string, version: string, saved: Saved): void {
  try {
    window.localStorage.setItem(keyOf(caseId), JSON.stringify({ version, saved }));
  } catch {
    // 存不進去就算了，遊戲照常進行
  }
}

export function clearSave(caseId: string): void {
  try {
    window.localStorage.removeItem(keyOf(caseId));
  } catch {
    // 同上
  }
}
