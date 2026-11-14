// 遊戲規則。輸入一個狀態和一個動作，輸出新的狀態和發生了什麼。
// 這裡不寫任何台詞或線索，全部從傳進來的 CaseContent 讀。

import type {
  AppId,
  CaseContent,
  Card,
  Character,
  CharacterId,
  Condition,
  Effects,
  EventId,
  GameEvent,
  Item,
  ItemId,
  Signal,
  Thread,
  ThreadId,
} from '../content/types';
import { DEFAULT_RULES, type Action, type GameState, type Menu, type Outcome, type Rules, type StepResult } from './types';

export interface Engine {
  content: CaseContent;
  rules: Rules;
  start(): GameState;
  step(state: GameState, action: Action): StepResult;
  menu(state: GameState): Menu;
  /** 這張牌對這個人要在哪個聊天室送出；送不了回傳 null */
  testThread(card: Card, target: CharacterId): ThreadId | null;
  holds(state: GameState, condition: Condition | undefined): boolean;
}

/** 疑點成立前多的一層（見 Card.spot）。沒寫或沒有選項就當作沒有這一層。 */
export type Spot = NonNullable<Card['spot']>;

/** 只能自己想、不能拿去問人的疑點（沒有 say、沒有對象，只能按「再想想」） */
export function isThinkOnly(card: Card): boolean {
  return card.thinkOnly === true;
}

export function spotOf(card: Card): Spot | null {
  return card.spot && card.spot.options.length > 0 ? card.spot : null;
}

/** 這個選項是不是正確答案。答案可以不只一個，指到任何一個都算對。 */
export function isRightSpot(spot: Spot, option: string): boolean {
  return Array.isArray(spot.answer) ? spot.answer.includes(option) : spot.answer === option;
}

