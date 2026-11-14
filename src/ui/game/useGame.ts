import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCase } from '../../content';
import { createEngine, spotOf, type Action, type Engine, type GameState, type Outcome } from '../../engine';
import { S } from '../strings';
import type { IconId, IntroSegment, Nav, PhoneActions, PhoneData } from '../types';
import { buildPhoneData, EMPTY_UI, newVoiceLines, type GameUi } from './view';

// 把畫面接到遊戲規則上的控制器。
// 規則全部在 src/engine：這裡只做三件事——把玩家的點擊變成動作交給 engine、
// 把 engine 回報的結果變成畫面上的反應、記住只跟呈現有關的東西（訊息一則一則出現、未讀、通知）。

export type GameStage = 'intro' | 'phone' | 'ended' | 'error';

/** 對方的訊息隔多久出現一則（毫秒）。只是呈現的節奏，跟規則無關 */
const MESSAGE_GAP = 1100;

interface Session {
  game: GameState;
  ui: GameUi;
}

function boot(caseId: string): { engine: Engine } | { error: string } {
  try {
    return { engine: createEngine(loadCase(caseId)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

let noticeSeq = 0;
const notice = (text: string) => ({ id: (noticeSeq += 1), text });

/** 每次狀態變了之後整理畫面這一側：自己送出的訊息立刻顯示、記下新的心聲、更新已讀位置 */
function settle(engine: Engine, game: GameState, ui: GameUi, announce: boolean): GameUi {
  const self = engine.content.meta.self?.id ?? '';
  const revealed = { ...ui.revealed };
  for (const [id, t] of Object.entries(game.threads)) {
    let r = Math.min(revealed[id] ?? 0, t.appended.length);
    while (r < t.appended.length && t.appended[r].from === self) r += 1;
    revealed[id] = r;
  }
  const noticed = ui.openThread ? { ...ui.noticed, [ui.openThread]: revealed[ui.openThread] ?? 0 } : ui.noticed;
  let next: GameUi = { ...ui, revealed, noticed };
  const fresh = newVoiceLines(engine, game, next);
  if (fresh.length) {
    next = { ...next, voiceLog: [...next.voiceLog, ...fresh] };
    // 一次冒出好幾句時只跳一則通知，其餘在 Suru 裡看
    if (announce && !next.notice) next = { ...next, notice: notice(fresh[0].text) };
  }
  return next;
}

function reactTo(engine: Engine, ui: GameUi, outcomes: Outcome[]): GameUi {
  const content = engine.content;
  let next = { ...ui, notice: undefined as GameUi['notice'] };
  for (const o of outcomes) {
    if (o.kind === 'wander' || o.kind === 'promptHint') next.notice = notice(o.text);
    else if (o.kind === 'invalid') next.notice = notice(o.reason);
    else if (o.kind === 'cards' && o.via === 'found') {
      const title = content.cards.find((c) => c.id === o.cards[0])?.title;
      if (title) next.notice = notice(`${S.foundCard}${title}${S.foundCardHint}`);
    } else if (o.kind === 'spot' && !o.right) {
      const card = content.cards.find((c) => c.id === o.card);
      const miss = card ? spotOf(card)?.miss : undefined;
      if (miss) next.notice = notice(miss);
    } else if (o.kind === 'challengeAnswer' && !o.right) {
      const hint = content.endings.challenge.fields.find((f) => f.id === o.question)?.hint;
      if (hint) next.notice = notice(hint);
    }
  }
  return next;
}

export function useGame(caseId = 'case01') {
  const booted = useMemo(() => boot(caseId), [caseId]);
  const engine = 'engine' in booted ? booted.engine : null;
  const [session, setSession] = useState<Session | null>(() => (engine ? { game: engine.start(), ui: EMPTY_UI } : null));
  const [introDone, setIntroDone] = useState(false);
  const [run, setRun] = useState(0);
  const latest = useRef(session);
  latest.current = session;

  const update = (fn: (s: Session) => Session) => {
    if (!latest.current) return;
    const next = fn(latest.current);
    latest.current = next;
    setSession(next);
  };

  const act = (action: Action): Outcome[] => {
    if (!engine || !latest.current) return [];
    const { state, outcomes } = engine.step(latest.current.game, action);
    update((s) => ({ game: state, ui: settle(engine, state, reactTo(engine, s.ui, outcomes), true) }));
    return outcomes;
  };

  // 對方的新訊息一則一則出現
  const pending = !!session && Object.entries(session.game.threads).some(([id, t]) => (session.ui.revealed[id] ?? 0) < t.appended.length);
  useEffect(() => {
    if (!engine || !pending) return;
    const timer = window.setTimeout(() => {
      update((s) => {
        const revealed = { ...s.ui.revealed };
        for (const [id, t] of Object.entries(s.game.threads)) if ((revealed[id] ?? 0) < t.appended.length) revealed[id] = (revealed[id] ?? 0) + 1;
        return { game: s.game, ui: settle(engine, s.game, { ...s.ui, revealed }, false) };
      });
    }, MESSAGE_GAP);
    return () => window.clearTimeout(timer);
    // session 每次變動都重新排下一則
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, pending, session]);

  const data: PhoneData | null = useMemo(() => (engine && session ? buildPhoneData(engine, session.game, session.ui) : null), [engine, session]);

  const actions: PhoneActions = useMemo(() => {
    const playing = () => latest.current?.game.phase === 'play';
    const mapApp = engine?.content.apps.apps.find((a) => a.view === 'map')?.id;
    return {
      onOpenApp: (appId) => {
        if (playing()) act({ type: 'openApp', app: appId });
      },
      onOpenThread: (threadId) => {
        // 跟案情無關的聊天室不在規則裡，只是打開來看
        if (!engine?.content.threads.some((t) => t.id === threadId)) return;
        if (playing()) act({ type: 'readThread', thread: threadId });
      },
      onChooseReply: (_threadId, optionId) => {
        const [event, option] = optionId.split('::');
        act({ type: 'reply', event, option });
      },
      onSendPrefill: () => {
        act({ type: 'sendCover' });
      },
      onOpenRow: () => {},
      onCall: () => update((s) => ({ game: s.game, ui: { ...s.ui, notice: notice(S.callBlocked) } })),
      onOpenSuru: () => update((s) => ({ game: s.game, ui: { ...s.ui, voiceRead: s.ui.voiceLog.length } })),
      onDismissNotice: () => update((s) => ({ game: s.game, ui: { ...s.ui, notice: undefined } })),
      onLocate: () => {
        if (mapApp && playing()) act({ type: 'locate', app: mapApp });
      },
      onViewImage: (itemId) => {
        if (playing() && engine?.menu(latest.current!.game).images.includes(itemId)) act({ type: 'viewImage', item: itemId });
      },
      onNavigate: (nav: Nav) =>
        update((s) => {
          const chat = engine?.content.apps.apps.find((a) => a.id === nav.app)?.view === 'chat';
          const real = chat && engine?.content.threads.some((t) => t.id === nav.detail);
          const openThread = real ? nav.detail : null;
          const noticed = openThread ? { ...s.ui.noticed, [openThread]: s.ui.revealed[openThread] ?? 0 } : s.ui.noticed;
          return { game: s.game, ui: { ...s.ui, openThread, noticed } };
        }),
      onAccuseAnswer: () => {},
    };
    // act 和 update 只讀 latest，不需要重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const content = engine?.content;
  const ended = session?.game.phase === 'ended' ? content?.endings.endings.find((e) => e.id === session.game.ended) : undefined;
  const stage: GameStage = !engine || !session ? 'error' : !introDone ? 'intro' : ended ? 'ended' : 'phone';
  const chatApp = content?.apps.apps.find((a) => a.view === 'chat')?.id ?? null;

  return {
    stage,
    run,
    error: 'error' in booted ? booted.error : undefined,
    battery: Math.ceil(session?.game.battery ?? 0),
    startBattery: content?.meta.battery.start ?? 1,
    data,
    actions,
    intro: (content?.meta.intro ?? []) as IntroSegment[],
    afterIntro: { app: chatApp, detail: content?.meta.coverThread ?? null } as Nav,
    ending: ended ? { title: ended.title, text: ended.text } : undefined,
    /** 開場的通知段落要用哪個 App 的圖示：標籤開頭是 App 的名字就用它的；講到來電就用電話的 */
    noticeIcon: (label: string): IconId | undefined => {
      const apps = content?.apps.apps ?? [];
      const hit = apps.find((x) => label.startsWith(x.name)) ?? (label.includes(S.missedCall) ? apps.find((x) => x.id === 'phone') : undefined);
      return hit?.icon as IconId | undefined;
    },
    finishIntro: () => setIntroDone(true),
    restart: () => {
      if (!engine) return;
      const fresh = { game: engine.start(), ui: EMPTY_UI };
      latest.current = fresh;
      setSession(fresh);
      setIntroDone(false);
      setRun((n) => n + 1);
    },
    /** 開發面板用：直接改電量，看畫面在不同電量下的樣子 */
    setBattery: (value: number) =>
      update((s) => {
        const battery = Math.max(1, Math.min(s.game.battery + s.game.spent, value));
        return { game: { ...s.game, battery, spent: s.game.battery + s.game.spent - battery }, ui: s.ui };
      }),
  };
}
