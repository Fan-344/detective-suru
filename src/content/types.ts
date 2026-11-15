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
  /**
   * 很短的標示，例如「宵夜」「班表」。還沒點開時顯示成「［照片：宵夜］」，讓玩家知道這裡有圖可以看。
   * 只說這是什麼的照片，不提圖裡的細節。
   */
  label?: string;
  /** 這張圖裡看得到什麼，點開才顯示。只描述畫面，不替玩家解讀。 */
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
      /** 在「在意的地方」指錯細節一次扣的電量 */
      spotMiss?: number;
      /** 在疑點上按一次「提示」耗的電。沒寫就不耗電。 */
      hint?: number;
      /** 指對了人但證據沒選對、挑戰書被退回時扣的電量 */
      challengeRetry?: number;
      /** 來電放著響完（變成未接來電）扣的電。螢幕亮著一直響，最耗電。 */
      callRing?: number;
      /** 來電按掛斷扣的電 */
      callDecline?: number;
    };
    /**
     * false 表示關掉「電量每掉一段就自動升級」。電量只當上限，不影響任何人的情緒；
     * 階梯改由玩家說的話和「已讀不回」（見 CaseMeta.readIgnore）推動。
     * 沒寫或 true 時照 ladderTickEvery 自動升級（舊做法）。
     */
    ladderAuto?: boolean;
    /** 心聲的提示升級用的間隔：某個結論隔這麼多電量還沒被摸到，提示就升一級。沒寫就用 ladderTickEvery。 */
    voiceTickEvery?: number;
    /** 電量每掉多少，沒有被安撫的人自動升一級。ladderAuto 為 false 時不使用。 */
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
  /**
   * 已讀不回。玩家打開某人的聊天室、看到他等回的訊息卻沒回就離開，從離開那一刻起算：
   * - 再做 nudgeAfterActions 個動作還沒回，他追問一句（Character.nudges，輪流用）。
   * - 追問之後再做 raiseAfterActions 個動作還沒回，他的階梯升一級。
   * - 同一則訊息最多只追問一次、只讓他升一級。要等他傳了新的一則、玩家又讀了沒回，才重新開始算。
   * 動作指玩家做的任何一步（開 App、讀聊天室、定位、比對、傳訊息給別人等），跟電量無關。
   * 追問只是催促，不是新的問題：能回的還是原本那一則，選項不變。
   * 玩家沒打開過的聊天室不會觸發（對方看不到已讀）。
   */
  readIgnore?: { nudgeAfterActions: number; raiseAfterActions: number };
  /** 開局固定送出的那句話 */
  /**
   * 時間軸上一開局就有的列：開場就告訴玩家的事（送醫、轉加護、Suru 被喚醒）。
   * 形狀跟 Item.timeline 的列一樣。規則要把它們和看過的 item 的列排在一起。
   */
  timelineStart?: { when: When; label: string; text: string; who?: CharacterId }[];
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

/**
 * 開場的一段。text 旁白、quote 以晴留的話、notice 通知，
 * guide 是一頁工具介紹（標題、一兩句說明、幾個「名稱＋說明」的項目），用來介紹助理自己的 App，
 * goal 是遊戲目標：放在最後，畫面要做得比旁白醒目。
 */
export type IntroSegment =
  | { kind: 'text'; lines: string[] }
  | { kind: 'quote'; lines: string[]; signature?: string }
  | { kind: 'notice'; label: string; lines: string[] }
  | { kind: 'guide'; title: string; lines: string[]; items: { label: string; text: string }[] }
  | { kind: 'goal'; lines: string[] };

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
  /**
   * 這一級的門檻：條件成立之前進不去（停在前一級），成立之後照常。
   * 例如宗翰要先被問過押金（看過他承認的那句），才會主動退錢。
   * 跟 needsContact 一樣，玩家說的話和已讀不回造成的上升都受這個限制。
   */
  when?: Condition;
}

