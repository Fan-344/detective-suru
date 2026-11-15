// 外觀框架用的畫面資料型別。
// 這些只描述「畫面要顯示什麼」，不含任何遊戲規則。
// 步驟三會由 engine 的狀態轉成這些型別，畫面元件本身不用改。

export type LayoutKind =
  | 'chat'
  | 'list'
  | 'gallery'
  | 'placeholder'
  | 'contacts'
  | 'finder'
  | 'suru'
  // 以下是跟案情無關、但真的能用的背景 App
  | 'feed'
  | 'photofeed'
  | 'calculator'
  | 'clock'
  | 'calendar'
  | 'settings'
  | 'camera'
  | 'music';

export type IconId =
  | 'chat'
  | 'moments'
  | 'receipts'
  | 'notes'
  | 'photos'
  | 'phone'
  | 'sms'
  | 'weather'
  | 'finder'
  | 'tools'
  | 'music'
  | 'camera'
  | 'suru'
  | 'social'
  | 'calendar'
  | 'clock'
  | 'calculator'
  | 'settings'
  | 'contacts';

export interface AppDef {
  id: string;
  name: string;
  icon: IconId;
  layout: LayoutKind;
  /** 放在主畫面底部那一排 */
  dock?: boolean;
  /** 收在哪個資料夾裡（資料夾的 id） */
  folder?: string;
  /** 跟案情無關的背景 App */
  background?: boolean;
  /** 聊天以外的 App 的未讀數；聊天 App 由聊天室未讀數加總 */
  unread?: number;
}

export interface FolderDef {
  id: string;
  name: string;
  icon: IconId;
}

/** 還沒有正式圖片時的佔位：一個色塊加一段文字描述 */
export interface ImagePlaceholder {
  tone: number;
  /** 點開大圖後看到的完整描述 */
  description: string;
  /** 很短的標示，用在縮圖和聊天裡的佔位色塊 */
  label?: string;
  /** 正式圖片的代號（src/ui/assets/photos/<代號>.jpg）。有圖就顯示圖，沒有就顯示色塊 */
  src?: string;
  /** 這張圖屬於資料裡的哪一筆。點開時要告訴遊戲規則「看過了」 */
  itemId?: string;
}

export interface ChatMember {
  id: string;
  name: string;
  /** 頭像的代號（src/ui/assets/avatars/<代號>.jpg） */
  avatar?: string;
}

/** Link 的個人頁面 */
export interface ChatProfile {
  id: string;
  name: string;
  avatar?: string;
  /** 這個人自己寫的自介 */
  bio?: string;
  /** 按「私訊」要去的聊天室 */
  threadId?: string;
}

export interface ChatMessage {
  id: string;
  /** 發話者的 id；等於 PhoneData.selfId 時是機主這一側 */
  from: string;
  day: string;
  time: string;
  text?: string;
  image?: ImagePlaceholder;
  /** 不是訊息，而是夾在訊息之間的一行小字（例如「已讀後過了很久才回」） */
  note?: string;
  /** 這行小字靠自己這一側（例如自己那句話底下的「已讀」） */
  noteMine?: boolean;
  /** 這則舊訊息同時是資料裡的一筆（線索）。捲進畫面時要告訴遊戲規則「看到了」 */
  itemId?: string;
}

export interface ReplyOption {
  id: string;
  text: string;
}

export interface ChatThread {
  id: string;
  title: string;
  group: boolean;
  members: ChatMember[];
  messages: ChatMessage[];
  unread: number;
  /** 正在輸入的成員 id */
  typing?: string;
  /** 機主最後一則訊息的已讀時間 */
  readAt?: string;
  /** 底部的回覆選項 */
  options?: ReplyOption[];
  /** 輸入框裡已經有一句話，玩家只能按送出 */
  prefill?: string;
  /** 現在可以在這個聊天室裡拿去問人的疑點：會送出的那句話、是哪一張疑點、問誰、耗多少電 */
  asks?: { id: string; text: string; card: string; target: string; title: string; to?: string; cost: number; silent?: boolean }[];
  /** 官方帳號 */
  official?: boolean;
  /** 關了通知 */
  muted?: boolean;
}

