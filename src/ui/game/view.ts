// 把遊戲狀態翻成畫面要的資料。只讀、不改狀態，也不含規則：
// 能做什麼、要扣多少電，一律問 engine；這裡只決定「怎麼排給畫面看」。

import type { CaseContent, ImageRef, Item } from '../../content';
import { memo, spotOf, type Engine, type GameState, type Menu, type Outcome } from '../../engine';
import { S } from '../strings';
import type {
  AccuseData,
  AccuseForm,
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
  PhotoPost,
  SuruConcern,
  SuruData,
  SuruMemoItem,
  SuruProbe,
  SuruThoughts,
  SuruNotice,
} from '../types';
import { PHOTO_OF_ITEM, PHOTO_OF_MESSAGE, photoKeyOfFile } from './assetMap';

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
  /** 指認兇手的表上次被退回時，站不住的那幾格 */
  accuseRejected: string[];
  /** 對方已讀但沒有回的那幾句：每個聊天室裡，自己送出的第幾則（照送出的順序數） */
  readNoReply: Record<string, number[]>;
}

export const EMPTY_UI: GameUi = { revealed: {}, noticed: {}, openThread: null, voiceLog: [], voiceRead: 0, accuseAnswers: [], accuseRejected: [], readNoReply: {} };

/**
 * 規則說「對方已讀但沒有回」的時候，記下是哪一句：就是那個聊天室裡剛送出的最後一則。
 * 之後那句話底下會一直掛著「已讀」。
 */
export function markNoReply(ui: GameUi, state: GameState, outcomes: Outcome[]): GameUi {
  let marks = ui.readNoReply ?? {};
  for (const o of outcomes) {
    if (o.kind !== 'noReply') continue;
    const at = (state.threads[o.thread]?.appended.length ?? 0) - 1;
    if (at < 0 || (marks[o.thread] ?? []).includes(at)) continue;
    marks = { ...marks, [o.thread]: [...(marks[o.thread] ?? []), at] };
  }
  return marks === (ui.readNoReply ?? {}) ? ui : { ...ui, readNoReply: marks };
}

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
      // 有社群資訊的相簿類 App（Instory）畫成動態牆
      return app.id === 'moments' ? 'photofeed' : 'gallery';
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

