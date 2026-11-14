// 遊戲規則用到的型別。這個資料夾不引用任何畫面相關的東西。
// 內容（CaseContent）由外面用 src/content 的 loadCase 載入後傳進來。

import type { AppId, CardId, CharacterId, EventId, ImageRef, ItemId, Signal, ThreadId } from '../content/types';

/** 資料檔沒有定義、由規則決定的數字。集中在這裡，方便試玩後調整。 */
export interface Rules {
  /** 挑戰書每一欄最多能選幾筆紀錄 */
  maxPicksPerField: number;
  /**
   * true：有照片的 item 要點開照片才算看過（才進備忘錄、才會帶出疑點）。
   * false：讀到那則訊息或打開那個 App 就算看過，點開照片只是看細節。
   */
  imagesMustBeOpened: boolean;
}

export const DEFAULT_RULES: Rules = { maxPicksPerField: 2, imagesMustBeOpened: true };

/** 遊戲開始後才出現在聊天室裡的訊息 */
export interface AppendedMessage {
  from: CharacterId;
  text: string[];
  image?: ImageRef;
  signal?: Signal;
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
  /** 手上的牌（玩家面前叫疑點） */
  cards: CardId[];
  /**
   * 助理在意、但還沒成為疑點的地方：條件成立了，要玩家指出「哪裡有問題」才會變成疑點。
   * tried 是已經指錯過的選項。
   */
  concerns: { card: CardId; tried: string[] }[];
  /** 每個疑點（含還在「在意的地方」階段的）已經按過幾次「再想想」，也就是給到第幾句 */
  hints: Record<CardId, number>;
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
  /** 連續打開了幾個背景 App（中間沒有打開有線索的 App 或聊天室） */
  wanderStreak: number;
  /** 下一次亂逛提醒用第幾句 */
  wanderIndex: number;
  /** 助理 App 裡有玩家還沒看過的新東西（畫面上是圖示的紅點） */
  assistantUnread: boolean;
  /** 玩家現在停在哪個聊天室（打開 App、定位會離開；看照片、比對這類不會）。判斷「已讀」用。 */
  currentThread: ThreadId | null;
  /** 玩家已經看到、還沒回的訊息（事件 id） */
  readAwaiting: EventId[];
  /**
   * 已讀不回的計數：玩家看到某人等回的訊息、沒回就離開後，又做了幾個動作。
   * count 是 -1 表示還沒離開那個聊天室；nudged 表示他已經追問過一次。
   */
  ignoring: Record<CharacterId, { count: number; nudged: boolean }>;
  /** 已經因為已讀不回讓對方升過一級的訊息。同一則最多只罰一次，之後不再計數。 */
  ignoredOut: EventId[];
  /** 各角色下一次追問用第幾句 */
  nudgeIndex: Record<CharacterId, number>;
  challengeTries: number;
  /**
   * 指認兇手一題一題問的進度（資料有寫 challenge.sequence 時才用）。
   * step 是下一題在 sequence 裡的位置（等於長度表示都答完了，只剩選交給誰）；
   * tried 是每一題已經答錯過的紀錄。中途離開不會清掉。
   */
  accusation: { step: number; tried: Record<string, ItemId[]> };
  /** 結局 id */
  ended: string | null;
}

export type Action =
  /**
   * 送出開局那句掩護說法（在群組裡）。visible 跟 readThread 的一樣：送出時畫面上看得到的那幾則舊訊息，
   * 只有它們算看過，其餘的要往上滑（seeMessages）。沒給表示整串都看到了（文字試玩）。
   */
  | { type: 'sendCover'; visible?: ItemId[] }
  | { type: 'openApp'; app: AppId }
  /**
   * 打開聊天室。visible 是一打開就在畫面上的那幾則舊訊息（訊息上的 item id），只有它們算看過；
   * 其餘的要玩家往上滑到（seeMessages）才算。沒給 visible 表示整串都看到了（文字試玩是整串印出來的）。
   * 開局之後才進來的訊息不受影響，出現就算看過。
   */
  | { type: 'readThread'; thread: ThreadId; visible?: ItemId[] }
  /** 往上滑，這幾則舊訊息捲進畫面了。不耗電。只收這個聊天室舊訊息上的 item，其餘的會被忽略。 */
  | { type: 'seeMessages'; thread: ThreadId; items: ItemId[] }
  | { type: 'locate'; app: AppId }
  /** 點開某個 item 的照片。不耗電。 */
  | { type: 'viewImage'; item: ItemId }
  /** 打開某個人的個人頁面。不耗電。他的自介如果是一筆說法（Character.bioItem），這時才算看過。 */
  | { type: 'viewProfile'; character: CharacterId }
  | { type: 'reply'; event: EventId; option: string }
  /** 對某個在意的地方，指出哪裡有問題 */
  | { type: 'spot'; card: CardId; option: string }
  | { type: 'test'; card: CardId; target: CharacterId }
  /** 再想想：對手上的某個疑點（或還在「在意的地方」階段的）要下一句提示 */
  | { type: 'think'; card: CardId }
  /** option 為 null 表示把視窗關掉（不理它） */
  | { type: 'answerPrompt'; option: string | null }
  | {
      type: 'submitChallenge';
      accused: CharacterId;
      /** 每一欄選的紀錄 */
      fields: Record<string, ItemId[]>;
      givenTo: CharacterId;
    }
  /** 一題一題問的時候，回答目前這一題。紀錄題給紀錄的 id，「是誰」那一題給人的 id。 */
  | { type: 'answerChallenge'; answer: string }
  /** 一題一題問、全部答完之後，選交給誰 */
  | { type: 'handOver'; givenTo: CharacterId };

