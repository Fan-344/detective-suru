// 案件內容的資料型別。對應 content/<case>/ 底下的每一個 JSON 檔。
//
// 這裡只描述「資料檔長什麼樣」，不含規則，也不含畫面。
// - src/engine 讀這些型別來跑規則
// - src/ui 不直接讀這些型別；步驟三由 engine 的狀態轉成 src/ui/types.ts 的畫面型別
//
// 標了【待確認】的欄位是 build-spec 沒有定義、為了寫得出文本而提出的補充，
// 還沒有定案，步驟二開工前可能會調整。其餘欄位照 build-spec 第 2 節。

// ───────────────────────── 共用 ─────────────────────────

/** 人物 id。機主本人也有一個 id（見 CaseMeta.self）。 */
export type CharacterId = string;
export type ItemId = string;
export type ThreadId = string;
export type AppId = string;
export type CardId = string;
export type EventId = string;

/**
 * 故事內的時間，寫成一段人看得懂的文字，由載入器解析成可排序的值。
 * 允許的寫法：
 *   「週六 18:42」  確定的時刻
 *   「週六 約22:00」 大約的時刻（排序時當作該時刻）
 *   「週五」        只知道哪一天
 *   「較早」        案發那一週之前，排在最前面
 */
export type When = string;

/** 圖片。正式圖還沒有的時候只填 description，畫面用色塊加文字佔位。 */
export interface ImageRef {
  /** content/<case>/assets/ 底下的檔名 */
  file?: string;
  /** 這張圖裡看得到什麼。只描述畫面，不替玩家解讀。 */
  description: string;
}

/** 條件。所有寫出來的欄位都要成立；沒寫的不檢查。 */
export interface Condition {
  /** 某人的階梯等級範圍 */
  ladder?: Record<CharacterId, { min?: number; max?: number }>;
  /** 這些 item 都已經看過 */
  seen?: ItemId[];
  /** 這些 item 都還沒看過 */
  notSeen?: ItemId[];
  /** 【待確認】旗標的值。用來表達「玩家有沒有讓某人明白某件事」這類分岔。 */
  flags?: Record<string, boolean>;
}

/** 效果。 */
export interface Effects {
  /** 階梯等級的增減（正數升、負數降、0 表示明確不變） */
  ladder?: Record<CharacterId, number>;
  /** 【待確認】把某人的階梯直接設到某一級（跳級）。中間各級的 onEnter 是否補跑尚未決定。 */
  ladderTo?: Record<CharacterId, number>;
  /** 【待確認】設定旗標 */
  flags?: Record<string, boolean>;
}

// ───────────────────────── meta.json ─────────────────────────

export interface CaseMeta {
  id: string;
  /**
   * 寫作期間用。true 表示資料檔還沒寫齊，檢查時先不計較缺檔；
   * 其他錯誤照樣會擋。全部寫完後要拿掉。
   */
  draft?: boolean;
  battery: {
    start: number;
    cost: {
      openApp: number;
      readThread: number;
      send: number;
      locate: number;
      /** 【待確認】拿牌測試的耗電。build-spec 的動作表有列，meta 範例沒有。 */
      test?: number;
      /** 第一次打開背景 App 的耗電。可以是小數，比 openApp 低很多。 */
      openIdleApp?: number;
      /** 指對了人但證據沒選對、挑戰書被退回時扣的電量 */
      challengeRetry?: number;
    };
    /** 電量每掉多少，沒有被安撫的人自動升一級 */
    ladderTickEvery: number;
    /**
     * 從來沒被玩家理過的人（玩家沒對他送過任何訊息，回覆選項和測試牌都算）改用這個間隔，
     * 數字比 ladderTickEvery 小，所以升得比較快。玩家一旦對他說過話，就改回 ladderTickEvery。
     * 沒寫就一律用 ladderTickEvery。
     */
    ladderTickEveryIgnored?: number;
  };
  /**
   * 【待確認】這個案子「本週」各天的先後順序，用來排時間軸。
   * 故事會跨過週日到下週一，所以不能照一到日排，要由資料指定。
   */
  dayOrder: string[];
  /**
   * 在背景 App 裡逛太久時跳出的提醒（軟牆，不擋操作）。
   * after：連續打開幾個背景 App 之後跳出；hints：輪流使用的句子，只提問。
   */
  wander?: { after: number; hints: string[] };
  /** 助理醒來那一天的日期，寫成 2026-11-16。行事曆以這一天為「今天」。 */
  today?: string;
  /** 人物簡介前面的一小段背景，交代這幾個人是什麼關係。顯示在「聯絡人」App 的最上面。 */
  castIntro?: string[];
  /** 開局固定送出的那句話 */
  coverStory: string;
  /** 【待確認】掩護說法送到哪個聊天室 */
  coverThread?: ThreadId;
  /** 【待確認】掩護說法送出後依序發生的事件（群組的回應、各人的私訊） */
  afterCover?: EventId[];
  /** 【待確認】掩護說法送出後套用的效果（例如四個人都踏上階梯第一級） */
  afterCoverEffects?: Effects;
  /** 【待確認】機主本人，聊天紀錄裡 from 等於這個 id 的就是她 */
  self?: { id: CharacterId; name: string };
  /** 【待確認】狀態列顯示的 Wi-Fi 名稱 */
  wifiName?: string;
  /** 【待確認】開場文字。build-spec 沒有指定放哪個檔，先放這裡。 */
  intro?: IntroSegment[];
}