export interface Character {
  id: CharacterId;
  name: string;
  /**
   * 給玩家看的人物簡介：助理開局就知道、而且不劇透的事（職業、跟機主的關係、傳訊息的習慣）。
   * 每個人的篇幅和語氣要一樣，不能讓誰特別突出。
   */
  brief?: string;
  /** 自介：這個人自己寫在個人頁面上的話（他本人的口氣），可以用 \n 換行。跟 brief（旁白寫的介紹）不同。 */
  bio?: string;
  /**
   * 自介裡有可以拿去比對的話時才寫：指向一筆 hidden 的說法（item）。
   * 玩家打開這個人的個人頁面、看到自介，這筆說法就算看過，進到「說法」清單。
   */
  bioItem?: ItemId;
  /** 一行語氣摘要（給寫作的人看，玩家看不到）。完整的語氣指南在 docs/voice/ */
  style: string;
  /**
   * 已讀不回時的追問。外層是幾種不同的追法，輪流使用；內層是一次追問裡的幾則訊息。
   * 只是催促，不帶新的資訊，也沒有回覆選項。
   */
  nudges?: string[][];
  /**
   * 條件成立之後，這個人不再理玩家：拿疑點問他、回他的訊息，都只會顯示已讀、沒有回覆，也沒有任何效果（電照扣）。
   * 他不會再催、不會再升級、不會再打來，在別人的反應裡也不會插話。指認成功後仍然可以把證據交給他。
   */
  silentWhen?: Condition;
  /**
   * 這個人被已讀不回、因此升級的時候，另外觸發的事件（每個事件照舊只會發生一次，可以帶 when）。
   * 規則已支援；case01 目前沒有用到。
   */
  onIgnored?: EventId[];
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
  /**
   * true 表示這個 App 的內容滑到畫面上就算看過，不用點開（動態牆）。
   * 沒寫的照舊：要點開才算（相簿）。
   */
  seeOnScroll?: boolean;
  /** 放在主畫面底部那一排 */
  dock?: boolean;
  /** 收在哪個資料夾（FolderDef.id） */
  folder?: string;
  /**
   * 開局時 App 上的未讀標示，例如「3 則未讀」。就是真的手機上的紅點，讓玩家知道裡面有新東西。
   * 玩家打開過這個 App 之後就不再顯示。聊天 App 的數字之後可以改由各聊天室的未讀數加總。
   */
  badge?: string;
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
  /** 社群 App（Instory）的貼文資訊：發文帳號、按讚數、留言數。只是畫面裝飾，不是線索。 */
  social?: { handle?: string; likes?: number; comments?: number };
  /**
   * 時間軸上的列。有寫才會進 Suru 的時間軸，而且要玩家看過這筆才出現。
   * 目的是讓玩家對每個人那幾天的行蹤：誰在什麼時候、在哪裡（或自稱在哪裡）。
   * 一筆可以有好幾列。只放事實：紀錄上有的，或說法加上佐證之後確定的事。
   * 單純某人說自己在哪（沒有別的東西佐證）不放。
   * - when：排先後用，可以寫得很細，玩家看不到
   * - label：畫面上顯示的大概時段（例如「週六晚上」），同一個 label 的列排在一起
   * - who：這一列講的是誰的行蹤（角色 id，或機主的 id）。講東西的（例如 iPad）不寫
   */
  timeline?: { when: When; label: string; text: string; who?: CharacterId }[];
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
  /** 送出時包成的那句話（機主的口氣）。thinkOnly 的疑點不寫。 */
  say?: string;
  /**
   * 只能自己想、不能拿去問人的疑點（例如「她是什麼時候出事的」）。
   * 沒有 say、targets，靠 availableWhen 出現，只能按「提示」。
   */
  thinkOnly?: boolean;
  /**
   * 「提示」：玩家在這個疑點上自己按了才給的話，一次給一句，照順序越講越明
   * （先提疑問、再指向哪一類資料、最後點名哪一筆）。只提問、不下結論。
   * 取代原本自己跳出來的心聲。每按一次扣 meta.battery.cost.hint。
   */
  hints?: string[];
  /** 對特定對象要換一種說法時才寫 */
  sayTo?: Record<CharacterId, string>;
  /** 可以拿去測試的對象。沒寫表示四個人都可以。 */
  targets?: CharacterId[];
  /** 【待確認】這張牌只能在某個聊天室送出（例如在群組裡標記某人） */
  thread?: ThreadId;
  /**
   * 對特定對象要在指定的聊天室問（例如問宗翰要在群組問，其他人照舊私訊）。
   * 有寫的對象用這裡的聊天室，沒寫的用 thread，再沒有就是私訊。
   */
  threadTo?: Record<CharacterId, ThreadId>;
  /** 【待確認】不靠矛盾比對解鎖的牌：條件成立就拿到 */
  availableWhen?: Condition;
  /**
   * 疑點成立前多一層「哪裡有問題？」。有寫 spot 的牌，availableWhen 成立時不直接成為疑點，
   * 先成為助理「在意的地方」；玩家指出是那一筆資料的哪個細節，指對了才成為疑點。
   * 指錯一次扣 meta.battery.cost.spotMiss，同一個選項不能再指。
   */
  spot?: {
    /** 讓助理在意的那一筆 */
    item: ItemId;
    /** 助理問的那句，只提問 */
    prompt?: string;
    /** 這一筆資料上可以指的細節。都要是資料上真的有的東西，用一樣中性的寫法，不能一眼看出答案。 */
    options: { id: string; text: string }[];
    /** 正確的選項 id。有不只一個合理答案時寫成陣列，指到任何一個都算對。 */
    answer: string | string[];
    /** 指錯時助理說的話，只提問、不提示答案 */
    miss?: string;
  };
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
  /** 選了這句之後接著觸發的事件（事件自己可以帶 delay）。規則已支援；case01 目前沒有用到。 */
  triggers?: EventId[];
}

