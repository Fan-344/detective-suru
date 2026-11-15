// 遊戲規則用到的型別。這個資料夾不引用任何畫面相關的東西。
// 內容（CaseContent）由外面用 src/content 的 loadCase 載入後傳進來。

import type { AppId, CardId, CharacterId, EventId, ImageRef, ItemId, Signal, ThreadId } from '../content/types';

/** 資料檔沒有定義、由規則決定的數字。集中在這裡，方便試玩後調整。 */
export interface Rules {
  /**
   * true：有照片的 item 要點開照片才算看過（才進備忘錄、才會帶出疑點）。
   * false：讀到那則訊息或打開那個 App 就算看過，點開照片只是看細節。
   */
  imagesMustBeOpened: boolean;
}

export const DEFAULT_RULES: Rules = { imagesMustBeOpened: true };

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
  /** 正在響的來電。響著的時候玩家只能掛斷或讓它響完，別的事都不能做。 */
  call: { event: EventId; from: CharacterId } | null;
  /** 正在響的那通還沒結束時又有人打來，排在後面等 */
  callQueue: EventId[];
  /** 沒接到（放著響完）的來電，依先後。電話 App 用來列未接來電。 */
  missedCalls: { event: EventId; from: CharacterId }[];
  /** 連環來電：還會再打來的那幾個來電事件，各自在上一通之後又過了幾個動作（數到 repeat.everyActions 就再打） */
  callRepeat: Record<EventId, number>;
  challengeTries: number;
  /**
   * 指認兇手一題一題問的進度。
   * step 是下一題在 sequence 裡的位置（等於長度表示都答完了，只剩選交給誰）；
   * tried 是每一題已經選錯過的疑點。中途離開不會清掉。
   */
  accusation: {
    step: number;
    tried: Record<string, ItemId[]>;
    /**
     * 一次交卷（資料有寫 challenge.submitAll）時，每一格現在放的東西：
     * 欄位 id → 疑點 id，"who" → 人的 id。沒填的格子不在裡面。交卷被退回後內容保留。
     */
    slots: Record<string, string>;
  };
  /** 結局 id */
  ended: string | null;
}

