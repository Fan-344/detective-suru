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
  | { kind: 'notice'; label: string; lines: string[] };

export interface SuruVoiceLine {
  id: string;
  text: string;
  isNew?: boolean;
}

export interface SuruTimelineRow {
  id: string;
  time: string;
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

/** Suru 助理裡的內容：心聲（最新的排最前面）和推理備忘錄 */
/** 人物背景：幾行前言，加上每個人的一段簡介 */
export interface CastData {
  intro: string[];
  people: { name: string; brief: string; avatar?: string }[];
}

/** 指認兇手的一題：用一筆紀錄回答、選一個人，或選把證據交給誰 */
export interface AccuseStep {
  id: string;
  prompt: string;
  kind: 'record' | 'who' | 'give';
  /** kind 是 who 或 give 時可以選的人 */
  options?: string[];
}

/** 指認兇手：開頭的說明、依序要問的題目、已經答過的答案（顯示用的文字） */
export interface AccuseData {
  intro: string[];
  steps: AccuseStep[];
  answers: string[];
  /** 目前這一題可以選的紀錄（用紀錄回答的題目才有） */
  choices: SuruMemoItem[];
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
  cards: { no: number; title: string; note?: string }[];
  accuse: AccuseData;
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
  /** 心聲提示的多寡：0 少、1 標準、2 多。外觀框架只記住選擇，規則在步驟三才接 */
  hintLevel: number;
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
export interface SuruNotice {
  id: number;
  text: string;
}

export interface PhoneData {
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
  calendar: CalendarData;
  clock: ClockData;
  notice?: SuruNotice;
}

export interface PhoneActions {
  onOpenThread(threadId: string): void;
  onChooseReply(threadId: string, optionId: string): void;
  onSendPrefill(threadId: string): void;
  onOpenRow(appId: string, rowId: string): void;
  onOpenSuru(): void;
  onOpenApp(appId: string): void;
  onDismissNotice(): void;
  onAccuseAnswer(stepId: string, value: string): void;
  onLocate(deviceId: string): void;
  /** 玩家點開了某一筆的照片 */
  onViewImage(itemId: string): void;
  /** 在個人頁面按了通話 */
  onCall(memberId: string): void;
  /** 玩家換了畫面（開了哪個 App、哪一層） */
  onNavigate(nav: Nav): void;
}

export interface Nav {
  app: string | null;
  detail: string | null;
}