/**
 * 來電事件。規則已支援（src/engine 的 declineCall、letRing）。
 */
export type CallEvent = {
      id: EventId;
      /**
       * 來電：手機跳出來電畫面。助理不能說話，所以玩家只能掛斷，或放著讓它響完。
       * 掛斷扣 meta.battery.cost.callDecline，響完扣 callRing，並在電話 App 留一筆未接來電。
       */
      kind: 'call';
      when?: Condition;
      from: CharacterId;
      /** 玩家按了掛斷：對方馬上知道有人按掉 */
      onDecline?: { effects?: Effects; then?: EventId[] };
      /** 放著響完，變成未接來電 */
      onMissed?: { effects?: Effects; then?: EventId[] };
      /**
       * 連環來電：until 成立之前，每隔 everyActions 個動作再打一通，每一通都照樣扣電。
       * until 成立就暫停；之後如果又變成不成立（旗標被改回去），就重新開始打。
       * 後面幾通不再重複觸發 then 裡已經發生過的事件。
       */
      repeat?: { everyActions: number; until: Condition };
    };

export type GameEvent =
  | CallEvent
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
      /** 視窗裡的小地圖（示意圖）。label 寫在地圖角落。沒有這個欄位就不畫地圖。 */
      map?: { label: string };
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
 * 指認兇手時的一題。
 * 玩家從已經翻開的疑點裡選一張；選到 cards 裡的任一張，這一題就算對。
 */
export interface ChallengeField {
  id: string;
  prompt: string;
  /** 這一欄沒選對、挑戰書被退回時的心聲。只提問，不說答案。 */
  hint: string;
  /** 可接受的答案：選到其中任一張疑點就算對 */
  cards: CardId[];
}