export type Action =
  /**
   * 送出開局那句掩護說法（在群組裡）。visible 跟 readThread 的一樣：送出時畫面上看得到的那幾則舊訊息，
   * 只有它們算看過，其餘的要往上滑（seeMessages）。沒給表示整串都看到了（文字試玩）。
   */
  | { type: 'sendCover'; visible?: ItemId[] }
  /**
   * 打開 App。visible 只對「滑到就算看過」的 App（AppDef.seeOnScroll，例如動態牆）有意義：
   * 一打開就在畫面上的那幾筆，只有它們算看過，其餘的要往下滑（seeItems）。沒給表示整頁都看到了（文字試玩）。
   * 這種 App 裡的東西滑到就算看過，有照片的也不用點開。
   */
  | { type: 'openApp'; app: AppId; visible?: ItemId[] }
  /** 在「滑到就算看過」的 App 裡，這幾筆捲進畫面了。不耗電。不屬於這個 App 的會被忽略。 */
  | { type: 'seeItems'; app: AppId; items: ItemId[] }
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
  /** 掛斷正在響的來電。對方馬上知道被按掉。 */
  | { type: 'declineCall' }
  /** 放著讓來電響完，變成未接來電。 */
  | { type: 'letRing' }
  /** option 為 null 表示把視窗關掉（不理它） */
  | { type: 'answerPrompt'; option: string | null }
  /** 指認兇手：回答目前這一題。一般的題目給一張已經成立的疑點的 id，「是誰」那一題給人的 id。 */
  | { type: 'answerChallenge'; answer: string }
  /**
   * 一次交卷時，在某一格放一張疑點（"who" 那格放人），answer 給 null 是清空。
   * 不判對錯、不耗電，可以隨意換；同一張疑點可以放不只一格。
   */
  | { type: 'fillChallenge'; question: string; answer: string | null }
  /** 一次交卷時，把填好的整份交出去。每一格都填了才能交。 */
  | { type: 'submitChallenge' }
  /** 指認兇手全部答完（或整份交卷通過）之後，選交給誰 */
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
  /** 對方已讀但沒有回（這個人已經不理玩家了，見 Character.silentWhen）。訊息送出去了、電照扣，但什麼都沒發生。 */
  | { kind: 'noReply'; thread: ThreadId; character: CharacterId }
  /** 有人打電話來了，開始響 */
  | { kind: 'call'; event: EventId; from: CharacterId }
  /** 這一通結束了。declined：玩家掛斷的；否則是響完沒接（另外記一筆未接來電）。cost 是這一通耗的電。 */
  | { kind: 'callEnded'; event: EventId; from: CharacterId; declined: boolean; cost: number }
  | { kind: 'prompt'; event: EventId }
  /** 按了視窗上的軟牆按鈕：只丟出一句提醒，視窗還在 */
  | { kind: 'promptHint'; event: EventId; text: string }
  /** 視窗關掉了。ignored 表示玩家沒有按任何按鈕（關掉或放著）。 */
  | { kind: 'promptClosed'; event: EventId; ignored: boolean }
  | { kind: 'ladder'; character: CharacterId; from: number; to: number; auto: boolean }
  /** 指認兇手這一題答得對不對。question 是欄位 id 或 "who"；answer 是疑點或人的 id；選錯疑點會扣 cost。 */
  | { kind: 'challengeAnswer'; question: string; answer: string; right: boolean; cost: number }
  /** 一次交卷被退回：人指對了，但 fields 這幾格放的疑點不對。扣 cost，格子內容保留。 */
  | { kind: 'challengeRejected'; fields: string[]; cost: number }
  /** 一次交卷通過了：人和每一格都對，接下來選交給誰（handOver）。 */
  | { kind: 'challengePassed' }
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
  /** 正在響的來電。有值的時候只能送 declineCall 或 letRing，其他動作都會被擋下。助理不能說話，所以沒有接聽。 */
  call: { event: EventId; from: CharacterId; declineCost: number; ringCost: number } | null;
  /** 未接來電，依先後 */
  missedCalls: { event: EventId; from: CharacterId }[];
  /** 現在不理玩家的人（Character.silentWhen 成立）。問他、回他都只會已讀不回。 */
  silent: CharacterId[];
  /** unseen：「滑到就算看過」的 App 裡還沒滑到的那幾筆（照頁面上的順序）；其他 App 是空的 */
  apps: { app: AppId; opened: boolean; cost: number; unseen: ItemId[] }[];
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
  /**
   * 可以拿去問人的疑點。threadOf 是問每個對象時會在哪個聊天室送出（同一張牌對不同人可以不一樣，見 Card.threadTo）。
   */
  tests: { card: CardId; threadOf: Record<CharacterId, ThreadId>; targets: CharacterId[]; cost: number }[];
  /**
   * 再想想：手上每個疑點（concern 為 true 的是還在「在意的地方」階段的）已經給過的句子、還有沒有下一句。
   * thinkOnly 是只能自己想、不能拿去問人的疑點。cost 是按一次耗的電。
   */
  thoughts: { card: CardId; concern: boolean; thinkOnly: boolean; shown: string[]; more: boolean; cost: number }[];
  /**
   * 指認兇手。手上至少有一張成立的疑點才能開始（沒有就是 null）。
   * ask 是現在問到哪一題：question 是欄位 id 或 "who"，null 表示都答完了、只剩選交給誰。
   * options 是這一題還能選的東西：一般的題目是手上還沒在這一題選錯過的疑點，"who" 是嫌疑人，最後是交付對象。
   */
  challenge: {
    ask: { index: number; total: number; question: string | null; options: string[]; retryCost: number };
    /**
     * 一次交卷（資料有寫 challenge.submitAll）時才有，否則是 null。有 form 時畫面請照 form 畫，
     * ask 只在 passed 之後有用（question 是 null、options 是交付對象）。
     * slots 照提問順序：question 是欄位 id 或 "who"；answer 是現在放的疑點（或人），沒填是 null；
     * options 是這一格能放的東西（手上成立的疑點，或嫌疑人）。
     * ready：每一格都填了，可以交。passed：已經交卷通過，只剩選交給誰。
     */
    form: { slots: { question: string; answer: string | null; options: string[] }[]; ready: boolean; passed: boolean; retryCost: number } | null;
  } | null;
}