/** 一個動作造成的結果，依發生順序。文字版和畫面版各自決定怎麼呈現。 */
export type Outcome =
  | { kind: 'battery'; cost: number; battery: number }
  | { kind: 'app'; app: AppId; first: boolean }
  | { kind: 'thread'; thread: ThreadId; first: boolean }
  | { kind: 'items'; items: ItemId[] }
  | { kind: 'image'; item: ItemId }
  | { kind: 'profile'; character: CharacterId }
  | { kind: 'sent'; thread: ThreadId; text: string }
  | { kind: 'message'; thread: ThreadId; from: CharacterId; text: string[]; image?: ImageRef; signal?: Signal; event?: EventId }
  /** found：玩家自己比對出來的；noted：看到某些東西後助理自己記下的（不主動告訴玩家是什麼） */
  | { kind: 'cards'; cards: CardId[]; via: 'found' | 'noted' }
  /** 助理 App 有新東西了。只是一個記號，不說內容；到玩家打開助理 App 之前只出現一次。 */
  | { kind: 'assistantUnread' }
  /** 指出哪裡有問題的結果。指對了那個疑點就成立（另有一筆 cards）；指錯會扣電。 */
  | { kind: 'spot'; card: CardId; option: string; right: boolean }
  /** 按了「再想想」得到的那一句。index 從 0 起算；more 表示後面還有沒有下一句 */
  | { kind: 'hint'; card: CardId; index: number; text: string; more: boolean }
  | { kind: 'prompt'; event: EventId }
  /** 按了視窗上的軟牆按鈕：只丟出一句提醒，視窗還在 */
  | { kind: 'promptHint'; event: EventId; text: string }
  /** 視窗關掉了。ignored 表示玩家沒有按任何按鈕（關掉或放著）。 */
  | { kind: 'promptClosed'; event: EventId; ignored: boolean }
  | { kind: 'ladder'; character: CharacterId; from: number; to: number; auto: boolean }
  | { kind: 'challengeRejected'; fields: string[]; cost: number }
  /** 一題一題問時，這一題答得對不對。question 是欄位 id 或 "who"；答錯的紀錄題會扣 cost。 */
  | { kind: 'challengeAnswer'; question: string; answer: string; right: boolean; cost: number }
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
  /** unseen：這個聊天室的舊訊息裡，玩家還沒滑到的那幾則（訊息上的 item id）。還沒打開過的聊天室是整串 */
  threads: { thread: ThreadId; read: boolean; cost: number; unseen: ItemId[] }[];
  locate: { app: AppId; cost: number }[];
  /** 現在可以點開照片的 item（含已經點開過的） */
  images: ItemId[];
  assistantUnread: boolean;
  /** 個人頁面上有東西可看的人（自介是一筆說法的），而且玩家已經讀過有他在的聊天室。seen 表示那筆已經看過 */
  profiles: { character: CharacterId; item: ItemId; seen: boolean }[];
  /** 在意的地方，以及還能指的選項 */
  concerns: { card: CardId; item: ItemId; options: string[]; missCost: number }[];
  replies: { event: EventId; thread: ThreadId; options: string[]; cost: number }[];
  tests: { card: CardId; thread: ThreadId | null; targets: CharacterId[]; cost: number }[];
  /**
   * 再想想：手上每個疑點（concern 為 true 的是還在「在意的地方」階段的）已經給過的句子、還有沒有下一句。
   * thinkOnly 是只能自己想、不能拿去問人的疑點。cost 是按一次耗的電。
   */
  thoughts: { card: CardId; concern: boolean; thinkOnly: boolean; shown: string[]; more: boolean; cost: number }[];
  challenge: {
    suspects: CharacterId[];
    fields: string[];
    records: ItemId[];
    recipients: CharacterId[];
    maxPicks: number;
    /**
     * 一題一題問的時候，現在問到哪一題；資料沒寫 sequence 時是 null（照舊一次填完）。
     * question 是欄位 id 或 "who"，null 表示都答完了、只剩選交給誰。
     * options 是這一題還能選的東西（紀錄、人，或交付對象）。
     */
    ask: { index: number; total: number; question: string | null; options: string[]; retryCost: number } | null;
  } | null;
}
