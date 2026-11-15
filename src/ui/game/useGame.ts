import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCase } from '../../content';
import { playSound, stopAllSounds, stopSound, unlockSound } from '../sound';
import { createEngine, endingText, isSolvedEnding, isWeakEnding, spotOf, type Action, type Engine, type GameState, type Outcome } from '../../engine';
import { S } from '../strings';
import type { IconId, IntroSegment, Nav, PhoneActions, PhoneData } from '../types';
import { clearSave, fingerprint, loadSave, writeSave } from './save';
import { buildPhoneData, EMPTY_UI, markNoReply, type GameUi } from './view';

// 把畫面接到遊戲規則上的控制器。
// 規則全部在 src/engine：這裡只做三件事——把玩家的點擊變成動作交給 engine、
// 把 engine 回報的結果變成畫面上的反應、記住只跟呈現有關的東西（訊息一則一則出現、未讀、通知）。

export type GameStage = 'intro' | 'phone' | 'ended' | 'error';

/** 對方的訊息隔多久出現一則（毫秒）。只是呈現的節奏，跟規則無關 */
const MESSAGE_GAP = 1100;
/** 好幾則通知排隊時，每一則至少停多久才換下一則（毫秒） */
const NOTICE_GAP = 1500;

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

/** 聊天 App 的新訊息通知：App 的名字和圖示、誰傳的（群組的話帶上群組名）、內容 */
function messageNotice(engine: Engine, threadId: string, from: string, lines: string[] | string | undefined): GameUi['notice'] {
  // 一則訊息可能是連續好幾句，通知上只放最後一句
  const list = (Array.isArray(lines) ? lines : [lines ?? '']).filter((x) => x.trim());
  const text = list[list.length - 1];
  const content = engine.content;
  const app = content.apps.apps.find((a) => a.view === 'chat');
  const thread = content.threads.find((t) => t.id === threadId);
  if (!app || !thread) return undefined;
  const name = content.characters.find((c) => c.id === from)?.name ?? from;
  const title = thread.members.length > 1 ? `${name}・${thread.title}` : name;
  return { ...notice(text ?? S.noticePhoto), message: { appId: app.id, appName: app.name, icon: app.icon as IconId, title, threadId } };
}

/** 每次狀態變了之後整理畫面這一側：自己送出的訊息立刻顯示、更新已讀位置 */
function settle(engine: Engine, game: GameState, ui: GameUi): GameUi {
  const self = engine.content.meta.self?.id ?? '';
  const revealed = { ...ui.revealed };
  for (const [id, t] of Object.entries(game.threads)) {
    let r = Math.min(revealed[id] ?? 0, t.appended.length);
    while (r < t.appended.length && t.appended[r].from === self) r += 1;
    revealed[id] = r;
  }
  const noticed = ui.openThread ? { ...ui.noticed, [ui.openThread]: revealed[ui.openThread] ?? 0 } : ui.noticed;
  const next: GameUi = { ...ui, revealed, noticed };
  return next;
}