export interface ListRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  unread?: boolean;
  /** 列首的小圖示（天氣用） */
  glyph?: 'rain' | 'clear';
  detail: ListDetail;
}

export interface ListDetail {
  /** receipt：畫成一張發票的樣子 */
  style?: 'receipt';
  title: string;
  when?: string;
  lines?: string[];
  fields?: { label: string; value: string }[];
  image?: ImagePlaceholder;
}

export interface ListGroup {
  label: string;
  rows: ListRow[];
}

export interface GalleryItem {
  id: string;
  when: string;
  caption?: string;
  image: ImagePlaceholder;
}

export type IntroSegment =
  | { kind: 'text'; lines: string[] }
  | { kind: 'quote'; lines: string[]; signature?: string }
  | { kind: 'notice'; label: string; lines: string[] }
  /** 遊戲目標：開場最後的說明，要比旁白醒目 */
  | { kind: 'goal'; lines: string[] };

export interface SuruVoiceLine {
  id: string;
  text: string;
  isNew?: boolean;
}

export interface SuruTimelineRow {
  id: string;
  /** 大概的時段（例如「週六晚上」）。同一個時段的列排在一起，當成小標 */
  time: string;
  /** 這一列講的是誰的行蹤。沒有的話講的是東西 */
  who?: { name: string; avatar?: string };
  text?: string;
  /** 這段時間沒有任何紀錄，要明確顯示成空白 */
  gap?: boolean;
}

export interface SuruMemoItem {
  id: string;
  title: string;
  source: string;
  when: string;
  body?: string;
}

/** 「再想想」：已經給過的提示，以及還能不能再要一句 */
export interface SuruThoughts {
  hints: string[];
  canThink: boolean;
  thinkCost: number;
}

/** 手上的一個疑點 */
export interface SuruDoubt extends SuruThoughts {
  id: string;
  no: number;
  title: string;
  /** 問過誰（顯示用的文字） */
  note?: string;
  /** 只能自己想、不能拿去問人 */
  thinkOnly: boolean;
  /** 現在可以拿這個疑點去問的人，以及會送出的那句話 */
  targets: { id: string; name: string; avatar?: string; text: string; where: string; cost: number; threadId: string | null }[];
}

/** 助理在意、但還沒成為疑點的地方：要玩家指出是那筆資料的哪個細節 */
export interface SuruConcern extends SuruThoughts {
  card: string;
  /** 那一筆資料的原貌 */
  item: ListDetail;
  /** 助理問的那句 */
  prompt?: string;
  /** 還可以指的細節 */
  options: { id: string; text: string }[];
  missCost: number;
}

/** 試探：可以問誰、可以對他說哪幾句 */
export interface SuruProbe {
  people: {
    id: string;
    name: string;
    /** 人物記號的編號 */
    mark: number;
    sentences: { card: string; text: string; title: string; where: string; cost: number; threadId: string | null }[];
  }[];
}

/** Suru 助理裡的內容：心聲（最新的排最前面）和推理備忘錄 */
/** 人物背景：幾行前言，加上每個人的一段簡介 */
export interface CastData {
  intro: string[];
  people: { name: string; brief: string; avatar?: string }[];
}

/** 指認兇手的一題：用一張疑點回答（假資料示範是用一筆紀錄）、選一個人，或選把證據交給誰 */
export interface AccuseStep {
  id: string;
  prompt: string;
  kind: 'card' | 'record' | 'who' | 'give';
  /** kind 是 who 或 give 時可以選的人 */
  options?: string[];
  /** 跟 options 一一對應、要回報給遊戲規則的 id。沒給就回報名字 */
  optionIds?: string[];
}

