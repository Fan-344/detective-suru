// 遊戲規則用到的型別。這個資料夾不引用任何畫面相關的東西。
// 內容（CaseContent）由外面用 src/content 的 loadCase 載入後傳進來。

import type { AppId, CardId, CharacterId, EventId, ImageRef, ItemId, Signal, ThreadId } from '../content/types';

/** 資料檔沒有定義、由規則決定的數字。集中在這裡，方便試玩後調整。 */
export interface Rules {
  /** 挑戰書每一欄最多能選幾筆紀錄 */
  maxPicksPerField: number;
  /** 某個結論隔多少電量沒有新進展，心聲就升一級。null 表示沿用 meta.battery.ladderTickEvery。 */
  voiceEvery: number | null;
  /**
   * true：有照片的 item 要點開照片才算看過（才進備忘錄、才會帶出疑點）。
   * false：讀到那則訊息或打開那個 App 就算看過，點開照片只是看細節。
   */
  imagesMustBeOpened: boolean;
}

export const DEFAULT_RULES: Rules = { maxPicksPerField: 2, voiceEvery: null, imagesMustBeOpened: true };

/** 遊戲開始後才出現在聊天室裡的訊息 */
export interface AppendedMessage {
  from: CharacterId;
  text: string[];
  image?: ImageRef;
  signal?: Signal;
}

export interface LinkResult {
  statement: ItemId;
  record: ItemId;
  result: 'match' | 'conflict' | 'none';
}

export interface GameState {
  /** cover：還沒送出掩護說法；play：進行中；ended：已進入結局 */
  phase: 'cover' | 'play' | 'ended';
  /** 可以是小數（背景 App 耗電不到 1），顯示時再取整 */
  battery: number;
  /** 累計用掉的電量 */
  spent: number;
  /** 看過的 item，依看到的先後 */
  seen: ItemId[];
  /** 已經出現在眼前、但照片還沒點開，所以還不算看過的 item（只在 imagesMustBeOpened 時會有） */
  unopened: ItemId[];
  /** 點開過照片的 item */
  viewedImages: ItemId[];
  ladder: Record<CharacterId, number>;
  flags: Record<string, boolean>;
  openedApps: AppId[];
  readThreads: ThreadId[];
  /** 已經做過定位的 App */
  located: AppId[];
  threads: Record<ThreadId, { appended: AppendedMessage[] }>;
  links: LinkResult[];
  /** 手上的牌 */
  cards: CardId[];
  /** 用過的「牌>對象」 */
  cardsUsed: string[];
  /** 已經發生過的事件。每個事件整場只發生一次。 */
  fired: EventId[];
  /** 排定稍後才出現的事件（at 是累計耗電到多少時出現） */
  scheduled: { event: EventId; at: number }[];
  /** 對方傳來、還等著玩家回覆的訊息 */
  awaiting: EventId[];
  /** 還開著的系統視窗。它不擋操作：玩家可以按按鈕、關掉，或放著去做別的事（等同關掉）。 */
  prompt: EventId | null;
  /** 視窗上的軟牆按鈕下一次用第幾句提醒 */
  promptHintIndex: number;
  /**
   * 這一段電量內，玩家最後一次對各角色造成的明確效果：
   * calm 是降級或明確不變（算被安撫），stirred 是升級。沒有紀錄表示這一段沒碰過他。
   */
  soothe: Record<CharacterId, 'calm' | 'stirred'>;
  /** 各角色上一次輪到自動推進時的累計耗電（不管那次有沒有升）。每個人各自計時。 */
  lastTick: Record<CharacterId, number>;
  /** 玩家理過的角色：回過他的訊息，或拿牌問過他。開局那句掩護說法不算。 */
  attended: CharacterId[];
  /** 各角色下一次通用反應用第幾種 */
  genericIndex: Record<CharacterId, number>;
  /** 各結論最後一次有新進展時的累計耗電 */
  voiceClock: Record<string, number>;
  /** 連續打開了幾個背景 App（中間沒有打開有線索的 App 或聊天室） */
  wanderStreak: number;
  /** 下一次亂逛提醒用第幾句 */
  wanderIndex: number;
  challengeTries: number;
  /** 結局 id */
  ended: string | null;
}

export type Action =
  | { type: 'sendCover' }
  | { type: 'openApp'; app: AppId }
  | { type: 'readThread'; thread: ThreadId }
  | { type: 'locate'; app: AppId }
  /** 點開某個 item 的照片。不耗電。 */
  | { type: 'viewImage'; item: ItemId }
  | { type: 'reply'; event: EventId; option: string }
  | { type: 'compare'; statement: ItemId; record: ItemId }
  | { type: 'test'; card: CardId; target: CharacterId }
  /** option 為 null 表示把視窗關掉（不理它） */
  | { type: 'answerPrompt'; option: string | null }
  | {
      type: 'submitChallenge';
      accused: CharacterId;
      /** 每一欄選的紀錄 */
      fields: Record<string, ItemId[]>;
      givenTo: CharacterId;
    };

/** 一個動作造成的結果，依發生順序。文字版和畫面版各自決定怎麼呈現。 */
export type Outcome =
  | { kind: 'battery'; cost: number; battery: number }
  | { kind: 'app'; app: AppId; first: boolean }
  | { kind: 'thread'; thread: ThreadId; first: boolean }
  | { kind: 'items'; items: ItemId[] }
  | { kind: 'image'; item: ItemId }
  | { kind: 'sent'; thread: ThreadId; text: string }
  | { kind: 'message'; thread: ThreadId; from: CharacterId; text: string[]; image?: ImageRef; signal?: Signal; event?: EventId }
  | { kind: 'link'; statement: ItemId; record: ItemId; result: 'match' | 'conflict' | 'none' }
  | { kind: 'cards'; cards: CardId[] }
  | { kind: 'prompt'; event: EventId }
  /** 按了視窗上的軟牆按鈕：只丟出一句提醒，視窗還在 */
  | { kind: 'promptHint'; event: EventId; text: string }
  /** 視窗關掉了。ignored 表示玩家沒有按任何按鈕（關掉或放著）。 */
  | { kind: 'promptClosed'; event: EventId; ignored: boolean }
  | { kind: 'ladder'; character: CharacterId; from: number; to: number; auto: boolean }
  | { kind: 'challengeRejected'; fields: string[]; cost: number }
  /** 在背景 App 裡逛太久的提醒。不擋操作、不扣電。 */
  | { kind: 'wander'; text: string }
  | { kind: 'ending'; ending: string }
  | { kind: 'invalid'; reason: string };

export interface StepResult {
  state: GameState;
  outcomes: Outcome[];
}

/** 目前能做的事。畫面和文字版照這個列選項，自動檢查照這個產生動作。 */
export interface Menu {
  cover: boolean;
  prompt: { event: EventId; options: string[] } | null;
  apps: { app: AppId; opened: boolean; cost: number }[];
  threads: { thread: ThreadId; read: boolean; cost: number }[];
  locate: { app: AppId; cost: number }[];
  /** 現在可以點開照片的 item（含已經點開過的） */
  images: ItemId[];
  replies: { event: EventId; thread: ThreadId; options: string[]; cost: number }[];
  tests: { card: CardId; thread: ThreadId | null; targets: CharacterId[]; cost: number }[];
  compare: { statements: ItemId[]; records: ItemId[] } | null;
  challenge: { suspects: CharacterId[]; fields: string[]; records: ItemId[]; recipients: CharacterId[]; maxPicks: number } | null;
}
