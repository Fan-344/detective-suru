// 外觀框架用的畫面資料型別。
// 這些只描述「畫面要顯示什麼」，不含任何遊戲規則。
// 步驟三會由 engine 的狀態轉成這些型別，畫面元件本身不用改。

export type LayoutKind =
  | 'chat'
  | 'list'
  | 'gallery'
  | 'placeholder'
  | 'suru'
  // 以下是跟案情無關、但真的能用的背景 App
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
  | 'settings';

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
  description: string;
}

export interface ChatMember {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  /** 發話者的 id；等於 PhoneData.selfId 時是機主這一側 */
  from: string;
  day: string;
  time: string;
  text?: string;
  image?: ImagePlaceholder;
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
}

export interface ListRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  unread?: boolean;
  detail: ListDetail;
}

export interface ListDetail {
  title: string;
  when?: string;
  lines?: string[];
  fields?: { label: string; value: string }[];
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
export interface SuruData {
  voice: SuruVoiceLine[];
  timeline: SuruTimelineRow[];
  records: SuruMemoItem[];
  statements: SuruMemoItem[];
  cards: { no: number; title: string; note?: string }[];
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
  lists: Record<string, ListGroup[]>;
  galleries: Record<string, GalleryItem[]>;
  suru: SuruData;
  music: MusicTrack[];
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
}

export interface Nav {
  app: string | null;
  detail: string | null;
}
