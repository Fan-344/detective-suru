// 自動模擬各種玩法，檢查內容「玩不玩得通」。tools/validate.ts 和測試都呼叫這裡。
// 這裡不另外寫一套規則：所有模擬都是對 engine 送動作，看它回什麼。
// （格式對不對是 src/content/validate.ts 的事；這裡管的是到不到得了。）

import type { CaseContent, ItemId } from '../content/types';
import { createEngine, routesReached, type Action, type Engine, type GameState } from '../engine';

export interface Check {
  name: string;
  ok: boolean;
  detail: string[];
}

export interface CheckResult {
  checks: Check[];
  /** 不算通過或失敗、給人看的數值觀察 */
  report: string[];
}

/** 玩法的傾向。每一種都帶隨機性，跑很多次來涵蓋各種走法。 */
// seeker：衝著「需要某個旗標才有的結局」去玩，會優先選能設下那個旗標的回覆
type Profile = 'random' | 'reader' | 'talker' | 'calm' | 'provoke' | 'silent' | 'seeker';
/** 模擬的玩家打開聊天室時，畫面上看得到最後幾則帶線索的舊訊息（真正的數字由畫面決定，這裡只是假設） */
const OPENING_VIEW = 2;
const PROFILES: Profile[] =['random', 'reader', 'talker', 'calm', 'provoke', 'silent', 'seeker'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isMessage = (a: Action) => a.type === 'reply' || a.type === 'test';

/** 目前所有能做的具體動作（不含挑戰書；比對只列資料裡有結果、還沒比過的組合） */
export function concreteActions(engine: Engine, s: GameState): Action[] {
  const m = engine.menu(s);
  if (m.cover) {
    // 開局那個群組也一樣：只看得到最後幾則，其餘的之後往上滑
    const thread = engine.content.threads.find((t) => t.id === (engine.content.meta.coverThread ?? engine.content.threads[0]?.id));
    const history = (thread?.history ?? []).flatMap((x) => (x.item ? [x.item] : []));
    return [{ type: 'sendCover', visible: history.slice(-OPENING_VIEW) }];
  }
  const list: Action[] = [];
  // 視窗不擋操作，所以它的按鈕和其他動作一起列出來
  if (m.prompt) list.push(...m.prompt.options.map((option): Action => ({ type: 'answerPrompt', option })), { type: 'answerPrompt', option: null });
  for (const a of m.apps) if (!a.opened) list.push({ type: 'openApp', app: a.app });
  // 打開聊天室只看得到最後幾則舊訊息，其餘的要往上滑（一次滑到頂）
  for (const t of m.threads) {
    if (!t.read) list.push({ type: 'readThread', thread: t.thread, visible: t.unseen.slice(-OPENING_VIEW) });
    else if (t.unseen.length) list.push({ type: 'seeMessages', thread: t.thread, items: t.unseen });
  }
  for (const l of m.locate) list.push({ type: 'locate', app: l.app });
  for (const item of m.images) if (!s.viewedImages.includes(item)) list.push({ type: 'viewImage', item });
  for (const p of m.profiles) if (!p.seen) list.push({ type: 'viewProfile', character: p.character });
  for (const c of m.concerns) for (const option of c.options) list.push({ type: 'spot', card: c.card, option });
  for (const r of m.replies) for (const option of r.options) list.push({ type: 'reply', event: r.event, option });
  for (const t of m.tests) for (const target of t.targets) list.push({ type: 'test', card: t.card, target });
  return list;
}

/** 挑戰書四欄全對的選法；手上的紀錄還不夠就回傳 null */
export function correctFields(content: CaseContent, s: GameState): Record<string, ItemId[]> | null {
  const fields: Record<string, ItemId[]> = {};
  for (const f of content.endings.challenge.fields) {
    // 一題一題問的時候一題只能用一筆回答
    const single = Boolean(content.endings.challenge.sequence?.length);
    const group = f.accept.find((g) => (!single || g.length === 1) && g.every((id) => s.seen.includes(id)));
    if (!group) return null;
    fields[f.id] = group;
  }
  return fields;
}

/** 這個動作對各角色階梯的增減總和（用來讓「安撫型」「刺激型」玩法挑選項） */
function heat(engine: Engine, s: GameState, a: Action): number {
  const { content } = engine;
  const sum = (ladder: Record<string, number> | undefined) => Object.values(ladder ?? {}).reduce((x, y) => x + y, 0);
  if (a.type === 'reply') {
    const e = content.events.find((x) => x.id === a.event);
    return e?.kind === 'message' ? sum(e.options?.find((o) => o.id === a.option)?.effects?.ladder) : 0;
  }
  if (a.type === 'test') {
    return sum(content.reactions.find((r) => r.card === a.card && r.target === a.target && engine.holds(s, r.when))?.effects?.ladder);
  }
  if (a.type === 'answerPrompt') return a.option === null ? 0 : 1;
  return 0;
}

interface Run {
  profile: Profile;
  final: GameState;
  actions: Action[];
  /** 登入視窗出現時的累計耗電與靖雯等級；沒出現是 null */
  login: { spent: number; level: number } | null;
  /** 第一次湊齊挑戰書全部正確答案時的累計耗電 */
  solvableAt: number | null;
  sentMessage: boolean;
  /** 還沒結束卻沒有任何事可做 */
  stuck: boolean;
  /** 沒有任何會耗電的事可做，而且手上的紀錄不夠破案 */
  softDead: boolean;
  usedReactions: Set<string>;
  /** 送出開局那句之後，有人升級的次數；其中因為已讀不回（或舊做法的電量）自己升的次數 */
  raises: number;
  autoRaises: number;
}

function playOnce(engine: Engine, seed: number, profile: Profile): Run {
  const { content } = engine;
  const rand = rng(seed);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const ch = content.endings.challenge;
  // 這一局的打算：會不會交卷、想指認誰、想交給誰、多有把握才交
  const flagged = content.endings.endings.flatMap((e) => (e.trigger.kind === 'challenge' && e.trigger.flags && e.trigger.givenTo ? [e.trigger] : []));
  const goal = profile === 'seeker' && flagged.length ? pick(flagged) : null;
  const goalFlags = Object.entries(goal?.flags ?? {});
  const wantsToSolve = goal !== null || rand() < 0.7;
  const accused = goal || rand() < 0.5 ? ch.culprit : pick(ch.suspects);
  const givenTo = goal?.givenTo ?? pick(ch.recipients);
  /** 這個回覆會不會設下目標結局需要的旗標 */
  const setsGoalFlag = (a: Action): boolean => {
    if (a.type !== 'reply') return false;
    const e = content.events.find((x) => x.id === a.event);
    const flags = e?.kind === 'message' ? e.options?.find((o) => o.id === a.option)?.effects?.flags : undefined;
    return goalFlags.some(([flag, value]) => flags?.[flag] === value);
  };
  const submitChance = profile === 'seeker' ? 1 : profile === 'calm' ? 0.02 : 0.08;

  /** 一題一題問的時候：已經開始指認了，之後每一步都接著答 */
  let accusing = false;

  let s = engine.start();
  const run: Run = { profile, final: s, actions: [], login: null, solvableAt: null, sentMessage: false, stuck: false, softDead: false, usedReactions: new Set(), raises: 0, autoRaises: 0 };

  for (let guard = 0; guard < 400 && s.phase !== 'ended'; guard++) {
    const everything = concreteActions(engine, s);
    const options = profile === 'silent' ? everything.filter((a) => !isMessage(a)) : everything;
    const fields = correctFields(content, s);
    if (fields && run.solvableAt === null) run.solvableAt = s.spent;
    const costly = options.filter((a) => a.type !== 'viewImage');
    const canChallenge = engine.menu(s).challenge !== null;

    let action: Action | null = null;
    if (canChallenge && s.phase === 'play' && !s.prompt) {
      const ready = (accused !== ch.culprit || fields !== null) && goalFlags.every(([flag, value]) => (s.flags[flag] ?? false) === value);
      const nothingLeft = costly.length === 0;
      // 死路要看「遊戲還允許做什麼」，不是這種玩法自己願意做什麼
      if (!fields && everything.every((a) => a.type === 'viewImage')) run.softDead = true;
      const ask = engine.menu(s).challenge!.ask;
      if (ask) {
        if ((wantsToSolve && ready && rand() < submitChance) || nothingLeft) accusing = true;
        if (accusing) {
          if (ask.question === null) action = { type: 'handOver', givenTo };
          else if (ask.question === 'who') {
            // 沒事可做、紀錄又不夠的時候，只剩指錯人這條路
            const giveUp = nothingLeft && !fields;
            action = { type: 'answerChallenge', answer: accused === ch.culprit && giveUp ? pick(ch.suspects.filter((x) => x !== ch.culprit)) : accused };
          } else {
            const field = ch.fields.find((f) => f.id === ask.question);
            const known = field?.accept.find((g) => g.length === 1 && ask.options.includes(g[0]))?.[0];
            // 偶爾故意答錯，確認答錯再答走得通；不知道答案就用猜的
            const sloppy = rand() < 0.15;
            if (ask.options.length) action = { type: 'answerChallenge', answer: known && !sloppy ? known : pick(ask.options) };
            else accusing = false;
          }
        }
      } else if ((wantsToSolve && ready && rand() < submitChance) || nothingLeft) {
        const records = engine.menu(s).challenge!.records;
        const anyFields = Object.fromEntries(ch.fields.map((f) => [f.id, [pick(records)]]));
        // 偶爾故意交一份選錯欄位的，確認退回重填走得通
        const sloppy = accused === ch.culprit && rand() < 0.15;
        action = { type: 'submitChallenge', accused: nothingLeft && !fields ? pick(ch.suspects.filter((x) => x !== ch.culprit)) : accused, fields: sloppy || !fields ? anyFields : fields, givenTo };
        if (action.accused === ch.culprit && !fields && nothingLeft) action = { ...action, accused: pick(ch.suspects.filter((x) => x !== ch.culprit)) };
      }
    }
    if (!action) {
      if (options.length === 0) {
        run.stuck = true;
        break;
      }
      const looks = options.filter((a) => a.type === 'viewImage');
      const reading = options.filter((a) => a.type === 'openApp' || a.type === 'readThread' || a.type === 'seeMessages' || a.type === 'locate');
      const messages = options.filter(isMessage);
      const toGoal = options.filter(setsGoalFlag);
      if (toGoal.length) action = pick(toGoal);
      else if (looks.length && rand() < 0.6) action = pick(looks);
      else if (profile === 'seeker') {
        // 有目標的玩法：視窗不理它，先做會通往目標旗標或登入視窗的測試，其餘時間把東西翻完
        const reaction = (a: Action) => (a.type === 'test' ? content.reactions.find((r) => r.card === a.card && r.target === a.target && engine.holds(s, r.when)) : undefined);
        const triggered = (a: Action) => (reaction(a)?.triggers ?? []).flatMap((id) => content.events.find((e) => e.id === id) ?? []);
        const towardFlag = options.filter((a) =>
          triggered(a).some((e) => e.kind === 'message' && e.options?.some((o) => goalFlags.some(([flag, value]) => o.effects?.flags?.[flag] === value))),
        );
        const towardWindow = options.filter((a) => triggered(a).some((e) => e.kind === 'system' && !s.fired.includes(e.id)));
        const ignore = options.find((a) => a.type === 'answerPrompt' && a.option === null);
        action = ignore ?? towardFlag[0] ?? towardWindow[0] ?? (reading.length ? pick(reading) : pick(options));
      }
      else if (profile === 'reader' && reading.length && rand() < 0.9) action = pick(reading);
      else if (profile === 'talker' && messages.length && rand() < 0.8) action = pick(messages);
      else if ((profile === 'calm' || profile === 'provoke') && rand() < 0.85) {
        const sign = profile === 'calm' ? 1 : -1;
        const pool = profile === 'calm' && reading.length && rand() < 0.5 ? reading : costly;
        const scored = pool.map((a) => ({ a, score: sign * heat(engine, s, a) + rand() * 0.5 }));
        scored.sort((x, y) => x.score - y.score);
        action = scored[0]?.a ?? pick(options);
      } else action = pick(options);
    }

    if (action.type === 'test') {
      const reaction = content.reactions.find((r) => r.card === (action as { card: string }).card && r.target === (action as { target: string }).target && engine.holds(s, r.when));
      if (reaction) run.usedReactions.add(`${reaction.card}>${reaction.target}`);
    }
    if (isMessage(action)) run.sentMessage = true;
    const before = s;
    const result = engine.step(s, action);
    s = result.state;
    if (action.type !== 'sendCover') {
      for (const o of result.outcomes) {
        if (o.kind !== 'ladder' || o.to <= o.from) continue;
        run.raises += 1;
        if (o.auto) run.autoRaises += 1;
      }
    }
    if (s === before) {
      // 動作被拒絕。照理不會發生（動作都是從選單產生的），發生就當作卡住回報。
      run.stuck = true;
      break;
    }
    run.actions.push(action);
    if (run.login === null && s.fired.some((id) => content.events.find((e) => e.id === id)?.kind === 'system')) {
      run.login = { spent: s.spent, level: s.ladder[ch.culprit] ?? 0 };
    }
  }
  run.final = s;
  return run;
}

const describe = (a: Action): string => {
  switch (a.type) {
    case 'openApp':
      return `開 ${a.app}`;
    case 'readThread':
      return `讀 ${a.thread}`;
    case 'locate':
      return `定位 ${a.app}`;
    case 'viewImage':
      return `看照片 ${a.item}`;
    case 'spot':
      return `指出 ${a.card}:${a.option}`;
    case 'reply':
      return `回 ${a.event}:${a.option}`;
    case 'test':
      return `問 ${a.card}>${a.target}`;
    case 'seeMessages':
      return `往上滑 ${a.thread}`;
    case 'viewProfile':
      return `看個人頁面 ${a.character}`;
    case 'think':
      return `再想想 ${a.card}`;
    case 'answerPrompt':
      return `視窗 ${a.option ?? '不理'}`;
    case 'answerChallenge':
      return `回答 ${a.answer}`;
    case 'handOver':
      return `交給${a.givenTo}`;
    case 'submitChallenge':
      return `交卷 指${a.accused} 給${a.givenTo}`;
    case 'sendCover':
      return '送出掩護說法';
  }
};

export function runChecks(content: CaseContent, options: { runs?: number } = {}): CheckResult {
  const engine = createEngine(content);
  const total = options.runs ?? 6000;
  const runs: Run[] = [];
  for (let i = 0; i < total; i++) runs.push(playOnce(engine, i + 1, PROFILES[i % PROFILES.length]));

  const checks: Check[] = [];
  const add = (name: string, problems: string[]) => checks.push({ name, ok: problems.length === 0, detail: problems });
  const union = <T,>(get: (r: Run) => Iterable<T>) => {
    const set = new Set<T>();
    for (const r of runs) for (const x of get(r)) set.add(x);
    return set;
  };

  const seen = union((r) => r.final.seen);
  const fired = union((r) => r.final.fired);
  const cards = union((r) => r.final.cards);
  const endings = union((r) => (r.final.ended ? [r.final.ended] : []));
  const reactions = union((r) => r.usedReactions);

  // 1. 每個關鍵結論至少兩條路，而且每條路都真的走得到
  const conclusionProblems: string[] = [];
  for (const c of content.conclusions) {
    if (c.routes.length < 2) conclusionProblems.push(`${c.id}：只有 ${c.routes.length} 條路`);
    c.routes.forEach((route, i) => {
      if (!runs.some((r) => routesReached(c, r.final).includes(i))) {
        const missing = route.filter((id) => !seen.has(id));
        conclusionProblems.push(`${c.id} 第 ${i + 1} 條路走不到${missing.length ? `（拿不到：${missing.join('、')}）` : '（各筆拿得到，但沒有同時拿到過）'}`);
      }
    });
  }
  add('每個關鍵結論至少兩條路，每條路都走得到', conclusionProblems);

  // 2. 每個結局都觸發得了
  add(
    '每個結局都觸發得了',
    content.endings.endings.filter((e) => !endings.has(e.id)).map((e) => `${e.id}（${e.title}）沒有任何一局走到`),
  );

  // 3. 沒有死路
  const stuck = runs.filter((r) => r.stuck);
  const unfinished = runs.filter((r) => !r.stuck && r.final.phase !== 'ended');
  add('沒有死路：任何時候都還有事可做，每一局都走得到結局', [
    ...stuck.slice(0, 3).map((r) => `卡住（${r.profile}）：${r.actions.slice(-6).map(describe).join(' → ')}`),
    ...unfinished.slice(0, 3).map((r) => `沒有結束（${r.profile}）：${r.actions.slice(-6).map(describe).join(' → ')}`),
  ]);

  // 4. 寫了就該用得到：每筆 item、每張牌、每個事件、反應表每一格
  add('每一筆 item 都看得到', content.items.filter((i) => !seen.has(i.id)).map((i) => i.id));
  add('每一張牌都拿得到', content.cards.filter((c) => !cards.has(c.id)).map((c) => c.id));
  add('每一個事件都會發生', content.events.filter((e) => !fired.has(e.id)).map((e) => e.id));
  add('反應表每一格都用得到', content.reactions.filter((r) => !reactions.has(`${r.card}>${r.target}`)).map((r) => `${r.card} × ${r.target}`));

  // 5. 挑戰書答得出來
  add(
    '挑戰書每一欄的答案都湊得齊',
    content.endings.challenge.fields.filter((f) => !f.accept.some((g) => g.every((id) => seen.has(id)))).map((f) => f.id),
  );

  // ── 數值觀察 ──
  const report: string[] = [];
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  const tidy = (n: number) => Math.round(n * 10) / 10;
  const median = (list: number[]) => (list.length ? tidy([...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]) : NaN);
  const start = content.meta.battery.start;
  const culprit = content.endings.challenge.culprit;
  const culpritMax = content.characters.find((c) => c.id === culprit)?.ladder.length ?? 0;

  report.push(`模擬 ${runs.length} 局。各結局出現次數：`);
  for (const e of content.endings.endings) report.push(`　${e.id}（${e.title}）：${runs.filter((r) => r.final.ended === e.id).length}`);

  const solvedIds = content.endings.endings.filter((e) => e.trigger.kind === 'challenge' && e.trigger.accused === culprit).map((e) => e.id);
  const wrongIds = content.endings.endings.filter((e) => e.trigger.kind === 'challenge' && e.trigger.accused !== undefined && e.trigger.accused !== culprit).map((e) => e.id);
  const count = (ids: string[]) => runs.filter((r) => r.final.ended !== null && ids.includes(r.final.ended)).length;
  report.push('', `破案（指對人、答完全部題目）：${count(solvedIds)} 局（${pct(count(solvedIds), runs.length)}）。指錯人：${count(wrongIds)} 局（${pct(count(wrongIds), runs.length)}）。`);
  const tries = runs.filter((r) => r.final.ended !== null && solvedIds.includes(r.final.ended)).map((r) => r.final.challengeTries);
  if (tries.length) report.push(`　破案的那些局，途中答錯的次數：中位數 ${median(tries)}、最多 ${Math.max(...tries)}。`);

  // 階梯是被什麼推動的
  const still = runs.filter((r) => r.raises === 0);
  const noAuto = runs.filter((r) => r.autoRaises === 0);
  const stillEnds = [...new Set(still.map((r) => r.final.ended))].map((id) => id + ' ' + still.filter((r) => r.final.ended === id).length).join('、');
  report.push(
    '',
    '開局之後沒有任何人升級的有 ' + still.length + ' 局（' + pct(still.length, runs.length) + '）' + (still.length ? '，結局分佈：' + stillEnds : '') + '。',
    '每一局升級次數的中位數 ' + median(runs.map((r) => r.raises)) + '，其中自己升的（已讀不回）中位數 ' + median(runs.map((r) => r.autoRaises)) + '；完全沒有已讀不回升級的有 ' + noAuto.length + ' 局（' + pct(noAuto.length, runs.length) + '）。',
  );
  for (const p of PROFILES) {
    const mine = runs.filter((r) => r.profile === p);
    report.push('　' + p + '：登入視窗出現 ' + pct(mine.filter((r) => r.login).length, mine.length) + '，結束時靖雯等級中位數 ' + median(mine.map((r) => r.final.ladder[culprit] ?? 0)) + '，升級次數中位數 ' + median(mine.map((r) => r.raises)));
  }

  // 每個人結束時停在第幾級
  report.push('', '結束時每個人停在第幾級（局數）：');
  for (const c of content.characters) {
    const levels = Array.from({ length: c.ladder.length + 1 }, (_, level) => level);
    report.push('　' + c.id + '：' + levels.map((level) => level + ' 級 ' + pct(runs.filter((r) => (r.final.ladder[c.id] ?? 0) === level).length, runs.length)).join('、'));
  }

  // 不傳任何訊息能不能破案
  const silent = runs.filter((r) => r.profile === 'silent');
  const silentSolvable = silent.filter((r) => correctFields(content, r.final) !== null || r.solvableAt !== null);
  report.push('', `不傳任何訊息（只送開局那句）：${silent.length} 局裡有 ${silentSolvable.length} 局湊齊了挑戰書的全部答案（${pct(silentSolvable.length, silent.length)}）。`);
  const example = silentSolvable[0];
  if (example) report.push(`　例：${example.actions.map(describe).join(' → ')}`);
  const silentLogin = silent.filter((r) => r.login);
  report.push(`　其中登入視窗自己跳出來的有 ${silentLogin.length} 局（${pct(silentLogin.length, silent.length)}）。`);

  // 登入視窗出現後，離靖雯走到最後一級還有多少電
  const found = content.endings.endings.find((e) => e.trigger.kind === 'ladder' && e.trigger.character === culprit);
  const withLogin = runs.filter((r) => r.login);
  const lost = withLogin.filter((r) => r.final.ended === found?.id);
  const gaps = lost.map((r) => tidy(r.final.spent - r.login!.spent));
  report.push(
    '',
    `登入視窗出現過的有 ${withLogin.length} 局（${pct(withLogin.length, runs.length)}）。出現時靖雯的等級分佈：${[...Array(culpritMax + 1).keys()]
      .map((l) => `${l} 級 ${withLogin.filter((r) => r.login!.level === l).length}`)
      .join('、')}`,
    `其中後來被她查到醫院的 ${lost.length} 局，從視窗出現到結局之間用掉的電量：最少 ${gaps.length ? Math.min(...gaps) : '—'}%、中位數 ${median(gaps)}%、最多 ${gaps.length ? Math.max(...gaps) : '—'}%。`,
    `　視窗出現的同一個動作就直接結局（0%）的有 ${gaps.filter((g) => g === 0).length} 局。`,
  );
  const notReady = withLogin.filter((r) => r.solvableAt === null || r.solvableAt > r.login!.spent);
  report.push(`視窗出現當下，其餘答案還沒湊齊的有 ${notReady.length} 局（${pct(notReady.length, withLogin.length)}）；湊齊的那些可以馬上交卷（交卷不耗電）。`);

  const solved = runs.filter((r) => r.solvableAt !== null);
  report.push('', `湊齊全部答案的有 ${solved.length} 局（${pct(solved.length, runs.length)}），湊齊時剩餘電量的中位數 ${tidy(start - median(solved.map((r) => r.solvableAt!)))}%。`);
  const soft = runs.filter((r) => r.softDead);
  report.push(`走到「沒有任何耗電的事可做、手上的紀錄又不夠破案」的有 ${soft.length} 局（${pct(soft.length, runs.length)}）。這時只剩用猜的或指錯人。`);
  if (soft[0]) report.push(`　例（${soft[0].profile}）：${soft[0].actions.slice(-8).map(describe).join(' → ')}`);
  const battery = content.endings.endings.find((e) => e.trigger.kind === 'battery');
  const dead = runs.filter((r) => r.final.ended === battery?.id);
  if (dead[0]) report.push(`沒電結局的一個例子（${dead[0].profile}）：共 ${dead[0].actions.length} 個動作，結束時靖雯在第 ${dead[0].final.ladder[culprit]} 級。`);
  report.push(`被查到醫院的那些局，結束時剩餘電量：中位數 ${tidy(start - median(runs.filter((r) => r.final.ended === found?.id).map((r) => r.final.spent)))}%。`);

  return { checks, report };
}