export function createEngine(content: CaseContent, rules: Rules = DEFAULT_RULES): Engine {
  const { meta } = content;
  const cost = meta.battery.cost;
  const items = new Map<ItemId, Item>(content.items.map((i) => [i.id, i]));
  const events = new Map<EventId, GameEvent>(content.events.map((e) => [e.id, e]));
  const characters = new Map<CharacterId, Character>(content.characters.map((c) => [c.id, c]));
  const threads = new Map<ThreadId, Thread>(content.threads.map((t) => [t.id, t]));
  const cards = new Map(content.cards.map((c) => [c.id, c]));
  const chatApps = content.apps.apps.filter((a) => a.view === 'chat').map((a) => a.id);
  const testCost = cost.test ?? cost.send;
  /** 小數相加會有誤差，電量一律收到小數一位 */
  const tidy = (n: number) => Math.round(n * 10) / 10;
  const openCost = (app: { background?: boolean }) => (app.background ? (cost.openIdleApp ?? cost.openApp) : cost.openApp);
  /** 進推理備忘錄的 item（跟案情無關的生活內容不算） */

  /** 指錯「哪裡有問題」時扣的電 */
  const spotMissCost = cost.spotMiss ?? 0;

  /** 指認兇手的提問順序；沒寫就照舊一次填完 */
  // 指認兇手的提問順序。資料沒寫就照欄位順序問完再問是誰。
  const sequence: string[] = content.endings.challenge.sequence?.length
    ? content.endings.challenge.sequence
    : [...content.endings.challenge.fields.map((f) => f.id), 'who'];
  /** 一次交卷：所有格子填好才交出去（見 EndingsFile.challenge.submitAll）。否則是一題一題問。 */
  const submitAll = content.endings.challenge.submitAll === true;
  /** 「滑到就算看過」的 App（例如動態牆）：裡面的東西捲進畫面就算看過，有照片的也不用點開 */
  const scrollApp = (id: AppId) => content.apps.apps.find((a) => a.id === id)?.seeOnScroll === true;
  /** 某個 App 的頁面上現在有的東西（照資料檔的順序） */
  const pageItems = (s: GameState, app: AppId) =>
    content.items.filter((i) => i.app === app && !i.thread && !i.hidden && (!i.needsLocate || s.located.includes(app))).map((i) => i.id);

  const dmThread = (target: CharacterId): ThreadId | null =>
    content.threads.find((t) => t.members.length === 1 && t.members[0] === target)?.id ?? null;

  function testThread(card: Card, target: CharacterId): ThreadId | null {
    if (isThinkOnly(card)) return null;
    if (card.targets && !card.targets.includes(target)) return null;
    if (!characters.has(target)) return null;
    // 先看這個對象有沒有指定的聊天室，再看整張牌指定的，都沒有就是私訊
    const where = card.threadTo?.[target] ?? card.thread;
    if (where) return threads.get(where)?.members.includes(target) ? where : null;
    return dmThread(target);
  }

  function holds(state: GameState, c: Condition | undefined): boolean {
    if (!c) return true;
    for (const [who, range] of Object.entries(c.ladder ?? {})) {
      const level = state.ladder[who] ?? 0;
      if (range.min !== undefined && level < range.min) return false;
      if (range.max !== undefined && level > range.max) return false;
    }
    if (c.seen?.some((id) => !state.seen.includes(id))) return false;
    if (c.notSeen?.some((id) => state.seen.includes(id))) return false;
    // 沒設過的旗標當作「否」
    for (const [flag, value] of Object.entries(c.flags ?? {})) if ((state.flags[flag] ?? false) !== value) return false;
    return true;
  }

  function start(): GameState {
    const ladder: Record<string, number> = {};
    const genericIndex: Record<string, number> = {};
    for (const c of content.characters) {
      ladder[c.id] = c.startLevel ?? 0;
      genericIndex[c.id] = 0;
    }
    return {
      phase: 'cover',
      battery: meta.battery.start,
      spent: 0,
      seen: [],
      unopened: [],
      viewedImages: [],
      ladder,
      flags: {},
      openedApps: [],
      readThreads: [],
      located: [],
      threads: Object.fromEntries(content.threads.map((t) => [t.id, { appended: [] }])),
      cards: [],
      concerns: [],
      hints: {},
      cardsUsed: [],
      fired: [],
      scheduled: [],
      awaiting: [],
      prompt: null,
      promptHintIndex: 0,
      soothe: {},
      lastTick: Object.fromEntries(content.characters.map((c) => [c.id, 0])),
      attended: [],
      genericIndex,
      wanderStreak: 0,
      wanderIndex: 0,
      assistantUnread: false,
      currentThread: null,
      readAwaiting: [],
      ignoring: {},
      ignoredOut: [],
      nudgeIndex: {},
      challengeTries: 0,
      accusation: { step: 0, tried: {}, slots: {} },
      ended: null,
    };
  }

  function step(prev: GameState, action: Action): StepResult {
    const s: GameState = structuredClone(prev);
    const out: Outcome[] = [];
    const invalid = (reason: string): StepResult => ({ state: prev, outcomes: [{ kind: 'invalid', reason }] });

    // ── 小工具（都直接改 s、往 out 記錄） ──

    const end = (ending: string) => {
      if (s.ended) return;
      s.ended = ending;
      s.phase = 'ended';
      s.prompt = null;
      out.push({ kind: 'ending', ending });
    };

    /** direct：不管有沒有照片，直接算看過（滑到就算看過的 App 用） */
    const see = (ids: ItemId[], direct = false) => {
      // 照片要點開才算看過的規則下，還沒點開的先放在 unopened
      if (direct) s.unopened = s.unopened.filter((id) => !ids.includes(id));
      const waiting = rules.imagesMustBeOpened && !direct ? ids.filter((id) => items.get(id)?.image && !s.viewedImages.includes(id)) : [];
      for (const id of waiting) if (!s.unopened.includes(id) && !s.seen.includes(id)) s.unopened.push(id);
      const fresh = ids.filter((id) => items.has(id) && !s.seen.includes(id) && !waiting.includes(id));
      if (fresh.length === 0) return;
      s.seen.push(...fresh);
      out.push({ kind: 'items', items: fresh });
    };

    const moveLadder = (who: CharacterId, delta: number, auto: boolean) => {
      const character = characters.get(who);
      if (!character || delta === 0) return;
      const max = character.ladder.length;
      const from = s.ladder[who] ?? 0;
      const to = Math.max(0, Math.min(max, from + delta));
      if (to === from) return;
      if (to < from) {
        out.push({ kind: 'ladder', character: who, from, to, auto });
        s.ladder[who] = to;
        return;
      }
      // 往上時一級一級走，每一級的 onEnter 都會發生
      for (let level = from + 1; level <= to && !s.ended; level++) {
        const rung = character.ladder.find((l) => l.level === level);
        // 標了 needsContact 的那一級要玩家先開口才進得去（否則停在前一級）：
        // self 是要理過這個角色本人，其餘（true、anyone）是理過任何人就算
        const contacted = rung?.needsContact === 'self' ? s.attended.includes(who) : s.attended.length > 0;
        if (rung?.needsContact && !contacted) break;
        // 這一級自己帶的門檻（when）：條件還沒成立也停在前一級，成立之後照常
        if (rung?.when && !holds(s, rung.when)) break;
        s.ladder[who] = level;
        for (const id of rung?.onEnter ?? []) fire(id);
        for (const e of content.endings.endings) {
          if (e.trigger.kind === 'ladder' && e.trigger.character === who && e.trigger.level === level) end(e.id);
        }
      }
      if (s.ladder[who] !== from) out.push({ kind: 'ladder', character: who, from, to: s.ladder[who], auto });
    };

    /** byPlayer：這個效果是玩家送出的東西造成的，會記入「有沒有被安撫」 */
    const apply = (effects: Effects | undefined, byPlayer: boolean) => {
      if (!effects) return;
      Object.assign(s.flags, effects.flags ?? {});
      for (const [who, delta] of Object.entries(effects.ladder ?? {})) {
        if (byPlayer) s.soothe[who] = delta <= 0 ? 'calm' : 'stirred';
        moveLadder(who, delta, false);
      }
      for (const [who, level] of Object.entries(effects.ladderTo ?? {})) {
        moveLadder(who, level - (s.ladder[who] ?? 0), false);
      }
    };

    function fire(id: EventId, fromSchedule = false) {
      const e = events.get(id);
      if (!e || s.ended || s.fired.includes(id)) return;
      if (e.kind === 'ending') {
        s.fired.push(id);
        end(e.ending);
        return;
      }
      if (e.kind === 'system') {
        s.fired.push(id);
        s.prompt = id;
        out.push({ kind: 'prompt', event: id });
        see(e.reveals ?? []);
        return;
      }
      if (!holds(s, e.when)) return;
      if (e.delay && !fromSchedule) {
        if (!s.scheduled.some((x) => x.event === id)) s.scheduled.push({ event: id, at: s.spent + e.delay });
        return;
      }
      s.fired.push(id);
      s.threads[e.thread]?.appended.push({ from: e.from, text: e.text, image: e.image, signal: e.signal });
      out.push({ kind: 'message', thread: e.thread, from: e.from, text: e.text, image: e.image, signal: e.signal, event: id });
      see(e.reveals ?? []);
      // 每個人只有最新的一則能回：他傳了新的（不管在哪個聊天室），之前沒回的就作廢，留在紀錄裡當作沒回
      s.awaiting = s.awaiting.filter((old) => {
        const before = events.get(old);
        return before?.kind !== 'message' || before.from !== e.from;
      });
      if (e.options?.length) s.awaiting.push(id);
      apply(e.effects, false);
    }

    /** 這個人隔多少電量自動推進一次。從來沒被理過的人用較短的間隔（資料有寫的話）。 */
    const tickEvery = (who: CharacterId) =>
      s.attended.includes(who) ? meta.battery.ladderTickEvery : (meta.battery.ladderTickEveryIgnored ?? meta.battery.ladderTickEvery);

    /** 每個人各自計時。輪到的人如果這一段被安撫過就不升，然後重新開始算下一段。 */
    const tick = () => {
      // 資料關掉了「電量掉一段就自動升級」：電量只當上限，階梯由玩家說的話和已讀不回推動
      if (meta.battery.ladderAuto === false) return;
      for (let again = true; again && !s.ended; ) {
        again = false;
        for (const c of content.characters) {
          if (s.ended) return;
          const every = tickEvery(c.id);
          if (every <= 0 || s.spent - (s.lastTick[c.id] ?? 0) < every) continue;
          s.lastTick[c.id] = tidy((s.lastTick[c.id] ?? 0) + every);
          const calm = s.soothe[c.id] === 'calm';
          delete s.soothe[c.id];
          if (!calm) moveLadder(c.id, 1, true);
          again = true;
        }
      }
    };

    const attend = (who: CharacterId) => {
      if (characters.has(who) && !s.attended.includes(who)) s.attended.push(who);
    };

    const spend = (amount: number) => {
      if (amount <= 0 || s.ended) return;
      const used = Math.min(amount, s.battery);
      s.battery = tidy(s.battery - used);
      s.spent = tidy(s.spent + used);
      out.push({ kind: 'battery', cost: used, battery: s.battery });
      if (s.battery <= 0) {
        const e = content.endings.endings.find((x) => x.trigger.kind === 'battery');
        if (e) end(e.id);
        return;
      }
      for (;;) {
        const due = s.scheduled.find((x) => x.at <= s.spent);
        if (!due || s.ended) break;
        s.scheduled = s.scheduled.filter((x) => x !== due);
        fire(due.event, true);
      }
      tick();
    };

    const say = (thread: ThreadId, text: string) => {
      s.threads[thread]?.appended.push({ from: meta.self?.id ?? '', text: [text] });
      out.push({ kind: 'sent', thread, text });
    };

    const hear = (thread: ThreadId, from: CharacterId, text: string[], signal?: Signal) => {
      if (text.length === 0 && !signal) return;
      s.threads[thread]?.appended.push({ from, text, signal });
      out.push({ kind: 'message', thread, from, text, signal });
    };

    const gainCards = () => {
      const ready = content.cards.filter(
        (c) => c.availableWhen && !s.cards.includes(c.id) && !s.concerns.some((x) => x.card === c.id) && holds(s, c.availableWhen),
      );
      if (ready.length === 0) return;
      // 有寫 spot 的先變成「在意的地方」，要玩家指出哪裡有問題才成為疑點；沒寫的直接成為疑點
      for (const c of ready.filter((c) => spotOf(c))) s.concerns.push({ card: c.id, tried: [] });
      const fresh = ready.filter((c) => !spotOf(c)).map((c) => c.id);
      if (fresh.length) {
        s.cards.push(...fresh);
        out.push({ kind: 'cards', cards: fresh, via: 'noted' });
      }
      if (!s.assistantUnread) {
        s.assistantUnread = true;
        out.push({ kind: 'assistantUnread' });
      }
    };

    /**
     * 已讀不回（資料有寫 meta.readIgnore 時）。每個動作結束時算一次：
     * 玩家看到某人等回的訊息、沒回就離開，之後每做一個動作就記一次；
     * 記滿先追問一句，追問後再記滿就升一級。同一則訊息最多只升一次，
     * 之後要等他傳了新的一則、玩家又讀了沒回，才重新開始算。
     * 算「動作」的是打開 App、讀聊天室、定位、傳訊息（回覆、試探）；
     * 點開照片、比對、指出哪裡有問題、指認兇手的作答、按視窗的按鈕都不算（看和想不會讓對方更急）。
     */
    const readIgnore = () => {
      const config = meta.readIgnore;
      // 玩家現在停在哪個聊天室
      let here = s.currentThread;
      if (action.type === 'readThread') here = action.thread;
      else if (action.type === 'reply') here = (events.get(action.event) as { thread?: ThreadId } | undefined)?.thread ?? here;
      else if (action.type === 'test') here = testThread(cards.get(action.card)!, action.target) ?? here;
      else if (action.type === 'sendCover') here = meta.coverThread ?? content.threads[0]?.id ?? null;
      else if (action.type === 'openApp' || action.type === 'locate') here = null;
      s.currentThread = here;
      if (!config) return;

      const counts = ['openApp', 'readThread', 'locate', 'reply', 'test'].includes(action.type);
      const pendingOf = (who: CharacterId) =>
        s.awaiting.map((id) => events.get(id)).find((e) => e?.kind === 'message' && e.from === who && s.readAwaiting.includes(e.id) && !s.ignoredOut.includes(e.id));
      for (const c of content.characters) {
        if (s.ended) return;
        const clock = s.ignoring[c.id];
        if (!clock) continue;
        const pending = pendingOf(c.id);
        if (!pending || pending.kind !== 'message') {
          delete s.ignoring[c.id];
          continue;
        }
        if (!counts || here === pending.thread) continue;
        clock.count += 1;
        if (!clock.nudged && clock.count >= config.nudgeAfterActions) {
          clock.nudged = true;
          clock.count = 0;
          const nudges = c.nudges ?? [];
          if (nudges.length) {
            const index = s.nudgeIndex[c.id] ?? 0;
            // 追問只是催促，不是新的問題：不走事件，原本那一則照樣能回
            hear(pending.thread, c.id, nudges[index % nudges.length]);
            s.nudgeIndex[c.id] = index + 1;
          }
        } else if (clock.nudged && clock.count >= config.raiseAfterActions) {
          delete s.ignoring[c.id];
          s.ignoredOut.push(pending.id);
          moveLadder(c.id, 1, true);
        }
      }
      if (s.ended) return;
      // 這一步結束時停在某個聊天室，裡面等回的訊息就算看到了
      s.readAwaiting = s.readAwaiting.filter((id) => s.awaiting.includes(id));
      for (const id of s.awaiting) {
        const e = events.get(id);
        if (e?.kind !== 'message' || e.thread !== here || s.ignoredOut.includes(id)) continue;
        if (!s.readAwaiting.includes(id)) s.readAwaiting.push(id);
        s.ignoring[e.from] ??= { count: -1, nudged: false };
      }
      for (const who of Object.keys(s.ignoring)) if (!pendingOf(who)) delete s.ignoring[who];
    };

    const done = (): StepResult => {
      if (!s.ended) readIgnore();
      if (!s.ended) gainCards();
      return { state: s, outcomes: out };
    };

    // ── 動作 ──

    if (s.phase === 'ended') return invalid('遊戲已經結束');

    if (s.phase === 'cover') {
      if (action.type !== 'sendCover') return invalid('要先送出開局那句話');
      s.phase = 'play';
      const thread = meta.coverThread ?? content.threads[0]?.id;
      if (thread) {
        // 送出那句話的人一定已經打開了那個聊天室
        for (const app of chatApps) if (!s.openedApps.includes(app)) s.openedApps.push(app);
        if (!s.readThreads.includes(thread)) s.readThreads.push(thread);
        // 舊訊息只算畫面上看得到的那幾則（沒說就當整串都看到了），其餘的要往上滑
        const history = historyItems(thread);
        see(action.visible ? history.filter((id) => action.visible?.includes(id)) : history);
        say(thread, meta.coverStory);
      }
      for (const id of meta.afterCover ?? []) fire(id);
      apply(meta.afterCoverEffects, false);
      spend(cost.send);
      return done();
    }

    /** 沒按任何按鈕就讓視窗消失：關掉它，或放著去做別的事 */
    const ignorePrompt = () => {
      const e = s.prompt ? events.get(s.prompt) : undefined;
      if (!s.prompt) return;
      out.push({ kind: 'promptClosed', event: s.prompt, ignored: true });
      s.prompt = null;
      if (e?.kind === 'system') apply(e.onTimeout, true);
    };

    if (s.prompt && action.type === 'answerPrompt') {
      const e = events.get(s.prompt);
      if (action.option === null || e?.kind !== 'system') {
        ignorePrompt();
        return done();
      }
      const option = e.options?.find((o) => o.id === action.option);
      if (!option) return invalid('沒有這個按鈕');
      // 軟牆按鈕：只提醒，不關視窗、不耗電
      const hints = option.hints ?? [];
      if (hints.length) {
        out.push({ kind: 'promptHint', event: e.id, text: hints[s.promptHintIndex % hints.length] });
        s.promptHintIndex += 1;
        return done();
      }
      out.push({ kind: 'promptClosed', event: e.id, ignored: false });
      s.prompt = null;
      apply(option.effects, true);
      return done();
    }
    // 視窗開著的時候去做別的事，等於不理它
    if (s.prompt) ignorePrompt();

    switch (action.type) {
      case 'sendCover':
        return invalid('開局那句話已經送出了');

      case 'answerPrompt':
        return invalid('現在沒有系統視窗');

      case 'openApp': {
        const app = content.apps.apps.find((a) => a.id === action.app);
        if (!app) return invalid('沒有這個 App');
        const first = !s.openedApps.includes(app.id);
        if (first) s.openedApps.push(app.id);
        out.push({ kind: 'app', app: app.id, first });
        if (app.view === 'assistant') s.assistantUnread = false;
        const page = pageItems(s, app.id);
        if (scrollApp(app.id)) see(action.visible ? page.filter((id) => action.visible?.includes(id)) : page, true);
        else see(page);
        if (app.background) {
          s.wanderStreak += 1;
          const w = meta.wander;
          if (w && w.hints.length && s.wanderStreak >= w.after) {
            out.push({ kind: 'wander', text: w.hints[s.wanderIndex % w.hints.length] });
            s.wanderIndex += 1;
            s.wanderStreak = 0;
          }
        } else s.wanderStreak = 0;
        if (first) spend(openCost(app));
        return done();
      }

      case 'seeItems': {
        if (!s.openedApps.includes(action.app)) return invalid('要先打開這個 App');
        if (!scrollApp(action.app)) return invalid('這個 App 裡的東西不是滑到就算看過');
        // 頁面上本來就有的，加上後來才冒出來、還等著被看的
        const here = [...pageItems(s, action.app), ...s.unopened.filter((id) => items.get(id)?.app === action.app)];
        see(here.filter((id) => action.items.includes(id)), true);
        return done();
      }

      case 'readThread': {
        if (!threads.has(action.thread)) return invalid('沒有這個聊天室');
        if (!chatApps.some((a) => s.openedApps.includes(a))) return invalid('要先打開聊天的 App');
        const first = !s.readThreads.includes(action.thread);
        if (first) s.readThreads.push(action.thread);
        s.wanderStreak = 0;
        out.push({ kind: 'thread', thread: action.thread, first });
        const history = historyItems(action.thread);
        see(action.visible ? history.filter((id) => action.visible?.includes(id)) : history);
        if (first) spend(cost.readThread);
        return done();
      }

      case 'seeMessages': {
        if (!threads.has(action.thread)) return invalid('沒有這個聊天室');
        if (!s.readThreads.includes(action.thread)) return invalid('要先打開這個聊天室');
        see(historyItems(action.thread).filter((id) => action.items.includes(id)));
        return done();
      }

      case 'locate': {
        if (!s.openedApps.includes(action.app)) return invalid('要先打開這個 App');
        const hidden = content.items.filter((i) => i.app === action.app && i.needsLocate && !i.hidden);
        if (hidden.length === 0) return invalid('這個 App 沒有可以定位的東西');
        if (s.located.includes(action.app)) return invalid('已經定位過了');
        s.located.push(action.app);
        see(hidden.map((i) => i.id));
        spend(cost.locate);
        return done();
      }

      case 'viewImage': {
        const item = items.get(action.item);
        if (!item?.image || !(s.seen.includes(item.id) || s.unopened.includes(item.id))) return invalid('現在看不到這張照片');
        if (!s.viewedImages.includes(item.id)) s.viewedImages.push(item.id);
        s.unopened = s.unopened.filter((id) => id !== item.id);
        out.push({ kind: 'image', item: item.id });
        see([item.id]);
        return done();
      }

      case 'viewProfile': {
        const character = characters.get(action.character);
        if (!character) return invalid('沒有這個人');
        out.push({ kind: 'profile', character: character.id });
        if (character.bioItem) see([character.bioItem]);
        return done();
      }

      case 'reply': {
        const e = events.get(action.event);
        if (!e || e.kind !== 'message' || !s.awaiting.includes(e.id)) return invalid('這則訊息現在不能回');
        if (!s.readThreads.includes(e.thread)) return invalid('要先讀那個聊天室');
        const option = e.options?.find((o) => o.id === action.option);
        if (!option) return invalid('沒有這個回覆選項');
        s.awaiting = s.awaiting.filter((id) => id !== e.id);
        say(e.thread, option.text);
        attend(e.from);
        hear(e.thread, e.from, option.reply ?? [], option.signal);
        see(option.reveals ?? []);
        apply(option.effects, true);
        spend(cost.send);
        return done();
      }

      case 'spot': {
        const concern = s.concerns.find((x) => x.card === action.card);
        const card = cards.get(action.card);
        const spot = card ? spotOf(card) : null;
        if (!concern || !card || !spot) return invalid('這不是現在在意的地方');
        if (!spot.options.some((o) => o.id === action.option) || concern.tried.includes(action.option)) return invalid('不能指這一項');
        const right = isRightSpot(spot, action.option);
        out.push({ kind: 'spot', card: card.id, option: action.option, right });
        if (right) {
          s.concerns = s.concerns.filter((x) => x !== concern);
          s.cards.push(card.id);
          out.push({ kind: 'cards', cards: [card.id], via: 'found' });
        } else {
          concern.tried.push(action.option);
          spend(spotMissCost);
        }
        return done();
      }

      case 'test': {
        const card = cards.get(action.card);
        if (!card || !s.cards.includes(card.id)) return invalid('手上沒有這張牌');
        const thread = testThread(card, action.target);
        if (!thread) return invalid('這張牌不能拿去問這個人');
        if (!s.readThreads.includes(thread)) return invalid('要先讀那個聊天室');
        const key = `${card.id}>${action.target}`;
        if (s.cardsUsed.includes(key)) return invalid('這張牌已經問過這個人了');
        s.cardsUsed.push(key);
        attend(action.target);
        say(thread, card.sayTo?.[action.target] ?? card.say ?? '');
        const reaction = content.reactions.find((r) => r.card === card.id && r.target === action.target && holds(s, r.when));
        if (reaction) {
          hear(thread, action.target, reaction.reply, reaction.signal);
          for (const o of reaction.others ?? []) hear(thread, o.from, o.reply, o.signal);
          see(reaction.reveals ?? []);
          apply(reaction.effects, true);
          for (const id of reaction.triggers ?? []) fire(id);
        } else {
          const generic = characters.get(action.target)?.genericReplies ?? [];
          if (generic.length) {
            const index = s.genericIndex[action.target] ?? 0;
            hear(thread, action.target, generic[index % generic.length]);
            s.genericIndex[action.target] = index + 1;
          }
        }
        spend(testCost);
        return done();
      }

      case 'think': {
        const card = cards.get(action.card);
        if (!card || !(s.cards.includes(card.id) || s.concerns.some((x) => x.card === card.id))) return invalid('手上沒有這個疑點');
        const lines = card.hints ?? [];
        const index = s.hints[card.id] ?? 0;
        if (index >= lines.length) return invalid('這個疑點沒有更多可以想的了');
        s.hints[card.id] = index + 1;
        out.push({ kind: 'hint', card: card.id, index, text: lines[index], more: index + 1 < lines.length });
        spend(cost.hint ?? 0);
        return done();
      }

      case 'answerChallenge': {
        const ch = content.endings.challenge;
        if (submitAll) return invalid('這個案子要整份填好再交出去');
        const question = sequence[s.accusation.step];
        if (question === undefined) return invalid('現在沒有題目要回答');
        if (question === 'who') {
          if (!ch.suspects.includes(action.answer)) return invalid('不能指認這個人');
          const right = action.answer === ch.culprit;
          out.push({ kind: 'challengeAnswer', question, answer: action.answer, right, cost: 0 });
          if (right) {
            s.accusation.step += 1;
            return done();
          }
          // 人指錯了：不等其他題，直接進那個人的結局
          const ending = content.endings.endings.find(
            (e) => e.trigger.kind === 'challenge' && e.trigger.accused === action.answer && holds(s, { flags: e.trigger.flags }),
          );
          if (!ending) return invalid('沒有對應的結局');
          end(ending.id);
          return done();
        }
        const field = ch.fields.find((f) => f.id === question);
        if (!field) return invalid('沒有這一題');
        const tried = s.accusation.tried[question] ?? [];
        // 用手上已經成立的疑點回答；還在「在意的地方」階段的不算
        if (!s.cards.includes(action.answer)) return invalid('只能選已經成立的疑點');
        if (tried.includes(action.answer)) return invalid('這一張已經選過了');
        const right = field.cards.includes(action.answer);
        const retry = right ? 0 : (cost.challengeRetry ?? 0);
        out.push({ kind: 'challengeAnswer', question, answer: action.answer, right, cost: retry });
        if (right) s.accusation.step += 1;
        else {
          s.accusation.tried[question] = [...tried, action.answer];
          s.challengeTries += 1;
          spend(retry);
        }
        return done();
      }

      case 'fillChallenge': {
        const ch = content.endings.challenge;
        if (!submitAll) return invalid('這個案子是一題一題回答');
        if (s.accusation.step >= sequence.length) return invalid('已經交出去了，只剩選交給誰');
        if (!sequence.includes(action.question)) return invalid('沒有這一格');
        if (action.answer === null) delete s.accusation.slots[action.question];
        else {
          const ok = action.question === 'who' ? ch.suspects.includes(action.answer) : s.cards.includes(action.answer);
          if (!ok) return invalid(action.question === 'who' ? '不能指認這個人' : '只能放已經成立的疑點');
          s.accusation.slots[action.question] = action.answer;
        }
        return done();
      }

      case 'submitChallenge': {
        const ch = content.endings.challenge;
        if (!submitAll) return invalid('這個案子是一題一題回答');
        if (s.accusation.step >= sequence.length) return invalid('已經交出去了，只剩選交給誰');
        const slots = s.accusation.slots;
        if (sequence.some((q) => slots[q] === undefined)) return invalid('每一格都要填');
        const who = sequence.includes('who') ? slots.who : ch.culprit;
        if (who !== ch.culprit) {
          // 人指錯了：直接進那個人的結局
          const ending = content.endings.endings.find((e) => e.trigger.kind === 'challenge' && e.trigger.accused === who && holds(s, { flags: e.trigger.flags }));
          if (!ending) return invalid('沒有對應的結局');
          end(ending.id);
          return done();
        }
        const wrong = ch.fields.filter((f) => sequence.includes(f.id) && !f.cards.includes(slots[f.id])).map((f) => f.id);
        if (wrong.length) {
          const retry = cost.challengeRetry ?? 0;
          s.challengeTries += 1;
          out.push({ kind: 'challengeRejected', fields: wrong, cost: retry });
          spend(retry);
          return done();
        }
        s.accusation.step = sequence.length;
        out.push({ kind: 'challengePassed' });
        return done();
      }

      case 'handOver': {
        const ch = content.endings.challenge;
        if (s.accusation.step < sequence.length) return invalid('還有題目沒答完');
        if (!ch.recipients.includes(action.givenTo)) return invalid('不能交給這個人');
        const ending = content.endings.endings.find(
          (e) =>
            e.trigger.kind === 'challenge' &&
            (e.trigger.accused === undefined || e.trigger.accused === ch.culprit) &&
            (e.trigger.givenTo === undefined || e.trigger.givenTo === action.givenTo) &&
            holds(s, { flags: e.trigger.flags }),
        );
        if (!ending) return invalid('沒有對應的結局');
        end(ending.id);
        return done();
      }
    }
  }

  /** 一題一題問的時候，現在問到哪一題、還能選什麼 */
  function askOf(s: GameState): NonNullable<Menu['challenge']>['ask'] {
    const ch = content.endings.challenge;
    const retryCost = cost.challengeRetry ?? 0;
    const optionsOf = (q: string | null, tried: string[] = []) => (q === null ? ch.recipients : q === 'who' ? ch.suspects : s.cards.filter((id) => !tried.includes(id)));
    if (submitAll) {
      // 一次交卷：通過之前指向第一個還沒填的格子（畫面請照 form 畫），通過之後是選交給誰
      const passed = s.accusation.step >= sequence.length;
      const index = passed ? sequence.length : Math.max(0, sequence.findIndex((q) => s.accusation.slots[q] === undefined));
      const question = passed ? null : sequence[index];
      return { index, total: sequence.length, question, options: optionsOf(question), retryCost };
    }
    const question = sequence[s.accusation.step] ?? null;
    return { index: s.accusation.step, total: sequence.length, question, options: optionsOf(question, question ? (s.accusation.tried[question] ?? []) : []), retryCost };
  }

  function formOf(s: GameState): NonNullable<Menu['challenge']>['form'] {
    if (!submitAll) return null;
    const ch = content.endings.challenge;
    const slots = sequence.map((question) => ({
      question,
      answer: s.accusation.slots[question] ?? null,
      options: question === 'who' ? ch.suspects : [...s.cards],
    }));
    return { slots, ready: slots.every((x) => x.answer !== null), passed: s.accusation.step >= sequence.length, retryCost: cost.challengeRetry ?? 0 };
  }

  function historyItems(thread: ThreadId): ItemId[] {
    return (threads.get(thread)?.history ?? []).flatMap((m) => (m.item ? [m.item] : []));
  }

  function menu(s: GameState): Menu {
    const empty: Menu = { cover: false, prompt: null, apps: [], threads: [], locate: [], images: [], assistantUnread: false, profiles: [], concerns: [], replies: [], tests: [], thoughts: [], challenge: null };
    if (s.phase === 'ended') return empty;
    if (s.phase === 'cover') return { ...empty, cover: true };
    const chatOpen = chatApps.some((a) => s.openedApps.includes(a));
    const promptEvent = s.prompt ? events.get(s.prompt) : undefined;
    return {
      cover: false,
      prompt: s.prompt ? { event: s.prompt, options: promptEvent?.kind === 'system' ? (promptEvent.options ?? []).map((o) => o.id) : [] } : null,
      apps: content.apps.apps.map((a) => {
        const opened = s.openedApps.includes(a.id);
        const unseen = scrollApp(a.id) ? pageItems(s, a.id).filter((id) => !s.seen.includes(id)) : [];
        return { app: a.id, opened, cost: opened ? 0 : openCost(a), unseen };
      }),
      threads: chatOpen
        ? content.threads.map((t) => {
            const read = s.readThreads.includes(t.id);
            const unseen = historyItems(t.id).filter((id) => !s.seen.includes(id) && !s.unopened.includes(id));
            return { thread: t.id, read, cost: read ? 0 : cost.readThread, unseen };
          })
        : [],
      assistantUnread: s.assistantUnread,
      profiles: content.characters.flatMap((c) => {
        const item = c.bioItem;
        if (!item || !items.has(item)) return [];
        const met = content.threads.some((t) => t.members.includes(c.id) && s.readThreads.includes(t.id));
        return met ? [{ character: c.id, item, seen: s.seen.includes(item) }] : [];
      }),
      locate: s.openedApps
        .filter((a) => !s.located.includes(a) && content.items.some((i) => i.app === a && i.needsLocate && !i.hidden))
        .map((app) => ({ app, cost: cost.locate })),
      images: [...s.seen, ...s.unopened].filter((id) => items.get(id)?.image),
      concerns: s.concerns.flatMap((x) => {
        const card = cards.get(x.card);
        const spot = card ? spotOf(card) : null;
        if (!spot) return [];
        return [{ card: x.card, item: spot.item, options: spot.options.map((o) => o.id).filter((id) => !x.tried.includes(id)), missCost: spotMissCost }];
      }),
      replies: s.awaiting.flatMap((id) => {
        const e = events.get(id);
        if (!e || e.kind !== 'message' || !s.readThreads.includes(e.thread)) return [];
        return [{ event: id, thread: e.thread, options: (e.options ?? []).map((o) => o.id), cost: cost.send }];
      }),
      tests: s.cards.flatMap((id) => {
        const card = cards.get(id);
        if (!card) return [];
        const targets = content.characters
          .map((c) => c.id)
          .filter((t) => {
            const thread = testThread(card, t);
            return thread !== null && s.readThreads.includes(thread) && !s.cardsUsed.includes(`${id}>${t}`);
          });
        const threadOf = Object.fromEntries(targets.flatMap((t) => {
          const thread = testThread(card, t);
          return thread ? [[t, thread]] : [];
        }));
        return targets.length ? [{ card: id, threadOf, targets, cost: testCost }] : [];
      }),
      thoughts: [...s.concerns.map((x) => ({ id: x.card, concern: true })), ...s.cards.map((id) => ({ id, concern: false }))].flatMap((x) => {
        const card = cards.get(x.id);
        if (!card) return [];
        const lines = card.hints ?? [];
        const given = Math.min(s.hints[x.id] ?? 0, lines.length);
        return [{ card: x.id, concern: x.concern, thinkOnly: isThinkOnly(card), shown: lines.slice(0, given), more: given < lines.length, cost: cost.hint ?? 0 }];
      }),
      challenge: s.cards.length ? { ask: askOf(s), form: formOf(s) } : null,
    };
  }

  return { content, rules, start, step, menu, testThread, holds };
}