export interface Ending {
  id: string;
  title: string;
  /**
   * 結局文字，一段一個元素。
   * 整段寫成「名字：「…」「…」」（名字是 你／品妤／宗翰／靖雯／阿澤，冒號是全形）的，畫面顯示成對話泡泡：
   * 每組「」一個泡泡，「你」靠右（Suru 傳出去的），其他人靠左並標名字。其餘段落照敘述顯示。
   */
  text: string[];
  /**
   * 手機螢幕暗下的那一段，必須和 text 裡某一段一字不差。
   * 畫面逐段顯示結局，顯示到這一段時播 power_off 並讓畫面暗下。沒有就不做這個效果。
   */
  screenOff?: string;
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
    | {
        kind: 'challenge';
        accused?: CharacterId;
        givenTo?: CharacterId;
        flags?: Record<string, boolean>;
        /**
         * true 表示「人指對了、但有格子放錯」時進這個結局（不再退回）。它的 accused 是真兇，但不算破案，
         * 也不會問交給誰。資料裡有這種結局時，規則就不退回。
         */
        fieldsWrong?: boolean;
      };
  /**
   * fieldsWrong 的結局用：text 裡寫成 "{rebuttals}" 的那一行，會換成這裡「放錯的那幾格」對應的句子
   * （照提問順序，放錯幾格就出現幾組）。鍵是 challenge.fields 的 id。用規則的 endingText 組出內文。
   */
  rebuttals?: Record<string, string[]>;
}

export interface EndingsFile {
  /**
   * 解答篇：指對兇手的結局（trigger.accused 等於 challenge.culprit）看完之後，接著顯示的事情全貌。
   * 指錯人、沒電、被查到的結局不顯示，免得把答案講破。旁白在這裡可以直接陳述，因為玩家已經自己答對了。
   */
  solution?: { title: string; text: string[] };
  challenge: {
    /**
     * 指認開頭由助理直接講明的前提（地點、手法）。這些不是謎，不出題。
     */
    premise?: string[];
    /** 進入挑戰書時先顯示的說明，講清楚兩種錯法的後果 */
    intro?: string[];
    /**
     * true 表示一次交卷：所有格子（fields 加上「是誰」）都填好才能交出去，交出去之前可以隨意換，
     * 填的時候不提示對錯，手上成立的疑點每一格都能放。
     * 交出去之後：人指錯 → 那個人的指錯結局；人對、每格都對 → 選交給誰；
     * 人對但有格子不對 → 退回，扣一次 meta.battery.cost.challengeRetry，顯示每一個不對的格子的 hint。
     */
    submitAll?: boolean;
    /**
     * 提問的順序，照推理的進度一題一題問，答對才問下一題。
     * 內容是 fields 的 id，加上 "who"（指認是誰的那一題）。
     * 每一題用一筆紀錄回答；答錯扣 meta.battery.cost.challengeRetry 並顯示那一題的 hint，可以再答。
     * "who" 指錯就直接進指錯人的結局。玩家可以中途離開，之後從同一題繼續。
     * 沒寫 sequence 時，照舊是先選人、再一次填完全部欄位。
     */
    sequence?: string[];
    /** 「是誰」那一題的題目 */
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
  posts?: { author: string; text: string; when: string; handle?: string; likes?: number; replies?: number }[];
  /**
   * Instory：不是那四個人發的動態（店家、陌生帳號、贊助貼文），跟案情無關，只能看。
   * when 是顯示用的文字（例如「週日 20:14」「贊助」），畫面請照陣列順序由新到舊排，
   * 跟四個角色的動態（items 裡 app 為 moments 的）穿插。
   */
  moments?: {
    id: string;
    author: string;
    handle: string;
    when: string;
    text: string;
    image: ImageRef;
    likes?: number;
    comments?: number;
    sponsored?: boolean;
  }[];
  /**
   * Link：跟案情無關的聊天室，只能看、不能回，不進推理。
   * from 寫 "self" 代表機主自己，其他直接寫顯示的名字。
   * official：官方帳號。muted：關了通知。
   */
  chats?: {
    id: string;
    title: string;
    when: string;
    official?: boolean;
    muted?: boolean;
    messages: { from: string; when: string; text: string }[];
  }[];
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