/** 開場的一段。三種樣式與外觀框架的開場畫面一致。 */
export type IntroSegment =
  | { kind: 'text'; lines: string[] }
  | { kind: 'quote'; lines: string[]; signature?: string }
  | { kind: 'notice'; label: string; lines: string[] };

// ───────────────────────── characters.json ─────────────────────────

export interface LadderStep {
  /** 從 1 起算的連續整數 */
  level: number;
  id: string;
  /** 進入這一級時依序觸發的事件 id（見 events.json） */
  onEnter: EventId[];
  /**
   * 進這一級之前，玩家必須先傳過訊息，否則停在前一級。
   * - "self"：要對這個角色本人傳過（回覆他的訊息，或拿牌測試他）
   * - "anyone"（或 true）：對任何人傳過就算
   * 開局固定送出的掩護說法不算。自動推進和事件效果造成的上升都受這個限制；條件成立後照常。
   */
  needsContact?: boolean | 'self' | 'anyone';
}

export interface Character {
  id: CharacterId;
  name: string;
  /**
   * 給玩家看的人物簡介：助理開局就知道、而且不劇透的事（職業、跟機主的關係、傳訊息的習慣）。
   * 每個人的篇幅和語氣要一樣，不能讓誰特別突出。
   */
  brief?: string;
  /** 一行語氣摘要（給寫作的人看，玩家看不到）。完整的語氣指南在 docs/voice/ */
  style: string;
  /** 開局時的階梯等級。0 表示還沒踏上第一級。 */
  startLevel?: number;
  ladder: LadderStep[];
  /**
   * 通用反應：反應表裡找不到對應格子時用（一頭霧水）。
   * 外層是幾種不同的回法，輪流使用；內層是一次回覆裡的幾則訊息。
   */
  genericReplies: string[][];
}

// ───────────────────────── apps.json ─────────────────────────

/** assistant 是助理自己的 App：心聲、時間軸、紀錄、說法、牌都在裡面，內容由遊戲狀態產生。 */
/** utility 是功能型的 App（計算機、時鐘等），畫面由外觀框架自己做，不讀案件內容。 */
/** contacts 是聯絡人：先顯示 meta.castIntro，再依 characters.json 的順序列出每個人的 brief。 */
export type AppView = 'chat' | 'list' | 'gallery' | 'map' | 'calendar' | 'contacts' | 'assistant' | 'utility' | 'none';

export interface AppDef {
  id: AppId;
  name: string;
  /** 圖示的 id。圖示本身由外觀框架畫，這裡只給名字。 */
  icon: string;
  /** 用哪一種版型顯示。none 是沒有內容的背景 App；assistant 是助理 App。 */
  view: AppView;
  /** 放在主畫面底部那一排 */
  dock?: boolean;
  /** 收在哪個資料夾（FolderDef.id） */
  folder?: string;
  /** true 表示跟案情無關的背景 App。打開它只耗很少的電（meta.battery.cost.openIdleApp），逛太久會跳出提醒。 */
  background?: boolean;
  /** 【待確認】沒有內容的背景 App 打開時顯示的一句話 */
  emptyText?: string;
}

export interface FolderDef {
  id: string;
  name: string;
  icon: string;
}

export interface AppsFile {
  /** 陣列順序就是主畫面的排列順序 */
  apps: AppDef[];
  folders: FolderDef[];
}

// ───────────────────────── items.json ─────────────────────────

/** record 是紀錄（直接採信），statement 是說法（要拿紀錄來對）。 */
export type ItemKind = 'record' | 'statement';