/** 指認兇手的表：每一格放一張疑點（或選一個人），全部填好再一次交出去 */
export interface AccuseForm {
  /** Suru 直接講明的前提（地點、手法），放在最前面 */
  premise: string[];
  slots: {
    id: string;
    prompt: string;
    kind: 'card' | 'who';
    /** 現在放的那一張（或那個人）的 id，沒填是 null */
    answer: string | null;
    /** 這一格可以放的：疑點（name 是標題、no 是編號）或人 */
    options: { id: string; name: string; no?: number }[];
    /** 上次交出去被退回時，這一格站不住：顯示這句提示。改過這一格就不再顯示 */
    hint?: string;
  }[];
  /** 每格都填了，可以交 */
  ready: boolean;
  /** 已經通過，只剩選把證據交給誰 */
  passed: boolean;
  recipients: { id: string; name: string }[];
  /** 被退回一次要耗多少電 */
  retryCost: number;
}

/** 指認兇手：開頭的說明、依序要問的題目、已經答過的答案（顯示用的文字） */
export interface AccuseData {
  intro: string[];
  steps: AccuseStep[];
  answers: string[];
  /** 目前這一題可以選的紀錄（用紀錄回答的題目才有） */
  choices: SuruMemoItem[];
  /** 現在問到第幾題（從 0 算）。沒給就看答過幾題 */
  index?: number;
  /** 目前這一題可以選的疑點（用疑點回答的題目才有）；選錯過的不會再出現 */
  cards?: { id: string; no: number; title: string }[];
  /** 選錯一張要耗多少電 */
  retryCost?: number;
  /** 有這個就畫成「全部填好再交」的表，不一題一題問 */
  form?: AccuseForm;
  /** 現在能不能指認 */
  available: boolean;
}

export interface FinderDevice {
  id: string;
  name: string;
  located: boolean;
  /** 定位之後顯示的位置紀錄，一行一筆 */
  history: string[];
  /** 定位要耗多少電（還沒定位時才有） */
  cost?: number;
}

export interface SuruData {
  voice: SuruVoiceLine[];
  timeline: SuruTimelineRow[];
  records: SuruMemoItem[];
  statements: SuruMemoItem[];
  cards: SuruDoubt[];
  concerns: SuruConcern[];
  probe: SuruProbe;
  accuse: AccuseData;
}

/** 照片社群動態牆上的一則貼文（一張圖加一段話） */
export interface PhotoPost {
  id: string;
  /** 這則動態同時是資料裡的一筆（線索）。捲進畫面時要告訴遊戲規則「看到了」 */
  itemId?: string;
  author: string;
  handle?: string;
  avatar?: string;
  when: string;
  text: string;
  image: ImagePlaceholder;
  likes: number;
  comments: number;
  sponsored?: boolean;
}

/** 社群動態牆上的一則貼文 */
export interface FeedPost {
  id: string;
  author: string;
  /** 帳號代稱 */
  handle?: string;
  text: string;
  when: string;
  likes: number;
  replies: number;
}

export interface MusicTrack {
  title: string;
  artist: string;
  seconds: number;
  tone: number;
}

/** 設定 App 裡真的會生效的開關 */
export interface PhonePrefs {
  showPercent: boolean;
  reduceMotion: boolean;
}

/** 行事曆：今天是哪一天、有哪些行程。日期格式是 2026-11-14 */
export interface CalendarData {
  today: string;
  events: { id: string; date: string; time?: string; title: string }[];
}

export interface ClockData {
  /** 手機醒來時的時刻（一天中的第幾分鐘），之後照真實的秒數往前走 */
  startMinutes: number;
  cities: { name: string; offsetMinutes: number }[];
  alarms: { id: string; time: string; label: string; on: boolean }[];
}