function reactTo(engine: Engine, ui: GameUi, outcomes: Outcome[]): GameUi {
  const content = engine.content;
  const next = { ...ui };
  for (const o of outcomes) {
    if (o.kind === 'wander' || o.kind === 'promptHint') next.notice = notice(o.text);
    else if (o.kind === 'invalid') next.notice = notice(o.reason);
    else if (o.kind === 'spot' && !o.right) {
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

/**
 * 這一步該出什麼聲音：看規則回報的結果和前後的狀態。規則本身不知道有聲音。
 * 訊息、群組、按鈕、提示都不出聲。
 */
function soundFor(engine: Engine, before: GameState, after: GameState, outcomes: Outcome[]) {
  // 新出現「在意的地方」
  if (after.concerns.some((c) => !before.concerns.some((x) => x.card === c.card))) playSound('clue_spotted');
  for (const o of outcomes) {
    if (o.kind === 'spot') playSound(o.right ? 'clue_found' : 'clue_wrong');
    else if (o.kind === 'call') playSound('call_ring');
    else if (o.kind === 'callEnded') stopSound('call_ring');
    else if (o.kind === 'prompt') playSound('login_alert');
    else if (o.kind === 'challengePassed') playSound('solved');
    else if (o.kind === 'ending') {
      stopSound('call_ring');
      const ending = engine.content.endings.endings.find((e) => e.id === o.ending);
      if (!ending) continue;
      if (ending.trigger.kind === 'battery') playSound('power_off');
      else if (!isSolvedEnding(engine.content, ending)) playSound('case_failed');
    }
  }
}

export function useGame(caseId = 'case01') {
  const booted = useMemo(() => boot(caseId), [caseId]);
  const engine = 'engine' in booted ? booted.engine : null;
  // 存檔的版本：案件資料的指紋。資料改過，舊存檔就不讀
  const version = useMemo(() => (engine ? fingerprint(engine.content) : ''), [engine]);
  // 開啟時有存檔就接著玩。通知和「正開著哪個聊天室」是當下的事，不帶回來
  const resumed = useMemo(() => (engine ? loadSave(caseId, version) : null), [engine, caseId, version]);
  const [session, setSession] = useState<Session | null>(() => {
    if (!engine) return null;
    if (resumed) return { game: resumed.game, ui: { ...EMPTY_UI, ...resumed.ui, notice: undefined, openThread: null } };
    return { game: engine.start(), ui: EMPTY_UI };
  });
  const [introDone, setIntroDone] = useState(() => !!resumed?.introDone);
  // 開發用：現在這個結局是不是用 DEV 工具直接跳進來的（狀態是假的）
  const [devEnded, setDevEnded] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  // 這一輪是不是從存檔接回來、而且已經過了開局：是的話回到主畫面，不是停在群組
  const [resumedInPlay, setResumedInPlay] = useState(() => !!resumed?.introDone && resumed.game.phase !== 'cover');
  const latest = useRef(session);
  const inIntro = useRef(!introDone);
  inIntro.current = !introDone;
  const runNow = useRef(run);
  runNow.current = run;
  // 這一輪的開場已經播過喚醒聲了沒：重播開場、重新開始都是新的一輪，第一次點畫面要再響一次
  const wokeRun = useRef<number | null>(null);
  useEffect(() => {
    const first = () => {
      // 每次點都試著把聲音環境叫醒（第一次是建立；之後是手機鎖過螢幕、切過 App 被暫停時恢復）
      unlockSound();
      if (inIntro.current && wokeRun.current !== runNow.current) {
        wokeRun.current = runNow.current;
        playSound('wake');
      }
    };
    document.addEventListener('click', first, true);
    document.addEventListener('keydown', first, true);
    return () => {
      document.removeEventListener('click', first, true);
      document.removeEventListener('keydown', first, true);
      stopAllSounds();
    };
  }, []);
  // 開局還沒送出那句話之前，群組裡已經捲進畫面的舊訊息。送出時一起告訴規則
  const coverSeen = useRef(new Set<string>(resumed?.coverSeen ?? []));
  latest.current = session;

  const update = (fn: (s: Session) => Session) => {
    if (!latest.current) return;
    const next = fn(latest.current);
    latest.current = next;
    setSession(next);
  };

  // 等著跳出來的新訊息通知，以及「上一則還要再停一下」的計時
  const noticeQueue = useRef<NonNullable<GameUi['notice']>[]>([]);
  const noticeTimer = useRef<number | undefined>(undefined);
  const drainNotices = () => {
    if (noticeTimer.current !== undefined) return;
    let next = noticeQueue.current.shift();
    // 輪到它的時候，人已經在那個聊天室裡了，就不用跳
    while (next && next.message?.threadId === latest.current?.ui.openThread) next = noticeQueue.current.shift();
    if (!next) return;
    const shown = next;
    update((s) => ({ game: s.game, ui: { ...s.ui, notice: shown } }));
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = undefined;
      drainNotices();
    }, NOTICE_GAP);
  };
  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = undefined;
    },
    [],
  );

  // 來電或系統視窗擋著的時候，先留著等之後補送的動作
  const deferred = useRef<Action[]>([]);
  const act = (action: Action): Outcome[] => {
    if (!engine || !latest.current) return [];
    // 電話在響、或系統視窗開著的時候，玩家只能先處理它。
    // 畫面自己會送的小動作（捲到訊息、捲到動態）這時候先留著，等處理完再補送：
    // 電話響的時候送會被擋，視窗開著的時候送會被規則當成「不理它」而把視窗關掉
    const now = latest.current.game;
    const blocked = (now.call && action.type !== 'declineCall' && action.type !== 'letRing') || (!now.call && now.prompt && action.type !== 'answerPrompt');
    if (blocked) {
      if (action.type === 'seeMessages' || action.type === 'seeItems') deferred.current.push(action);
      return [];
    }
    const { state, outcomes } = engine.step(now, action);
    soundFor(engine, now, state, outcomes);
    update((s) => ({ game: state, ui: settle(engine, state, markNoReply(reactTo(engine, s.ui, outcomes), state, outcomes)) }));
    if (!state.call && !state.prompt && deferred.current.length) {
      const waiting = deferred.current.splice(0);
      waiting.forEach((a) => act(a));
    }
    return outcomes;
  };

  // 對方的新訊息一則一則出現
  const pending = !!session && Object.entries(session.game.threads).some(([id, t]) => (session.ui.revealed[id] ?? 0) < t.appended.length);
  useEffect(() => {
    if (!engine || !pending) return;
    const self = engine.content.meta.self?.id ?? '';
    const timer = window.setTimeout(() => {
      const incoming: NonNullable<GameUi['notice']>[] = [];
      update((s) => {
        const revealed = { ...s.ui.revealed };
        for (const [id, t] of Object.entries(s.game.threads)) {
          const at = revealed[id] ?? 0;
          if (at >= t.appended.length) continue;
          revealed[id] = at + 1;
          // 剛出現的這一則：不是自己傳的、那個聊天室又沒開著，就像手機一樣跳一則通知
          const m = t.appended[at];
          const n = m.from !== self && id !== s.ui.openThread ? messageNotice(engine, id, m.from, m.text) : undefined;
          if (n) incoming.push(n);
        }
        return { game: s.game, ui: settle(engine, s.game, { ...s.ui, revealed }) };
      });
      // 同時有好幾個人傳訊息時，通知一則接一則跳，不會只剩最後一則
      noticeQueue.current.push(...incoming);
      drainNotices();
    }, MESSAGE_GAP);
    return () => window.clearTimeout(timer);
    // session 每次變動都重新排下一則
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, pending, session]);

  // 自動存檔：進度每變一次就寫一次
  useEffect(() => {
    if (!engine || !session) return;
    const { notice: _notice, ...ui } = session.ui;
    writeSave(caseId, version, { game: session.game, ui: { ...ui, openThread: null } as GameUi, introDone, coverSeen: [...coverSeen.current] });
  }, [engine, caseId, version, session, introDone]);

  const data: PhoneData | null = useMemo(() => (engine && session ? buildPhoneData(engine, session.game, session.ui) : null), [engine, session]);

  const actions: PhoneActions = useMemo(() => {
    const playing = () => latest.current?.game.phase === 'play';
    const mapApp = engine?.content.apps.apps.find((a) => a.view === 'map')?.id;
    return {
      onOpenApp: (appId) => {
        // 動態牆這種「滑到才算看過」的 App：先說一則都還沒看到，畫出來之後再由 onSeeItems 回報。
        // 其他 App 規則不看 visible
        if (playing()) act({ type: 'openApp', app: appId, visible: [] });
      },
      onOpenThread: (threadId) => {
        // 跟案情無關的聊天室不在規則裡，只是打開來看
        if (!engine?.content.threads.some((t) => t.id === threadId)) return;
        // 打開聊天室不等於整串都看過：先告訴規則「一則都還沒看到」，
        // 聊天室畫出來之後，再由 onSeeMessages 回報實際在畫面上的那幾則
        if (playing()) act({ type: 'readThread', thread: threadId, visible: [] });
      },
      onChooseReply: (_threadId, optionId) => {
        const [event, option] = optionId.split('::');
        act({ type: 'reply', event, option });
      },
      onSendPrefill: () => {
        // 送出不等於整串舊訊息都看過：只有到目前為止真的在畫面上出現過的才算
        act({ type: 'sendCover', visible: [...coverSeen.current] });
        coverSeen.current.clear();
      },
      onOpenRow: () => {},
      onSeeMessages: (threadId, itemIds) => {
        const game = latest.current?.game;
        if (!game || itemIds.length === 0) return;
        if (game.phase !== 'play') {
          // 開局鎖在群組的時候規則還不收，先記著
          itemIds.forEach((id) => coverSeen.current.add(id));
          return;
        }
        if (!game.readThreads.includes(threadId)) return;
        // 已經算看過的不用再送
        const fresh = itemIds.filter((id) => !game.seen.includes(id) && !game.unopened.includes(id));
        if (fresh.length) act({ type: 'seeMessages', thread: threadId, items: fresh });
      },
      onSeeItems: (appId, itemIds) => {
        const game = latest.current?.game;
        if (!engine || !game || game.phase !== 'play' || !game.openedApps.includes(appId)) return;
        // 只送規則說還沒看到的那幾則；不是滑到才算的 App 這裡會是空的
        const unseen = engine.menu(game).apps.find((a) => a.app === appId)?.unseen ?? [];
        const fresh = itemIds.filter((id) => unseen.includes(id));
        if (fresh.length) act({ type: 'seeItems', app: appId, items: fresh });
      },
      onViewProfile: (memberId) => {
        // 只有案件裡的角色有個人頁面的規則；打開就算看過他的自介
        if (playing() && engine?.content.characters.some((c) => c.id === memberId)) act({ type: 'viewProfile', character: memberId });
      },
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
      onAnswerPrompt: (option) => {
        if (latest.current?.game.prompt) act({ type: 'answerPrompt', option });
      },
      onDeclineCall: () => {
        if (latest.current?.game.call) act({ type: 'declineCall' });
      },
      onLetRing: () => {
        if (latest.current?.game.call) act({ type: 'letRing' });
      },
      onAccuseFill: (slotId, answer) => {
        if (!playing()) return;
        act({ type: 'fillChallenge', question: slotId, answer });
        // 這一格改過了，上次退回的提示就收起來
        update((s) => (s.ui.accuseRejected.includes(slotId) ? { game: s.game, ui: { ...s.ui, accuseRejected: s.ui.accuseRejected.filter((x) => x !== slotId) } } : s));
      },
      onAccuseSubmit: () => {
        if (!playing()) return;
        const back = act({ type: 'submitChallenge' }).find((o) => o.kind === 'challengeRejected');
        // 被退回：記住是哪幾格站不住；通過或進結局就清掉
        const fields = back && back.kind === 'challengeRejected' ? back.fields : [];
        update((s) => ({ game: s.game, ui: { ...s.ui, accuseRejected: fields } }));
      },
      onAccuseAnswer: (stepId, value) => {
        if (!engine || !playing()) return;
        // 最後一步：把證據交給誰。交出去就進結局
        if (stepId === 'give') {
          act({ type: 'handOver', givenTo: value });
          return;
        }
        const hit = act({ type: 'answerChallenge', answer: value }).find((o) => o.kind === 'challengeAnswer');
        if (!hit || hit.kind !== 'challengeAnswer' || !hit.right) return;
        // 答對的留在上方：疑點記標題，人記名字
        const label = engine.content.cards.find((c) => c.id === value)?.title ?? engine.content.characters.find((c) => c.id === value)?.name ?? value;
        update((s) => ({ game: s.game, ui: { ...s.ui, accuseAnswers: [...s.ui.accuseAnswers, label] } }));
      },
      onSpot: (card, option) => {
        act({ type: 'spot', card, option });
      },
      onProbe: (card, target) => {
        act({ type: 'test', card, target });
      },
      onThink: (card) => {
        act({ type: 'think', card });
      },
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
    afterIntro: (resumedInPlay ? { app: null, detail: null } : { app: chatApp, detail: content?.meta.coverThread ?? null }) as Nav,
    ending:
      ended && content && session
        ? (() => {
            // 算不算破案由規則判斷：人指對、但有格子站不住的那種結局不算
            const solved = isSolvedEnding(content, ended);
            const menu = engine?.menu(session.game);
            return {
              id: ended.id,
              dev: devEnded === ended.id,
              title: ended.title,
              // 內文裡「螢幕暗下」的那一段：畫面出現到這段時播關機音、暗一下
              screenOff: ended.screenOff,
              // 內文用規則組好的：有的結局會照玩家放錯的那幾格插進對應的句子
              text: endingText(ended, session.game),
              // 內文裡有人說話的段落要配頭像：名字對到角色
              speakers: Object.fromEntries(content.characters.map((c) => [c.name, c.id])),
              // 規則說這個結局能不能回到指認之前
              canRetry: !!menu?.canRewind,
              // 破案的結局：這是第幾次指認、還剩多少電
              note: solved ? S.endingSolved.replace('{n}', String(menu?.accusations ?? 1)).replace('{battery}', String(Math.ceil(session.game.battery))) : undefined,
            };
          })()
      : undefined,
    /** 開場的通知段落要用哪個 App 的圖示：標籤開頭是 App 的名字就用它的；講到來電就用電話的 */
    noticeIcon: (label: string): IconId | undefined => {
      const apps = content?.apps.apps ?? [];
      const hit = apps.find((x) => label.startsWith(x.name)) ?? (label.includes(S.missedCall) ? apps.find((x) => x.id === 'phone') : undefined);
      return hit?.icon as IconId | undefined;
    },
    finishIntro: () => setIntroDone(true),
    /** 回到指認之前：回到交出去前那一刻，電量和進度照舊。上次被退回的提示不留 */
    rewind: () => {
      if (!latest.current) return;
      setDevEnded(null);
      act({ type: 'rewindChallenge' });
      update((s) => ({ game: s.game, ui: { ...s.ui, accuseRejected: [] } }));
    },
    restart: () => {
      if (!engine) return;
      stopAllSounds();
      setDevEnded(null);
      coverSeen.current.clear();
      noticeQueue.current = [];
      deferred.current = [];
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = undefined;
      // 重新開始：存檔清掉，從頭來
      clearSave(caseId);
      setResumedInPlay(false);
      const fresh = { game: engine.start(), ui: EMPTY_UI };
      latest.current = fresh;
      setSession(fresh);
      setIntroDone(false);
      setRun((n) => n + 1);
    },
    /** 開發面板用：所有結局的編號和標題 */
    endingList: (content?.endings.endings ?? []).map((e) => ({ id: e.id, title: e.title })),
    /**
     * 開發面板用：直接進某個結局，看結局畫面。狀態是拼出來的：
     * 指認類的結局給一個「回到指認之前」可以回去的點（就是跳進來之前的樣子，格子不一定填好）；
     * 「站不住」的結局假裝第一個有反駁句的格子放錯；破案的結局指認次數至少算 1。
     */
    devEnding: (id: string) => {
      const s = latest.current;
      const ending = content?.endings.endings.find((e) => e.id === id);
      if (!engine || !s || !ending) return;
      const base: GameState = s.game.phase === 'ended' ? (s.game.rewind ?? { ...s.game, phase: 'play', ended: null }) : s.game;
      const viaChallenge = ending.trigger.kind === 'challenge';
      const wrongFields = isWeakEnding(ending) ? Object.keys(ending.rebuttals ?? {}).slice(0, 1) : [];
      const game: GameState = {
        ...base,
        phase: 'ended',
        ended: ending.id,
        prompt: null,
        call: null,
        // 先跳過沒電的結局再跳別的，不要把 0% 帶過去
        battery: ending.trigger.kind === 'battery' ? 0 : base.battery || content!.meta.battery.start,
        accusation: { ...base.accusation, count: Math.max(1, (base.accusation.count ?? 0) + (viaChallenge ? 1 : 0)), wrongFields },
        rewind: viaChallenge ? structuredClone(base) : null,
      };
      stopAllSounds();
      // 直接跳進破案的結局會跳過「指認通過、選交給誰」那一刻，過關音在那一刻才會響，這裡補播，DEV 才聽得到
      soundFor(engine, base, game, isSolvedEnding(engine.content, ending) ? [{ kind: 'challengePassed' }, { kind: 'ending', ending: ending.id }] : [{ kind: 'ending', ending: ending.id }]);
      setIntroDone(true);
      setDevEnded(ending.id);
      update((x) => ({ game, ui: x.ui }));
    },
    /** 開發面板用：直接改電量，看畫面在不同電量下的樣子 */
    setBattery: (value: number) =>
      update((s) => {
        const battery = Math.max(1, Math.min(s.game.battery + s.game.spent, value));
        return { game: { ...s.game, battery, spent: s.game.battery + s.game.spent - battery }, ui: s.ui };
      }),
  };
}