export interface Item {
  id: ItemId;
  app: AppId;
  kind: ItemKind;
  when?: When;
  title?: string;
  body: string;
  /** 說法出自哪個聊天室 */
  thread?: ThreadId;
  /** 說法是誰講的。kind 為 statement 時必填。 */
  speaker?: CharacterId;
  image?: ImageRef;
  /** 詳情頁的「欄位：值」。用於簡訊、通話、發票這類清單。 */
  fields?: { label: string; value: string }[];
  /** true 表示跟案情無關的生活內容：看得到，但不進推理備忘錄，也不會出現在比對和挑戰書裡。 */
  flavor?: boolean;
  /** 行事曆用的日期，寫成 2026-11-14。有寫 when 的話兩者要是同一天。 */
  date?: string;
  /** 行事曆用的時刻，寫成 16:30。整天的行程不寫。 */
  time?: string;
  /** 【待確認】true 表示要先執行「定位」這個動作才看得到（找裝置用，耗電較多） */
  needsLocate?: boolean;
  /** 清單裡的分組標題（例如哪一天）。沒寫就用 when 的日期。 */
  group?: string;
  /**
   * true 表示一開始看不到，要由反應或事件的 reveals 帶出來。
   * 沒寫或 false 表示打開所屬的 App 或聊天室就看得到。
   */
  hidden?: boolean;
}

// ───────────────────────── threads.json ─────────────────────────

export interface Message {
  from: CharacterId;
  when: When;
  text?: string;
  image?: ImageRef;
  /** 這則訊息同時是一個 item（讀到就進備忘錄） */
  item?: ItemId;
}

export interface Thread {
  id: ThreadId;
  title: string;
  /** 機主以外的成員 */
  members: CharacterId[];
  /** 開局前就在的舊訊息，依時間先後 */
  history: Message[];
  /** 開局時顯示的未讀數 */
  unread?: number;
}

// ───────────────────────── links.json ─────────────────────────

export interface Link {
  statement: ItemId;
  record: ItemId;
  result: 'match' | 'conflict';
  /** 比對成立時解鎖的測試牌 */
  unlocks?: CardId[];
}

// ───────────────────────── cards.json ─────────────────────────

export interface Card {
  id: CardId;
  /** 牌面上的短標題 */
  title: string;
  /** 送出時包成的那句話（機主的口氣） */
  say: string;
  /** 對特定對象要換一種說法時才寫 */
  sayTo?: Record<CharacterId, string>;
  /** 可以拿去測試的對象。沒寫表示四個人都可以。 */
  targets?: CharacterId[];
  /** 【待確認】這張牌只能在某個聊天室送出（例如在群組裡標記某人） */
  thread?: ThreadId;
  /** 【待確認】不靠矛盾比對解鎖的牌：條件成立就拿到 */
  availableWhen?: Condition;
}

// ───────────────────────── reactions.json ─────────────────────────

/** 三種反應：一頭霧水、接得上話、迴避或反問。 */
export type ReactionTone = 'confused' | 'engaged' | 'evasive';

/** 從手機本身看得到的訊號。畫面不顯示階梯數字，只顯示這些。 */
export interface Signal {
  /** 已讀後隔多久才回，寫成給人看的文字 */
  readDelay?: string;
  /** 「正在輸入」出現又消失 */
  typingStops?: boolean;
  /** 已讀不回 */
  noReply?: boolean;
}

export interface Reaction {
  card: CardId;
  target: CharacterId;
  /** 同一格可以有多筆，條件不同；由上往下取第一筆成立的 */
  when?: Condition;
  tone?: ReactionTone;
  /** 對方回的訊息，一則一個元素 */
  reply: string[];
  signal?: Signal;
  /** 【待確認】其他人接著說的話（群組裡測試時會用到） */
  others?: { from: CharacterId; reply: string[]; signal?: Signal }[];
  /** 帶出來的 item */
  reveals?: ItemId[];
  effects?: Effects;
  /** 【待確認】接著觸發的事件。once 的事件已經發生過就不再觸發。 */
  triggers?: EventId[];
}

// ───────────────────────── events.json【待確認：整個檔案】 ─────────────────────────
// build-spec 的階梯 onEnter 引用了訊息與系統事件的 id，但目錄裡沒有對應的檔案。
// 這裡提案把「對方主動傳來的訊息」「系統視窗」「玩家的回覆選項」都放在 events.json。

export interface ReplyOption {
  id: string;
  /** 玩家送出的那句話（機主的口氣） */
  text: string;
  /** 對方接著回的訊息 */
  reply?: string[];
  signal?: Signal;
  reveals?: ItemId[];
  effects?: Effects;
}