/** Suru 從畫面上方滑下來的一句提醒，不擋操作 */
/** 手機自己跳出來的系統視窗（例如登入確認） */
export interface SystemPrompt {
  id: string;
  title: string;
  lines: string[];
  options: { id: string; label: string }[];
  /** 要不要附一張示意地圖；有的話這是寫在地圖上的地點名稱 */
  map?: string;
  /** 對方的訊息還在一則一則出現：等它們出完再跳，這段時間畫面先擋住不給按 */
  waiting?: boolean;
}

/** 正在響的來電 */
export interface IncomingCall {
  id: string;
  name: string;
  avatar?: string;
  /** 掛斷要耗多少電 */
  declineCost: number;
  /** 放著響完要耗多少電 */
  ringCost: number;
  /** 對方的訊息還在一則一則出現：先等它們出完再響，這段時間畫面先擋住不給按 */
  waiting?: boolean;
}

export interface SuruNotice {
  id: number;
  text: string;
  /** 聊天 App 的新訊息通知：哪個 App、誰傳的、點了要開哪個聊天室。沒有就是 Suru 自己的通知 */
  message?: { appId: string; appName: string; icon: IconId; title: string; threadId: string };
}

export interface PhoneData {
  /** 鎖住：只能按輸入框旁的送出，其他什麼都不能做（開局還沒送出掩護說法的時候） */
  locked?: boolean;
  selfId: string;
  wifiName: string;
  apps: AppDef[];
  folders: FolderDef[];
  threads: ChatThread[];
  profiles: ChatProfile[];
  lists: Record<string, ListGroup[]>;
  galleries: Record<string, GalleryItem[]>;
  suru: SuruData;
  /** 聯絡人 App：背景前言和每個人的簡介 */
  contacts: CastData;
  finder: FinderDevice[];
  music: MusicTrack[];
  feed: FeedPost[];
  /** 照片社群動態牆，依 App 的 id 分開放 */
  photoFeeds: Record<string, PhotoPost[]>;
  calendar: CalendarData;
  clock: ClockData;
  notice?: SuruNotice;
  /** 有人打來：蓋住整個畫面，只能掛斷或等它響完 */
  call?: IncomingCall;
  /** 系統視窗：要先處理才能做別的事 */
  prompt?: SystemPrompt;
}

export interface PhoneActions {
  onOpenThread(threadId: string): void;
  onChooseReply(threadId: string, optionId: string): void;
  onSendPrefill(threadId: string): void;
  onOpenRow(appId: string, rowId: string): void;
  onOpenSuru(): void;
  onOpenApp(appId: string): void;
  onDismissNotice(): void;
  /** 系統視窗：按了某一顆按鈕；null 是不處理、關掉 */
  onAnswerPrompt(option: string | null): void;
  /** 來電：掛斷 */
  onDeclineCall(): void;
  /** 來電：沒人按，響完了 */
  onLetRing(): void;
  onAccuseAnswer(stepId: string, value: string): void;
  /** 指認兇手的表：在某一格放上一張疑點或一個人 */
  onAccuseFill(slotId: string, answer: string): void;
  /** 指認兇手的表：交出去 */
  onAccuseSubmit(): void;
  onSpot(card: string, option: string): void;
  onProbe(card: string, target: string): void;
  /** 對某個疑點（或在意的地方）按了「再想想」 */
  onThink(card: string): void;
  onLocate(deviceId: string): void;
  /** 玩家點開了某一筆的照片 */
  onViewImage(itemId: string): void;
  /** 在個人頁面按了通話 */
  onCall(memberId: string): void;
  /** 聊天室裡這幾則舊訊息捲進畫面了 */
  onSeeMessages(threadId: string, itemIds: string[]): void;
  /** 動態牆上這幾則捲進畫面了 */
  onSeeItems(appId: string, itemIds: string[]): void;
  /** 打開了某個人的個人頁面 */
  onViewProfile(memberId: string): void;
  /** 玩家換了畫面（開了哪個 App、哪一層） */
  onNavigate(nav: Nav): void;
}

export interface Nav {
  app: string | null;
  detail: string | null;
}
