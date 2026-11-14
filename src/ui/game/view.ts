// 把遊戲狀態翻成畫面要的資料。只讀、不改狀態，也不含規則：
// 能做什麼、要扣多少電，一律問 engine；這裡只決定「怎麼排給畫面看」。

import type { CaseContent, ImageRef, Item } from '../../content';
import { memo, voice, type Engine, type GameState, type Menu } from '../../engine';
import { S } from '../strings';
import type {
  AccuseData,
  AccuseStep,
  AppDef,
  CalendarData,
  CastData,
  ChatProfile,
  ChatMessage,
  ChatThread,
  ClockData,
  FeedPost,
  FinderDevice,
  GalleryItem,
  IconId,
  ImagePlaceholder,
  LayoutKind,
  ListGroup,
  MusicTrack,
  PhoneData,
  SuruData,
  SuruMemoItem,
  SuruNotice,
} from '../types';
import { PHOTO_OF_ITEM } from './assetMap';

/** 畫面自己記的東西：跟規則無關，只影響呈現（訊息一則一則出現、未讀數、心聲的紀錄）。 */
export interface GameUi {
  /** 各聊天室裡，開局後的新訊息已經顯示到第幾則 */
  revealed: Record<string, number>;
  /** 各聊天室裡，玩家上次看到第幾則。用來算未讀 */
  noticed: Record<string, number>;
  /** 玩家現在停在哪個聊天室 */
  openThread: string | null;
  /** 出現過的心聲，依出現的先後 */
  voiceLog: { id: string; text: string }[];
  /** 玩家已經在 Suru 裡看過幾句心聲 */
  voiceRead: number;
  notice?: SuruNotice;
  /** 指認兇手時，每一題答對的答案（顯示用的文字） */
  accuseAnswers: string[];
}

export const EMPTY_UI: GameUi = { revealed: {}, noticed: {}, openThread: null, voiceLog: [], voiceRead: 0, accuseAnswers: [] };

const UTILITY_LAYOUT: Record<string, LayoutKind> = {
  calculator: 'calculator',
  clock: 'clock',
  settings: 'settings',
  camera: 'camera',
  music: 'music',
  social: 'feed',
};

function layoutOf(app: CaseContent['apps']['apps'][number]): LayoutKind {
  switch (app.view) {
    case 'chat':
      return 'chat';
    case 'list':
      return 'list';
    case 'gallery':
      return 'gallery';
    case 'map':
      return 'finder';
    case 'calendar':
      return 'calendar';
    case 'contacts':
      return 'contacts';
    case 'assistant':
      return 'suru';
    case 'utility':
      return UTILITY_LAYOUT[app.id] ?? 'placeholder';
    default:
      return 'placeholder';
  }
}

const firstLine = (text: string) => text.split('\n')[0];

/** 「週六 18:42」拆成哪一天和幾點 */
function splitWhen(when: string | undefined): { day: string; time: string } {
  if (!when) return { day: '', time: '' };
  const i = when.indexOf(' ');
  return i < 0 ? { day: when, time: '' } : { day: when.slice(0, i), time: when.slice(i + 1) };
}

function toneOf(id: string): number {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return n % 6;
}

function toImage(image: ImageRef, key: string, itemId?: string): ImagePlaceholder {
  return { tone: toneOf(key), description: image.description, label: image.label, src: itemId ? PHOTO_OF_ITEM[itemId] : undefined, itemId };
}