export type GameEvent =
  | {
      id: EventId;
      kind: 'message';
      /** 【待確認】觸發後再耗掉多少電量才出現。用來表達「過一陣子才傳」。 */
      delay?: number;
      /** 【待確認】條件不成立就不發生。用來表達階梯同一級的分岔。 */
      when?: Condition;
      /** 【待確認】訊息出現時套用的效果 */
      effects?: Effects;
      thread: ThreadId;
      from: CharacterId;
      text: string[];
      image?: ImageRef;
      signal?: Signal;
      reveals?: ItemId[];
      /** 玩家可以選的回覆。不回也是一種選擇，由 engine 處理。 */
      options?: ReplyOption[];
    }
  | {
      id: EventId;
      /** 系統視窗（例如登入確認） */
      kind: 'system';
      /** 【待確認】整場遊戲只發生一次，不管從哪個入口觸發 */
      once?: boolean;
      title: string;
      lines: string[];
      reveals?: ItemId[];
      /**
       * 視窗上的按鈕。有 hints 的是「軟牆」按鈕：按了只跳出一句提醒（輪流用，只提問），
       * 視窗不關、不耗電、不套用 effects。
       * 把視窗關掉或放著不管，套用 onTimeout。
       */
      options?: { id: string; label: string; effects?: Effects; hints?: string[] }[];
      onTimeout?: Effects;
    }
  | {
      id: EventId;
      kind: 'ending';
      ending: string;
    };

// ───────────────────────── conclusions.json ─────────────────────────

export interface Conclusion {
  id: string;
  text: string;
  /** 每條路是一組 item，全部看過就算到達。主線結論至少兩條。 */
  routes: ItemId[][];
}

// ───────────────────────── voice.json ─────────────────────────

/** 助理的心聲。只提問，不下結論。 */
export interface VoiceLine {
  id: string;
  /** 對應的關鍵結論。沒寫的是跟結論無關的心聲，由 when 決定何時出現。 */
  conclusion?: string;
  /** 1 只提疑問、2 指向資料類型、3 點名哪一筆 */
  level?: 1 | 2 | 3;
  when?: Condition;
  text: string;
}

// ───────────────────────── endings.json ─────────────────────────

/**
 * 挑戰書裡要指向紀錄的一欄。
 * 玩家從已取得的紀錄裡選；選到的紀錄包含 accept 的任一組，這一欄就算對。
 */
export interface ChallengeField {
  id: string;
  prompt: string;
  /** 這一欄沒選對、挑戰書被退回時的心聲。只提問，不說答案。 */
  hint: string;
  /** 可接受的答案：每一組是幾筆紀錄，選到任一組就算對 */
  accept: ItemId[][];
}

export interface Ending {
  id: string;
  title: string;
  /** 結局文字，一段一個元素 */
  text: string[];
  /**
   * 觸發條件。
   * - battery：電量歸零
   * - ladder：某人的階梯走到某一級
   * - challenge：提交挑戰書。由上往下取第一個條件全部成立的結局；沒寫的條件不檢查。
   *   指對了人但有欄位沒選對時不進任何結局，退回重填並扣電量。
   */
  trigger:
    | { kind: 'battery' }
    | { kind: 'ladder'; character: CharacterId; level: number }
    | { kind: 'challenge'; accused?: CharacterId; givenTo?: CharacterId; flags?: Record<string, boolean> };
}

export interface EndingsFile {
  challenge: {
    /** 進入挑戰書時先顯示的說明，講清楚兩種錯法的後果 */
    intro?: string[];
    /** 第一欄「是誰」的題目 */
    whoPrompt: string;
    /** 可以指認的人 */
    suspects: CharacterId[];
    /** 正確答案 */
    culprit: CharacterId;
    fields: ChallengeField[];
    /** 可以交給誰 */
    recipients: CharacterId[];
  };
  endings: Ending[];
}

// ───────────────────────── flavor.json（選填） ─────────────────────────
// 背景 App 裡跟案情無關的內容。沒有這個檔也能玩。

export interface FlavorFile {
  /** 時鐘：鬧鐘 */
  alarms?: { time: string; label: string; repeat: string; on: boolean }[];
  /** 時鐘：世界時鐘。offset 是跟台北差幾小時。 */
  worldClocks?: { city: string; offset: number }[];
  /** 音樂：歌單。歌名和演出者都是虛構的。 */
  playlist?: { title: string; artist: string }[];
  /** 碎念：動態牆上的貼文。帳號都是虛構的。 */
  posts?: { author: string; text: string; when: string }[];
}

// ───────────────────────── 全部合起來 ─────────────────────────

export interface CaseContent {
  meta: CaseMeta;
  characters: Character[];
  apps: AppsFile;
  items: Item[];
  threads: Thread[];
  links: Link[];
  cards: Card[];
  reactions: Reaction[];
  events: GameEvent[];
  conclusions: Conclusion[];
  voice: VoiceLine[];
  endings: EndingsFile;
  flavor?: FlavorFile;
}