/** 要用哪一張圖：資料檔有寫檔名就用它，沒有就查對照表（先查資料項目，再查是哪一則訊息） */
function toImage(image: ImageRef, key: string, itemId?: string, messageKey?: string): ImagePlaceholder {
  const src = photoKeyOfFile(image.file) ?? (itemId ? PHOTO_OF_ITEM[itemId] : undefined) ?? (messageKey ? PHOTO_OF_MESSAGE[messageKey] : undefined);
  return { tone: toneOf(key), description: image.description, label: image.label, src, itemId };
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
      return { id: `${t.id}-h${i}`, itemId: m.item, from: m.from, day, time, text: m.text, image: m.image ? toImage(m.image, `${t.id}-h${i}`, m.item, `${t.id}#${i}`) : undefined };
    });
    appended.slice(0, revealed).forEach((m, i) => {
      m.text.forEach((text, j) => messages.push({ id: `${t.id}-a${i}-${j}`, from: m.from, day: S.today, time: '', text }));
      if (m.image) messages.push({ id: `${t.id}-a${i}-img`, from: m.from, day: S.today, time: '', image: toImage(m.image, `${t.id}-a${i}`) });
      const sig = m.signal;
      const note = sig ? [sig.readDelay, sig.typingStops ? S.signalTypingStops : undefined, sig.noReply ? S.signalNoReply : undefined].filter(Boolean).join('，') : '';
      if (note) messages.push({ id: `${t.id}-a${i}-sig`, from: m.from, day: S.today, time: '', note });
      // 對方已讀、沒有回：在自己那句話底下掛一個「已讀」
      if (ui.readNoReply?.[t.id]?.includes(i)) messages.push({ id: `${t.id}-a${i}-read`, from: m.from, day: S.today, time: '', note: S.readMark, noteMine: true });
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
      // 可以在這個聊天室問的疑點：跟 Suru 裡「拿去問誰」是同一份清單，只是從聊天室這頭進來。
      // 對方的訊息還在出的時候先不給
      asks: settled
        ? menu.tests.flatMap((test) => {
            const card = content.cards.find((c) => c.id === test.card);
            if (!card) return [];
            return test.targets.flatMap((target) => {
              const text = card.sayTo?.[target] ?? card.say;
              if (!text || engine.testThread(card, target) !== t.id) return [];
              return [
                {
                  id: `ask::${card.id}::${target}`,
                  text,
                  card: card.id,
                  target,
                  title: card.title,
                  // 群組裡要寫清楚是問誰
                  to: t.members.length > 1 ? nameOf(target) : undefined,
                  cost: test.cost,
                  silent: menu.silent?.includes(target),
                },
              ];
            });
          })
        : [],
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
    // 自介如果同時是一筆說法（可以拿去比對），顯示那一筆的內文
    const bio = (c.bioItem ? itemOf.get(c.bioItem)?.body : undefined) ?? c.bio;
    profiles.push({ id: c.id, name: c.name, avatar: c.id, bio, threadId: dm?.id });
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
      // 電話的紅點再加上遊戲中沒接到的來電
      unread: layout === 'suru' ? (assistantNew ? 1 : 0) : layout === 'chat' ? undefined : badge + (a.icon === 'phone' ? menu.missedCalls.length : 0),
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
    // 電話：遊戲中沒接到的來電排在最上面，最新的在前
    if (a.icon === 'phone' && menu.missedCalls.length) {
      groups.unshift({
        label: S.callMissedGroup,
        rows: menu.missedCalls
          .map((c, i) => ({
            id: `missed-${i}`,
            title: nameOf(c.from),
            subtitle: S.callMissed,
            unread: true,
            detail: { title: nameOf(c.from), lines: [S.callMissed] },
          }))
          .reverse(),
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
    // 像一般手機相簿一樣照拍攝時間排，新的在前面；同一個時間的維持資料檔裡的順序
    galleries[a.id] = content.items
      .filter((i): i is Item & { image: ImageRef } => i.app === a.id && !i.thread && !!i.image && shown(i.id))
      .map((i, order) => ({ item: i, order, key: feedSortKey(i.when ?? '') ?? Number.NEGATIVE_INFINITY }))
      .sort((x, y) => y.key - x.key || x.order - y.order)
      .map(({ item: i }) => ({ id: i.id, when: i.when ?? '', caption: i.kind === 'statement' ? i.body : (i.title ?? i.body), image: toImage(i.image, i.id, i.id) }));
  }

  // ── 照片社群動態牆（Instory）：四個人發的動態加上無關的貼文，由新到舊 ──
  const photoFeeds: Record<string, PhotoPost[]> = {};
  const feedApp = content.apps.apps.find((a) => layoutOf(a) === 'photofeed');
  if (feedApp) {
    const dated: { post: PhotoPost; key: number | null }[] = [];
    const feedUnseen = menu.apps.find((a) => a.app === feedApp.id)?.unseen ?? [];
    for (const i of content.items) {
      // 滑到才算看過的動態牆：還沒滑到的也要畫出來，不然永遠滑不到
      if (i.app !== feedApp.id || i.thread || !i.image || !(shown(i.id) || feedUnseen.includes(i.id))) continue;
      dated.push({
        key: feedSortKey(i.when ?? ''),
        post: {
          id: i.id,
          itemId: i.id,
          author: i.speaker ? nameOf(i.speaker) : (i.title ?? ''),
          handle: i.social?.handle,
          avatar: i.speaker,
          when: i.when ?? '',
          text: i.body,
          // 四個人的動態要點開圖片才算看過，所以帶著資料項目的 id
          image: toImage(i.image, i.id, i.id),
          likes: i.social?.likes ?? 0,
          comments: i.social?.comments ?? 0,
        },
      });
    }
    // 無關的貼文只有在打開過這個 App 之後才跟著出現
    if (state.openedApps.includes(feedApp.id)) {
      for (const m of content.flavor?.moments ?? []) {
        dated.push({
          key: feedSortKey(m.when),
          post: { id: m.id, author: m.author, handle: m.handle, when: m.sponsored ? S.sponsored : m.when, text: m.text, image: toImage(m.image, m.id), likes: m.likes ?? 0, comments: m.comments ?? 0, sponsored: m.sponsored },
        });
      }
    }
    const sorted = dated.filter((d) => d.key !== null).sort((a, b) => (b.key as number) - (a.key as number)).map((d) => d.post);
    // 排不出時間的（贊助貼文）插在中間
    dated.filter((d) => d.key === null).forEach((d, n) => sorted.splice(Math.min(sorted.length, 3 + n * 4), 0, d.post));
    photoFeeds[feedApp.id] = sorted;
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

  // 對方的訊息是不是還在一則一則出現（來電和系統視窗都等它們出完再跳）
  const stillArriving = Object.entries(state.threads).some(([id, t]) => (ui.revealed[id] ?? 0) < t.appended.length);
  return {
    // 開局那句話一定要先送出，送出前不能做別的事
    locked: state.phase === 'cover',
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
    photoFeeds,
    calendar,
    clock,
    notice: ui.notice,
    prompt: (() => {
      const e = menu.prompt ? content.events.find((x) => x.id === menu.prompt?.event) : undefined;
      if (!menu.prompt || e?.kind !== 'system') return undefined;
      return {
        id: e.id,
        title: e.title,
        lines: e.lines,
        // 只列規則說現在能按的那幾顆，字用資料裡寫的
        options: (e.options ?? []).filter((o) => menu.prompt?.options.includes(o.id)).map((o) => ({ id: o.id, label: o.label })),
        // 資料在事件上寫了 map.label 才畫示意地圖
        map: e.map?.label,
        waiting: stillArriving,
      };
    })(),
    call: menu.call
      ? {
          id: menu.call.event,
          name: nameOf(menu.call.from),
          avatar: menu.call.from,
          declineCost: menu.call.declineCost,
          ringCost: menu.call.ringCost,
          // 她通常是先傳了幾句才打來：等那幾句出完再響
          waiting: stillArriving,
        }
      : undefined,
  };
}

interface Names {
  nameOf(id: string): string;
  threadTitle(id: string): string;
  appName(id: string): string;
  itemOf: Map<string, Item>;
}

/**
 * 動態牆和相簿排序用：把「週六 22:30」「上週四 15:20」換成可以比大小的數字，越新越大。
 * 只用來決定貼文的上下順序，不是遊戲規則。看不懂的寫法回傳 null。
 */
function feedSortKey(when: string): number | null {
  // 「較早」是案發那一週之前，排在最舊
  if (when.startsWith('較早')) return -100 * 1440;
  const m = /^(上)?週([一二三四五六日])(?:\s+(?:約)?(\d{1,2}):(\d{2}))?/.exec(when);
  if (!m) return null;
  // 以助理醒來的週一為第 0 天：週四到週日是前幾天，「上週」再往前七天
  const offset: Record<string, number> = { 四: -4, 五: -3, 六: -2, 日: -1, 一: 0, 二: 1, 三: 2 };
  const day = offset[m[2]] - (m[1] ? 7 : 0);
  return day * 1440 + (m[3] ? Number(m[3]) * 60 + Number(m[4]) : 0);
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
  const ch = content.endings.challenge;
  const ask = menu.challenge?.ask;
  const steps: AccuseStep[] = [
    ...(ch.sequence ?? []).map((q): AccuseStep =>
      q === 'who'
        ? { id: 'who', kind: 'who', prompt: ch.whoPrompt, options: ch.suspects.map(n.nameOf), optionIds: ch.suspects }
        : { id: q, kind: 'card', prompt: ch.fields.find((f) => f.id === q)?.prompt ?? '' },
    ),
    { id: 'give', kind: 'give', prompt: S.accuseGivePrompt, options: ch.recipients.map(n.nameOf), optionIds: ch.recipients },
  ];
  const rawForm = menu.challenge?.form ?? null;
  const cardOption = (id: string) => {
    const at = content.cards.findIndex((c) => c.id === id);
    return at >= 0 ? [{ id, name: content.cards[at].title, no: at + 1 }] : [];
  };
  const form: AccuseForm | undefined = rawForm
    ? {
        premise: (ch as { premise?: string[] }).premise ?? [],
        slots: rawForm.slots.map((sl) => {
          const who = sl.question === 'who';
          const field = ch.fields.find((f) => f.id === sl.question);
          return {
            id: sl.question,
            prompt: who ? ch.whoPrompt : (field?.prompt ?? ''),
            kind: who ? ('who' as const) : ('card' as const),
            answer: sl.answer,
            options: who ? sl.options.map((id) => ({ id, name: n.nameOf(id) })) : sl.options.flatMap(cardOption),
            // 被退回的格子顯示那一格的提示（是一句問句，不是答案）
            hint: ui.accuseRejected.includes(sl.question) ? field?.hint : undefined,
          };
        }),
        ready: rawForm.ready,
        passed: rawForm.passed,
        recipients: ch.recipients.map((id) => ({ id, name: n.nameOf(id) })),
        retryCost: rawForm.retryCost,
      }
    : undefined;
  const accuse: AccuseData = {
    form,
    intro: ch.intro ?? [],
    steps,
    answers: ui.accuseAnswers,
    choices: [],
    // 問到第幾題由規則記著，中途離開、重新整理都不會跑掉
    index: state.accusation.step,
    // 用疑點回答的題目：列出手上已經成立、這一題還沒選錯過的疑點
    cards:
      ask && ask.question !== null && ask.question !== 'who'
        ? ask.options.flatMap((id) => {
            const at = content.cards.findIndex((c) => c.id === id);
            return at >= 0 ? [{ id, no: at + 1, title: content.cards[at].title }] : [];
          })
        : [],
    retryCost: ask?.retryCost ?? 0,
    available: !!menu.challenge,
  };
  // 「再想想」：規則給出每個疑點已經給過的句子、還有沒有下一句
  const thoughtsOf = (cardId: string): SuruThoughts => {
    const t = menu.thoughts.find((x) => x.card === cardId);
    return { hints: t?.shown ?? [], canThink: !!t?.more, thinkCost: t?.cost ?? 0 };
  };
  const inGroup = (id: string | null) => !!id && (content.threads.find((t) => t.id === id)?.members.length ?? 0) > 1;
  const probe: SuruProbe = {
    people: content.characters.flatMap((c, mark) => {
      const sentences = menu.tests
        .filter((t) => t.targets.includes(c.id))
        .flatMap((t) => {
          const card = content.cards.find((x) => x.id === t.card);
          const text = card ? (card.sayTo?.[c.id] ?? card.say) : undefined;
          if (!card || !text) return [];
          const threadId = engine.testThread(card, c.id);
          return [
            {
              card: card.id,
              text,
              title: card.title,
              // 同一張疑點問不同的人，可能在不同的聊天室送出：多人的聊天室就寫出名字，否則是私訊
              // 已經不理人的對象照樣可以問，只是先標出來：問了只會已讀不回
              where: (inGroup(threadId) ? S.probeIn.replace('{thread}', n.threadTitle(threadId as string)) : S.probeDm) + (menu.silent?.includes(c.id) ? '・' + S.silentTag : ''),
              cost: t.cost,
              threadId,
            },
          ];
        });
      return sentences.length ? [{ id: c.id, name: c.name, mark, sentences }] : [];
    }),
  };
  const cards = state.cards.flatMap((id) => {
    const index = content.cards.findIndex((c) => c.id === id);
    const card = content.cards[index];
    if (!card) return [];
    const asked = state.cardsUsed.filter((u) => u.startsWith(`${id}>`)).map((u) => n.nameOf(u.slice(id.length + 1)));
    const thinkOnly = !!menu.thoughts.find((x) => x.card === id)?.thinkOnly;
    const targets = probe.people.flatMap((p) => {
      const sentence = p.sentences.find((x) => x.card === id);
      return sentence ? [{ id: p.id, name: p.name, avatar: p.id, text: sentence.text, where: sentence.where, cost: sentence.cost, threadId: sentence.threadId }] : [];
    });
    return [{ id, no: index + 1, title: card.title, note: asked.length ? `${S.askedPrefix}${asked.join('、')}` : undefined, thinkOnly, targets, ...thoughtsOf(id) }];
  });
  const concerns: SuruConcern[] = menu.concerns.flatMap((c) => {
    const card = content.cards.find((x) => x.id === c.card);
    const spot = card ? spotOf(card) : null;
    const item = n.itemOf.get(c.item);
    if (!spot || !item) return [];
    return [
      {
        card: c.card,
        prompt: spot.prompt,
        item: {
          // 這裡只給那一筆資料的原貌，不露出疑點的標題（那會洩漏答案）
          title: labelOf(item, n.nameOf),
          when: item.when,
          lines: item.kind === 'record' ? item.body.split('\n') : undefined,
          fields: item.fields,
          image: item.image ? toImage(item.image, item.id, item.id) : undefined,
        },
        options: spot.options.filter((o) => c.options.includes(o.id)),
        missCost: c.missCost,
        ...thoughtsOf(c.card),
      },
    ];
  });
  return {
    // 心聲已經取消，改成每個疑點自己的「再想想」
    voice: [],
    // 時間軸由遊戲規則算好：只放看過的、標成「發生的事」的那幾列，已照時間排好。
    // 畫面只顯示大概的時段（label）和這一列講的是誰（who），確切時刻不給玩家看
    timeline: m.timeline.map((row) => ({
      id: row.id,
      time: row.label,
      text: row.text,
      who: row.who ? { name: n.nameOf(row.who), avatar: row.who } : undefined,
    })),
    records: m.records.map(toMemo),
    statements: m.statements.map(toMemo),
    cards,
    concerns,
    probe,
    accuse,
  };
}