export function buildPhoneData(engine: Engine, state: GameState, ui: GameUi): PhoneData {
  const content = engine.content;
  const menu = engine.menu(state);
  const selfId = content.meta.self?.id ?? 'self';
  const itemOf = new Map(content.items.map((i) => [i.id, i]));
  const nameOf = (id: string) => (id === selfId ? (content.meta.self?.name ?? '') : (content.characters.find((c) => c.id === id)?.name ?? id));
  const threadTitle = (id: string) => content.threads.find((t) => t.id === id)?.title ?? id;
  const appName = (id: string) => content.apps.apps.find((a) => a.id === id)?.name ?? id;
  const shown = (id: string) => state.seen.includes(id) || state.unopened.includes(id);

  // ── 聊天室 ──
  const threads: ChatThread[] = content.threads.map((t) => {
    const appended = state.threads[t.id]?.appended ?? [];
    const revealed = Math.min(ui.revealed[t.id] ?? 0, appended.length);
    const messages: ChatMessage[] = t.history.map((m, i) => {
      const { day, time } = splitWhen(m.when);
      return { id: `${t.id}-h${i}`, from: m.from, day, time, text: m.text, image: m.image ? toImage(m.image, `${t.id}-h${i}`, m.item) : undefined };
    });
    appended.slice(0, revealed).forEach((m, i) => {
      m.text.forEach((text, j) => messages.push({ id: `${t.id}-a${i}-${j}`, from: m.from, day: S.today, time: '', text }));
      if (m.image) messages.push({ id: `${t.id}-a${i}-img`, from: m.from, day: S.today, time: '', image: toImage(m.image, `${t.id}-a${i}`) });
      const sig = m.signal;
      const note = sig ? [sig.readDelay, sig.typingStops ? S.signalTypingStops : undefined, sig.noReply ? S.signalNoReply : undefined].filter(Boolean).join('，') : '';
      if (note) messages.push({ id: `${t.id}-a${i}-sig`, from: m.from, day: S.today, time: '', note });
    });
    const next = appended[revealed];
    const settled = revealed >= appended.length;
    // 新訊息還在一則一則出現的時候，先不給回覆選項
    const reply = settled ? menu.replies.find((r) => r.thread === t.id) : undefined;
    const event = reply ? content.events.find((e) => e.id === reply.event) : undefined;
    const options = event?.kind === 'message' ? (event.options ?? []).map((o) => ({ id: `${event.id}::${o.id}`, text: o.text })) : undefined;
    const fresh = appended.slice(ui.noticed[t.id] ?? 0, revealed).filter((m) => m.from !== selfId).length;
    const unread = ui.openThread === t.id ? 0 : (state.readThreads.includes(t.id) || state.phase === 'cover' ? 0 : (t.unread ?? 0)) + fresh;
    return {
      id: t.id,
      title: t.title,
      group: t.members.length > 1,
      members: t.members.map((id) => ({ id, name: nameOf(id), avatar: id })),
      messages,
      unread,
      typing: next && next.from !== selfId ? next.from : undefined,
      options,
      prefill: state.phase === 'cover' && menu.cover && t.id === content.meta.coverThread ? content.meta.coverStory : undefined,
    };
  });

  // 跟案情無關的聊天室：排在真的聊天室下面，只能看、不能回，也不會告訴遊戲規則
  for (const c of content.flavor?.chats ?? []) {
    const names = [...new Set(c.messages.map((m) => m.from).filter((f) => f !== 'self'))];
    threads.push({
      id: c.id,
      title: c.title,
      group: names.length > 1,
      members: names.map((name) => ({ id: name, name })),
      messages: c.messages.map((m, i) => {
        const { day, time } = splitWhen(m.when);
        return { id: `${c.id}-m${i}`, from: m.from === 'self' ? selfId : m.from, day, time, text: m.text };
      }),
      unread: 0,
      official: c.official,
      muted: c.muted,
    });
  }

  // ── Link 的個人頁面 ──
  const profiles: ChatProfile[] = [];
  for (const c of content.characters) {
    const dm = content.threads.find((t) => t.members.length === 1 && t.members[0] === c.id);
    // 自介是這個人自己寫的話，資料檔有寫（Character.bio）才顯示
    profiles.push({ id: c.id, name: c.name, avatar: c.id, bio: (c as { bio?: string }).bio, threadId: dm?.id });
  }
  for (const t of threads) {
    for (const m of t.members) {
      if (!profiles.some((p) => p.id === m.id)) profiles.push({ id: m.id, name: m.name, threadId: t.group ? undefined : t.id });
    }
  }

  // ── App ──
  const assistantNew = state.assistantUnread || ui.voiceLog.length > ui.voiceRead;
  const apps: AppDef[] = content.apps.apps.map((a) => {
    const layout = layoutOf(a);
    const opened = state.openedApps.includes(a.id);
    const badge = !opened && a.badge ? Number(/\d+/.exec(a.badge)?.[0] ?? 1) : 0;
    return {
      id: a.id,
      name: a.name,
      icon: a.icon as IconId,
      layout,
      dock: a.dock,
      folder: a.folder,
      background: a.background,
      unread: layout === 'suru' ? (assistantNew ? 1 : 0) : layout === 'chat' ? undefined : badge,
    };
  });

  // ── 清單 ──
  const lists: Record<string, ListGroup[]> = {};
  for (const a of content.apps.apps.filter((x) => x.view === 'list')) {
    const groups: ListGroup[] = [];
    for (const item of content.items.filter((i) => i.app === a.id && !i.thread && shown(i.id))) {
      const { day, time } = splitWhen(item.when);
      const label = item.group ?? day;
      let g = groups.find((x) => x.label === label);
      if (!g) groups.push((g = { label, rows: [] }));
      const isReceipt = a.icon === 'receipts';
      g.rows.push({
        id: item.id,
        title: item.title ?? firstLine(item.body),
        subtitle: item.title ? firstLine(item.body) : undefined,
        meta: time,
        // 天氣的小圖示：內文提到下雨就畫雨，寫明沒下雨或沒提到就畫晴
        glyph: a.icon === 'weather' ? (/雨/.test(item.body) && !/無降雨|無雨|沒有?下雨/.test(item.body) ? 'rain' : 'clear') : undefined,
        detail: {
          style: isReceipt ? 'receipt' : undefined,
          title: item.title ?? firstLine(item.body),
          when: item.when,
          // 發票的品項一行一項
          lines: isReceipt ? item.body.split(/[、\n]/) : item.body.split('\n'),
          fields: item.fields,
          image: item.image ? toImage(item.image, item.id, item.id) : undefined,
        },
      });
    }
    lists[a.id] = groups;
  }
  // 動態牆。資料沒寫按讚和回覆數時，用固定算出來的假數字，每次看到的都一樣
  const feed: FeedPost[] = (content.flavor?.posts ?? []).map((p, i) => ({
    id: `post${i}`,
    author: p.author,
    text: p.text,
    when: p.when,
    handle: p.handle,
    likes: p.likes ?? 3 + ((i * 37 + p.text.length * 5) % 240),
    replies: p.replies ?? (i * 7 + p.text.length) % 19,
  }));

  // ── 相簿類 ──
  const galleries: Record<string, GalleryItem[]> = {};
  for (const a of content.apps.apps.filter((x) => x.view === 'gallery')) {
    galleries[a.id] = content.items
      .filter((i): i is Item & { image: ImageRef } => i.app === a.id && !i.thread && !!i.image && shown(i.id))
      .map((i) => ({ id: i.id, when: i.when ?? '', caption: i.kind === 'statement' ? i.body : (i.title ?? i.body), image: toImage(i.image, i.id, i.id) }));
  }

  // ── 找裝置、行事曆、聯絡人 ──
  const mapApp = content.apps.apps.find((a) => a.view === 'map');
  const locateCost = menu.locate.find((l) => l.app === mapApp?.id)?.cost;
  const finder: FinderDevice[] = content.items
    .filter((i) => i.app === mapApp?.id && (i.needsLocate || shown(i.id)) && (!i.hidden || shown(i.id)))
    .map((i) => {
      const located = shown(i.id);
      return {
        id: i.id,
        name: i.title ?? firstLine(i.body),
        located,
        history: i.fields?.length ? i.fields.map((f) => `${f.label}：${f.value}`) : i.body.split('\n'),
        cost: located ? undefined : locateCost,
      };
    });

  const calendar: CalendarData = {
    today: content.meta.today ?? '2026-01-01',
    events: content.items.filter((i) => i.app === 'calendar' && i.date && shown(i.id)).map((i) => ({ id: i.id, date: i.date as string, time: i.time, title: i.title ?? i.body })),
  };

  const contacts: CastData = {
    intro: content.meta.castIntro ?? [],
    people: content.characters.filter((c) => c.brief).map((c) => ({ name: c.name, brief: c.brief as string, avatar: c.id })),
  };

  // ── 背景 App 的內容 ──
  const music: MusicTrack[] = (content.flavor?.playlist ?? []).map((t, i) => ({ title: t.title, artist: t.artist, seconds: 176 + ((i * 53) % 88), tone: i }));
  const clock: ClockData = {
    startMinutes: 16 * 60 + 20,
    cities: (content.flavor?.worldClocks ?? []).map((c) => ({ name: c.city, offsetMinutes: c.offset * 60 })),
    alarms: (content.flavor?.alarms ?? []).map((a, i) => ({ id: `alarm${i}`, time: a.time, label: `${a.label}・${a.repeat}`, on: a.on })),
  };

  return {
    selfId,
    wifiName: content.meta.wifiName ?? '',
    apps,
    folders: content.apps.folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon as IconId })),
    threads,
    profiles,
    lists,
    galleries,
    suru: buildSuru(engine, state, ui, menu, { nameOf, threadTitle, appName, itemOf }),
    contacts,
    finder,
    music,
    feed,
    calendar,
    clock,
    notice: ui.notice,
  };
}

interface Names {
  nameOf(id: string): string;
  threadTitle(id: string): string;
  appName(id: string): string;
  itemOf: Map<string, Item>;
}

/** 一行就能認出是哪一筆的短標籤 */
export function labelOf(item: Item, nameOf: (id: string) => string): string {
  if (item.kind === 'statement') return `${nameOf(item.speaker ?? '')}：「${firstLine(item.body)}」`;
  return item.title ?? firstLine(item.body);
}

function buildSuru(engine: Engine, state: GameState, ui: GameUi, menu: Menu, n: Names): SuruData {
  const content = engine.content;
  const m = memo(content, state);
  const toMemo = (item: Item): SuruMemoItem => ({
    id: item.id,
    title: labelOf(item, n.nameOf),
    source: item.thread ? `${n.appName(item.app)}・${n.threadTitle(item.thread)}` : n.appName(item.app),
    when: item.when ?? '',
    body: item.kind === 'record' && item.title ? firstLine(item.body) : undefined,
  });
  const log = ui.voiceLog;
  const ch = content.endings.challenge;
  const ask = menu.challenge?.ask;
  const steps: AccuseStep[] = [
    ...(ch.sequence ?? []).map((q): AccuseStep =>
      q === 'who'
        ? { id: 'who', kind: 'who', prompt: ch.whoPrompt, options: ch.suspects.map(n.nameOf) }
        : { id: q, kind: 'record', prompt: ch.fields.find((f) => f.id === q)?.prompt ?? '' },
    ),
    { id: 'give', kind: 'give', prompt: S.accuseGivePrompt, options: ch.recipients.map(n.nameOf) },
  ];
  const accuse: AccuseData = {
    intro: ch.intro ?? [],
    steps,
    answers: ui.accuseAnswers,
    choices: ask && ask.question !== null && ask.question !== 'who' ? ask.options.flatMap((id) => (n.itemOf.get(id) ? [toMemo(n.itemOf.get(id) as Item)] : [])) : [],
    available: !!menu.challenge,
  };
  return {
    voice: [...log].reverse().map((v, i) => ({ id: v.id, text: v.text, isNew: log.length - 1 - i >= ui.voiceRead })),
    // 時間軸只放紀錄（發生過的事），聊天裡說的話留在「說法」
    timeline: m.timeline.filter((item) => item.kind === 'record').map((item) => ({ id: item.id, time: item.when ?? '', text: labelOf(item, n.nameOf) })),
    records: m.records.map(toMemo),
    statements: m.statements.map(toMemo),
    cards: state.cards.flatMap((id) => {
      const index = content.cards.findIndex((c) => c.id === id);
      const card = content.cards[index];
      if (!card) return [];
      const asked = state.cardsUsed.filter((u) => u.startsWith(`${id}>`)).map((u) => n.nameOf(u.slice(id.length + 1)));
      return [{ no: index + 1, title: card.title, note: asked.length ? `${S.askedPrefix}${asked.join('、')}` : undefined }];
    }),
    accuse,
  };
}

/** 現在該出現的心聲裡，還沒記進紀錄的 */
export function newVoiceLines(engine: Engine, state: GameState, ui: GameUi): { id: string; text: string }[] {
  if (state.phase !== 'play') return [];
  const have = new Set(ui.voiceLog.map((v) => v.id));
  const lines = voice(engine, state);
  // 規則會同時給出很多句（每個還沒查清楚的結論各一句）。一次全丟給玩家只會被無視，
  // 所以綁結論的問題一次只問一個：照資料檔的順序，前一個有進展了才換下一個。
  const current = lines.find((l) => l.conclusion);
  return lines.filter((l) => !l.conclusion || l === current).filter((l) => !have.has(l.id)).map((l) => ({ id: l.id, text: l.text }));
}
