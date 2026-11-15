import { describe, expect, it } from 'vitest';
import { loadCase } from '../content';
import { createEngine, isRightSpot, memo, reachedConclusions, spotOf, type Action, type Engine, type GameState, type Outcome } from './index';

const content = loadCase('case01');
const engine = createEngine(content);
const cost = content.meta.battery.cost;

/** 依序執行動作；任何一步不合法就讓測試失敗 */
function run(state: GameState, actions: Action[], by: Engine = engine): { state: GameState; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  for (const action of actions) {
    const r = by.step(state, action);
    const bad = r.outcomes.find((o) => o.kind === 'invalid');
    if (bad && bad.kind === 'invalid') throw new Error(`${JSON.stringify(action)}：${bad.reason}`);
    state = r.state;
    outcomes.push(...r.outcomes);
  }
  return { state, outcomes };
}

const afterCover = () => run(engine.start(), [{ type: 'sendCover' }]).state;

/** 舊做法的副本：電量每掉一段就自動升級、沒有已讀不回。測舊規則本身的測試用。 */
function legacy(): typeof content {
  const copy = structuredClone(content);
  copy.meta.battery.ladderAuto = true;
  // 舊做法下傳訊息會耗電（這些測試靠一直回訊息把電耗下去）；現在的資料是不扣的
  if (!copy.meta.battery.cost.send) copy.meta.battery.cost.send = 2;
  delete copy.meta.readIgnore;
  // 階梯上各級自己的門檻（when）也拿掉，要測門檻的測試自己標
  for (const c of copy.characters) for (const l of c.ladder) delete l.when;
  // 來電也拿掉：這些測試走固定的流程，電話一響就會被打斷。來電有自己的測試。
  const calls = new Set(copy.events.filter((e) => e.kind === 'call').map((e) => e.id));
  for (const c of copy.characters) for (const l of c.ladder) l.onEnter = l.onEnter.filter((id) => !calls.has(id));
  return copy;
}

/** 把目前「在意的地方」都指對（有的話），讓疑點成立。測的不是這一層的測試用它跳過這一步。 */
function spotAll(e: Engine, state: GameState): GameState {
  for (const concern of e.menu(state).concerns) {
    const spot = spotOf(e.content.cards.find((c) => c.id === concern.card)!)!;
    const right = spot.options.find((o) => isRightSpot(spot, o.id))!;
    state = e.step(state, { type: 'spot', card: concern.card, option: right.id }).state;
  }
  return state;
}

/**
 * 把電耗下去：把所有疑點都當作成立，一張一張拿去問人（每問一次都耗電），直到 done 成立。
 * only 有給的話只問那個人。不依賴資料裡每個動作耗多少電、誰還有訊息等著回。
 */
function burnByAsking(e: Engine, state: GameState, done: (s: GameState) => boolean, only?: string): GameState {
  let s: GameState = { ...state, concerns: [], cards: e.content.cards.filter((c) => !c.thinkOnly).map((c) => c.id) };
  for (const t of e.menu(s).tests) {
    for (const target of t.targets) {
      if (only && target !== only) continue;
      if (s.phase !== 'play' || s.prompt || s.call || done(s)) return s;
      const r = e.step(s, { type: 'test', card: t.card, target });
      if (!r.outcomes.some((o) => o.kind === 'invalid')) s = r.state;
    }
  }
  return s;
}

describe('engine', () => {
  it('src/engine 不引用任何畫面相關的東西', () => {
    const sources = import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true });
    const files = Object.keys(sources).filter((f) => !f.includes('.test.'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(sources[file], file).not.toMatch(/from ['"](react|react-dom)|\.\.\/ui|\.css['"]|document\.|window\./);
    }
  });

  it('開局只能送出掩護說法，送出後四人踏上第一級', () => {
    const start = engine.start();
    expect(engine.step(start, { type: 'openApp', app: 'sms' }).outcomes[0].kind).toBe('invalid');
    const s = afterCover();
    expect(s.battery).toBe(content.meta.battery.start - cost.send);
    for (const c of content.characters) expect(s.ladder[c.id]).toBe(1);
    expect(s.seen).toContain('say_aze_stoodup');
    // 靖雯的私訊要再耗一些電才出現
    expect(s.fired).not.toContain('cov_jw_dm');
    expect(s.fired).toContain('cov_py_dm');
  });

  it('不改動傳進來的狀態', () => {
    const start = engine.start();
    const copy = structuredClone(start);
    engine.step(start, { type: 'sendCover' });
    expect(start).toEqual(copy);
  });

  it('第一次打開才耗電，重複打開不耗電', () => {
    const a = run(afterCover(), [{ type: 'openApp', app: 'sms' }]).state;
    const b = run(a, [{ type: 'openApp', app: 'sms' }]).state;
    expect(a.battery).toBe(content.meta.battery.start - cost.send - cost.openApp);
    expect(b.battery).toBe(a.battery);
    expect(a.seen).toContain('sms_er');
  });

  it('延遲的訊息在耗掉指定電量後出現', () => {
    const s = run(afterCover(), [
      { type: 'openApp', app: 'sms' },
      { type: 'openApp', app: 'notes' },
      { type: 'openApp', app: 'receipts' },
    ]).state;
    expect(s.fired).toContain('cov_jw_dm');
  });

  it('定位後才看得到 iPad 的位置', () => {
    const a = run(afterCover(), [{ type: 'openApp', app: 'finder' }]).state;
    expect(a.seen).not.toContain('fd_ipad');
    const b = run(a, [{ type: 'locate', app: 'finder' }]).state;
    expect(b.seen).toContain('fd_ipad');
    expect(a.battery - b.battery).toBe(cost.locate);
  });

  it('測試：有反應用反應表，沒有就輪流用通用反應', () => {
    let s = run(afterCover(), [
      { type: 'openApp', app: 'receipts' },
      { type: 'readThread', thread: 'dm_aze' },
      { type: 'readThread', thread: 'dm_zonghan' },
    ]).state;
    // 疑點從「在意的地方」來：指對了才成立
    s = spotAll(engine, s);
    expect(s.cards).toContain('card_latte');
    const hit = run(s, [{ type: 'test', card: 'card_latte', target: 'aze' }]);
    expect(hit.state.seen).toContain('say_aze_admit');
    expect(hit.state.fired).toContain('msg_aze_after_admit');
    const generic = run(s, [{ type: 'test', card: 'card_latte', target: 'zonghan' }]);
    const reply = generic.outcomes.find((o) => o.kind === 'message');
    expect(reply && reply.kind === 'message' && reply.text).toEqual(content.characters.find((c) => c.id === 'zonghan')!.genericReplies[0]);
    s = generic.state;
    expect(engine.step(s, { type: 'test', card: 'card_latte', target: 'zonghan' }).outcomes[0].kind).toBe('invalid');
  });

  it('電量每掉一段，沒被安撫的人升一級；被安撫的不升', () => {
    // 先讀品妤的私訊並回一句讓她降級的話，再把電耗過第一段
    const old = createEngine(legacy());
    let s = run(old.step(old.start(), { type: 'sendCover' }).state, [
      { type: 'readThread', thread: 'dm_pinyu' },
      { type: 'reply', event: 'cov_py_dm', option: 'sleepy' },
    ], old).state;
    expect(s.soothe.pinyu).toBe('calm');
    // 品妤被理過，用一般的間隔；宗翰沒人理，用較短的間隔（資料有寫的話）
    const every = content.meta.battery.ladderTickEvery;
    const ignoredEvery = content.meta.battery.ladderTickEveryIgnored ?? every;
    expect(s.attended).toEqual(['pinyu']);
    const apps = content.apps.apps.filter((a) => !a.background && a.view !== 'chat').map((a) => a.id);
    for (const app of apps) {
      if (s.spent < ignoredEvery) s = run(s, [{ type: 'openApp', app }], old).state;
    }
    expect(s.ladder.zonghan).toBe(2);
    expect(s.fired).toContain('msg_zh_refund');
    for (const app of apps) {
      if (s.spent < every) s = run(s, [{ type: 'openApp', app }], old).state;
    }
    expect(s.spent).toBeGreaterThanOrEqual(every);
    // 品妤這一段被安撫過，輪到她時不升，安撫的紀錄用掉
    expect(s.ladder.pinyu).toBe(1);
    expect(s.soothe.pinyu).toBeUndefined();
  });

  it('標了 needsContact 的那一級：玩家沒傳過訊息就進不去，傳過之後照常', () => {
    // 用副本，自己標上去：不管資料檔之後怎麼調，這條規則本身都測得到
    const copy = legacy();
    const jw = copy.characters.find((c) => c.id === copy.endings.challenge.culprit)!;
    for (const l of jw.ladder) delete l.needsContact;
    const gate = jw.ladder.find((l) => l.onEnter.some((id) => copy.events.find((e) => e.id === id)?.kind === 'system'))!;
    gate.needsContact = true;
    const e2 = createEngine(copy);
    const quiet = copy.apps.apps.filter((a) => a.view !== 'chat').map((a) => a.id);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    for (const app of quiet) s = e2.step(s, { type: 'openApp', app }).state;
    s = e2.step(s, { type: 'locate', app: 'finder' }).state;
    for (const t of copy.threads) s = e2.step(s, { type: 'readThread', thread: t.id }).state;
    // 只翻手機：她停在前一級，視窗不會自己跳出來
    expect(s.ladder[jw.id]).toBe(gate.level - 1);
    expect(s.prompt).toBeNull();
    expect(s.seen).not.toContain('rec_login');
    // 開口之後，下一次輪到她就照常往上
    // 一直拿疑點去問人把電耗下去（不依賴資料裡的間隔數字），直到輪到她
    s = burnByAsking(e2, s, (st) => (st.ladder[jw.id] ?? 0) >= gate.level);
    expect(s.attended.length).toBeGreaterThan(0);
    expect(s.ladder[jw.id]).toBeGreaterThanOrEqual(gate.level);
    expect(s.seen).toContain('rec_login');
  });

  it('階梯某一級帶了條件（when）：條件成立前停在前一級，成立之後照常', () => {
    // 用副本自己標：第二級要先看過一張發票
    const copy = legacy();
    const jw = copy.characters.find((c) => c.id === copy.endings.challenge.culprit)!;
    for (const l of jw.ladder) {
      delete l.needsContact;
      delete l.when;
    }
    jw.ladder.find((l) => l.level === 2)!.when = { seen: ['rcp_1628'] };
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    // 耗電讓她自己往上：看聊天室、開別的 App、定位，就是不開發票（不依賴資料裡每個動作耗多少電）
    const others: Action[] = [
      ...copy.threads.map((t): Action => ({ type: 'readThread', thread: t.id })),
      ...copy.apps.apps.filter((x) => x.id !== 'receipts' && x.view !== 'chat').map((x): Action => ({ type: 'openApp', app: x.id })),
      { type: 'locate', app: 'finder' },
    ];
    const burn = (target: number) => {
      for (const action of others) {
        if (s.phase !== 'play' || s.prompt || s.call || (s.ladder[jw.id] ?? 0) >= target) break;
        const r = e2.step(s, action);
        if (!r.outcomes.some((o) => o.kind === 'invalid')) s = r.state;
      }
    };
    burn(2);
    expect(s.phase).toBe('play');
    expect(s.seen).not.toContain('rcp_1628');
    expect(s.ladder[jw.id]).toBe(1);
    // 看過發票之後，下一次輪到她就照常往上
    s = e2.step(s, { type: 'openApp', app: 'receipts' }).state;
    expect(s.seen).toContain('rcp_1628');
    // 再耗一段電（借一張疑點反覆拿去問人，每次都耗電）
    s = { ...s, cards: copy.cards.filter((c) => !c.thinkOnly).map((c) => c.id), concerns: [] };
    for (const t of e2.menu(s).tests) {
      for (const target of t.targets) {
        if (s.phase !== 'play' || s.prompt || s.call || (s.ladder[jw.id] ?? 0) >= 2) break;
        s = e2.step(s, { type: 'test', card: t.card, target }).state;
      }
    }
    expect(s.ladder[jw.id]).toBeGreaterThanOrEqual(2);
  });

  it('needsContact 是 self 時，要理過本人才進得去；理過別人不算', () => {
    const copy = legacy();
    const jw = copy.characters.find((c) => c.id === copy.endings.challenge.culprit)!;
    for (const l of jw.ladder) delete l.needsContact;
    const gate = jw.ladder.find((l) => l.onEnter.some((id) => copy.events.find((e) => e.id === id)?.kind === 'system'))!;
    gate.needsContact = 'self';
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    for (const t of copy.threads) s = e2.step(s, { type: 'readThread', thread: t.id }).state;
    // 理過別人
    s = e2.step(s, { type: 'reply', event: 'cov_py_dm', option: 'sleepy' }).state;
    for (const app of copy.apps.apps.filter((a) => a.view !== 'chat').map((a) => a.id)) s = e2.step(s, { type: 'openApp', app }).state;
    s = e2.step(s, { type: 'locate', app: 'finder' }).state;
    expect(s.attended).not.toContain(jw.id);
    expect(s.ladder[jw.id]).toBe(gate.level - 1);
    expect(s.seen).not.toContain('rec_login');
    // 再理別人、耗再多電也一樣進不去
    // （只多耗一段：問別人到電量又掉了至少一個間隔為止，免得把電耗光）
    const other = copy.characters.map((c) => c.id).find((id) => id !== jw.id)!;
    const spentBefore = s.spent;
    s = burnByAsking(e2, s, (st) => st.spent - spentBefore >= copy.meta.battery.ladderTickEvery, other);
    expect(s.phase).toBe('play');
    expect(s.attended).not.toContain(jw.id);
    expect(s.ladder[jw.id]).toBe(gate.level - 1);
    // 理過她本人（拿疑點問她）之後，再耗一段電就照常往上
    s = burnByAsking(e2, s, (st) => (st.ladder[jw.id] ?? 0) >= gate.level, jw.id);
    expect(s.attended).toContain(jw.id);
    expect(s.ladder[jw.id]).toBeGreaterThanOrEqual(gate.level);
  });

  it('舊 iPad 那張牌引出登入視窗；可以按按鈕、關掉，或放著去做別的事（等於不理它）', () => {
    let s = spotAll(engine, run(afterCover(), [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }]).state);
    expect(s.cards).toContain('card_oldipad');
    s = run(s, [{ type: 'test', card: 'card_oldipad', target: 'zonghan' }]).state;
    expect(s.prompt).toBe('sys_login_prompt');
    expect(s.seen).toContain('rec_login');
    const level = s.ladder.jingwen;
    const away = run(s, [{ type: 'openApp', app: 'sms' }]);
    expect(away.state.prompt).toBeNull();
    expect(away.state.ladder.jingwen).toBe(level);
    expect(away.outcomes).toContainEqual({ kind: 'promptClosed', event: 'sys_login_prompt', ignored: true });
    const denied = run(s, [{ type: 'answerPrompt', option: 'deny' }]).state;
    expect(denied.ladder.jingwen).toBe(level + 1);
    expect(denied.flags.jingwen_knows_phone_active).toBe(true);
    const ignored = run(s, [{ type: 'answerPrompt', option: null }]).state;
    expect(ignored.ladder.jingwen).toBe(level);
    expect(ignored.prompt).toBeNull();
  });

  it('視窗上的軟牆按鈕只丟出提醒（輪流用），視窗還在、不耗電、階梯不變', () => {
    const login = content.events.find((e) => e.id === 'sys_login_prompt');
    const wall = login?.kind === 'system' ? login.options?.find((o) => o.hints?.length) : undefined;
    if (!wall?.hints) throw new Error('登入視窗沒有軟牆按鈕');
    let s = spotAll(engine, run(afterCover(), [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }]).state);
    s = run(s, [{ type: 'test', card: 'card_oldipad', target: 'zonghan' }]).state;
    for (let i = 0; i <= wall.hints.length; i++) {
      const r = engine.step(s, { type: 'answerPrompt', option: wall.id });
      expect(r.outcomes).toEqual([{ kind: 'promptHint', event: 'sys_login_prompt', text: wall.hints[i % wall.hints.length] }]);
      expect(r.state.prompt).toBe('sys_login_prompt');
      expect(r.state.battery).toBe(s.battery);
      expect(r.state.ladder).toEqual(s.ladder);
      s = r.state;
    }
  });

  it('指認兇手一題一題問：每題選一張疑點，選錯扣電、同一張不能再選，答對才問下一題，全部答完才選交給誰', () => {
    // 用副本把「一次交卷」關掉，測一題一題問的規則本身
    const copy = structuredClone(content);
    delete copy.endings.challenge.submitAll;
    const engine = createEngine(copy);
    const ch = content.endings.challenge;
    expect(engine.menu({ ...afterCover(), cards: [content.cards[0].id] }).challenge?.form).toBeNull();
    expect(engine.step(afterCover(), { type: 'submitChallenge' }).outcomes[0].kind).toBe('invalid');
    const sequence = ch.sequence!;
    // 手上一張疑點都沒有就不能開始；還在「在意的地方」階段的不算
    expect(engine.menu({ ...afterCover(), cards: [] }).challenge).toBeNull();
    // 直接把所有疑點都當作成立，不依賴資料檔裡怎麼拿到
    let s: GameState = { ...afterCover(), concerns: [], cards: content.cards.map((c) => c.id) };
    const ask = () => engine.menu(s).challenge!.ask;
    expect(engine.step(s, { type: 'handOver', givenTo: ch.recipients[0] }).outcomes[0].kind).toBe('invalid');
    sequence.forEach((question, index) => {
      expect(ask()).toMatchObject({ index, total: sequence.length, question });
      if (question === 'who') {
        expect(ask().options).toEqual(ch.suspects);
        const wrongWho = ch.suspects.find((x) => x !== ch.culprit)!;
        expect(engine.step(s, { type: 'answerChallenge', answer: wrongWho }).state.ended).toBe(`end_wrong_${wrongWho}`);
        s = engine.step(s, { type: 'answerChallenge', answer: ch.culprit }).state;
        return;
      }
      const field = ch.fields.find((f) => f.id === question)!;
      const right = field.cards[0];
      expect(ask().options).toEqual(s.cards);
      const wrong = ask().options.find((id) => !field.cards.includes(id))!;
      const miss = engine.step(s, { type: 'answerChallenge', answer: wrong });
      expect(miss.outcomes).toContainEqual({ kind: 'challengeAnswer', question, answer: wrong, right: false, cost: cost.challengeRetry });
      expect(s.battery - miss.state.battery).toBe(cost.challengeRetry);
      expect(miss.state.accusation.step).toBe(index);
      expect(engine.menu(miss.state).challenge!.ask.options).not.toContain(wrong);
      expect(engine.step(miss.state, { type: 'answerChallenge', answer: wrong }).outcomes[0].kind).toBe('invalid');
      // 不是手上的疑點（例如一筆紀錄）不能拿來回答
      expect(engine.step(miss.state, { type: 'answerChallenge', answer: content.items[0].id }).outcomes[0].kind).toBe('invalid');
      const hit = engine.step(miss.state, { type: 'answerChallenge', answer: right });
      expect(hit.outcomes).toContainEqual({ kind: 'challengeAnswer', question, answer: right, right: true, cost: 0 });
      expect(hit.state.battery).toBe(miss.state.battery);
      s = hit.state;
    });
    expect(ask()).toMatchObject({ question: null, options: ch.recipients });
    expect(engine.step(s, { type: 'handOver', givenTo: 'pinyu' }).state.ended).toBe('end_pinyu');
  });

  it('指認兇手一次交卷：每格放一張疑點、隨意換不扣電，填滿才能交；格子不對退回扣電並指出是哪幾格，全對才選交給誰', () => {
    // 用副本打開「一次交卷」，不依賴資料檔現在開不開
    const copy = structuredClone(content);
    copy.endings.challenge.submitAll = true;
    const e2 = createEngine(copy);
    const ch = copy.endings.challenge;
    const sequence = ch.sequence ?? [...ch.fields.map((f) => f.id), 'who'];
    const fieldIds = sequence.filter((q) => q !== 'who');
    const fieldOf = (q: string) => ch.fields.find((f) => f.id === q)!;
    let s: GameState = { ...afterCover(), concerns: [], cards: copy.cards.map((c) => c.id) };
    const form = () => e2.menu(s).challenge!.form!;
    const fill = (question: string, answer: string | null) => {
      const r = e2.step(s, { type: 'fillChallenge', question, answer });
      expect(r.outcomes.some((o) => o.kind === 'invalid')).toBe(false);
      s = r.state;
    };
    expect(form().slots.map((x) => x.question)).toEqual(sequence);
    expect(form()).toMatchObject({ ready: false, passed: false });
    // 一題一題的動作在這裡不能用；沒填滿不能交、也不能直接選交給誰
    expect(e2.step(s, { type: 'answerChallenge', answer: s.cards[0] }).outcomes[0].kind).toBe('invalid');
    expect(e2.step(s, { type: 'submitChallenge' }).outcomes[0].kind).toBe('invalid');
    expect(e2.step(s, { type: 'handOver', givenTo: ch.recipients[0] }).outcomes[0].kind).toBe('invalid');
    // 每一格都能放任何一張手上的疑點（含只能自己想的）；不是手上的不能放
    for (const q of fieldIds) expect(form().slots.find((x) => x.question === q)?.options).toEqual(s.cards);
    expect(e2.step(s, { type: 'fillChallenge', question: fieldIds[0], answer: copy.items[0].id }).outcomes[0].kind).toBe('invalid');
    expect(e2.step({ ...s, cards: [], concerns: [{ card: s.cards[0], tried: [] }] }, { type: 'fillChallenge', question: fieldIds[0], answer: s.cards[0] }).outcomes[0].kind).toBe('invalid');
    // 全部先放同一張錯的（同一張可以放不只一格），人指對：填的時候不扣電、不說對錯
    const battery = s.battery;
    const wrongFor = (q: string) => s.cards.find((id) => !fieldOf(q).cards.includes(id))!;
    for (const q of fieldIds) fill(q, wrongFor(fieldIds[0]));
    fill('who', ch.culprit);
    fill(fieldIds[0], null);
    expect(form().ready).toBe(false);
    fill(fieldIds[0], wrongFor(fieldIds[0]));
    expect(s.battery).toBe(battery);
    expect(form().ready).toBe(true);
    // 交出去被退回：扣一次、指出不對的格子、格子內容保留
    const wrongFields = fieldIds.filter((q) => !fieldOf(q).cards.includes(s.accusation.slots[q]));
    expect(wrongFields).toContain(fieldIds[0]);
    const rejected = e2.step(s, { type: 'submitChallenge' });
    expect(rejected.outcomes).toContainEqual({ kind: 'challengeRejected', fields: wrongFields, cost: cost.challengeRetry });
    expect(s.battery - rejected.state.battery).toBe(cost.challengeRetry);
    expect(rejected.state.accusation.slots).toEqual(s.accusation.slots);
    expect(rejected.state.ended).toBeNull();
    s = rejected.state;
    // 人指錯：不管格子對不對，直接進那個人的結局
    const innocent = ch.suspects.find((x) => x !== ch.culprit)!;
    const framed = e2.step(e2.step(s, { type: 'fillChallenge', question: 'who', answer: innocent }).state, { type: 'submitChallenge' });
    expect(framed.state.ended).toBe('end_wrong_' + innocent);
    // 改成全對：通過，接著才選交給誰；通過之後不能再改
    for (const q of fieldIds) fill(q, fieldOf(q).cards[0]);
    const passed = e2.step(s, { type: 'submitChallenge' });
    expect(passed.outcomes).toContainEqual({ kind: 'challengePassed' });
    expect(passed.state.battery).toBe(s.battery);
    s = passed.state;
    expect(form().passed).toBe(true);
    expect(e2.menu(s).challenge!.ask).toMatchObject({ question: null, options: ch.recipients });
    expect(e2.step(s, { type: 'fillChallenge', question: 'who', answer: innocent }).outcomes[0].kind).toBe('invalid');
    expect(e2.step(s, { type: 'handOver', givenTo: 'pinyu' }).state.ended).toBe('end_pinyu');
  });

  it('只能自己想、但要先指出哪裡有問題的疑點：先進在意的地方，指對才成立，成立後可以放進指認的格子', () => {
    const copy = structuredClone(content);
    copy.endings.challenge.submitAll = true;
    const base = copy.cards.find((c) => c.spot && c.availableWhen)!;
    const mine = { ...structuredClone(base), id: 'card_think_spot', thinkOnly: true };
    delete mine.say;
    delete mine.sayTo;
    delete mine.targets;
    copy.cards = copy.cards.filter((c) => c.id !== base.id);
    copy.cards.push(mine);
    const e2 = createEngine(copy);
    // 把所有東西都當作看過，讓條件成立
    let s: GameState = { ...e2.step(e2.start(), { type: 'sendCover' }).state, seen: copy.items.map((i) => i.id) };
    s = e2.step(s, { type: 'openApp', app: copy.apps.apps[0].id }).state;
    expect(s.concerns.map((x) => x.card)).toContain(mine.id);
    expect(s.cards).not.toContain(mine.id);
    s = spotAll(e2, s);
    expect(s.cards).toContain(mine.id);
    expect(e2.menu(s).tests.some((t) => t.card === mine.id)).toBe(false);
    const field = copy.endings.challenge.fields[0].id;
    expect(e2.step(s, { type: 'fillChallenge', question: field, answer: mine.id }).state.accusation.slots[field]).toBe(mine.id);
  });

  it('背景 App 耗電較少（可以是小數），連續逛幾個會跳出提醒，不擋操作', () => {
    const idle = content.apps.apps.filter((a) => a.background).map((a) => a.id);
    const w = content.meta.wander;
    if (idle.length === 0 || !w || cost.openIdleApp === undefined) return;
    let s = afterCover();
    const before = s.battery;
    const texts: string[] = [];
    for (const app of idle.slice(0, w.after)) {
      const r = run(s, [{ type: 'openApp', app }]);
      s = r.state;
      for (const o of r.outcomes) if (o.kind === 'wander') texts.push(o.text);
    }
    expect(before - s.battery).toBeCloseTo(cost.openIdleApp * Math.min(idle.length, w.after), 5);
    if (idle.length >= w.after) expect(texts).toEqual([w.hints[0]]);
    // 打開有線索的 App 之後重新計數
    expect(run(s, [{ type: 'openApp', app: 'sms' }]).state.wanderStreak).toBe(0);
  });

  it('跟案情無關的生活內容看得到，但不進備忘錄、不能比對、不能當挑戰書的選項', () => {
    const flavor = content.items.find((i) => i.flavor && !i.hidden && !i.thread);
    if (!flavor) return;
    const s = run(afterCover(), [{ type: 'openApp', app: flavor.app }]).state;
    expect(s.seen).toContain(flavor.id);
    const m = memo(content, s);
    expect([...m.records, ...m.statements].map((i) => i.id)).not.toContain(flavor.id);
    expect(m.timeline.map((r) => r.item)).not.toContain(flavor.id);
  });

  it('點開照片不耗電；照片要點開才算看過的規則打開時，沒點開就不進備忘錄、也不會帶出疑點', () => {
    const photo = content.threads.flatMap((t) => t.history.flatMap((m) => (m.image && m.item ? [{ thread: t.id, item: m.item }] : []))).find((x) => content.cards.some((c) => c.availableWhen?.seen?.includes(x.item)));
    if (!photo) return;
    const card = content.cards.find((c) => c.availableWhen?.seen?.includes(photo.item))!;

    // 規則關掉：讀到就算看過，點開只是看細節
    const relaxed = createEngine(content, { ...engine.rules, imagesMustBeOpened: false });
    let loose = relaxed.step(relaxed.start(), { type: 'sendCover' }).state;
    loose = relaxed.step(loose, { type: 'readThread', thread: photo.thread }).state;
    expect(loose.seen).toContain(photo.item);
    const looked = relaxed.step(loose, { type: 'viewImage', item: photo.item });
    expect(looked.outcomes).toContainEqual({ kind: 'image', item: photo.item });
    expect(looked.state.battery).toBe(loose.battery);

    // 規則打開（預設）：要點開才算
    const strict = createEngine(content, { ...engine.rules, imagesMustBeOpened: true });
    let s = strict.step(strict.start(), { type: 'sendCover' }).state;
    s = strict.step(s, { type: 'readThread', thread: photo.thread }).state;
    expect(s.seen).not.toContain(photo.item);
    expect(s.unopened).toContain(photo.item);
    expect(s.cards).not.toContain(card.id);
    expect(strict.menu(s).images).toContain(photo.item);
    expect(strict.menu(s).concerns.some((c) => c.card === card.id)).toBe(false);
    s = strict.step(s, { type: 'viewImage', item: photo.item }).state;
    expect(s.seen).toContain(photo.item);
    expect(s.unopened).not.toContain(photo.item);
    // 點開之後才輪到它：有「哪裡有問題」這一層就先成為在意的地方，沒有就直接是疑點
    expect(spotAll(strict, s).cards).toContain(card.id);
  });

  it('助理自己記下的疑點只給一個未讀記號，不重複，打開助理 App 就清掉；玩家自己指對的不算', () => {
    const first = engine.step(engine.start(), { type: 'sendCover' });
    // 開局讀群組，助理就會記下一筆（疑點或在意的地方）
    const noted = (s: GameState) => s.cards.length + s.concerns.length;
    expect(first.outcomes.filter((o) => o.kind === 'assistantUnread')).toHaveLength(1);
    expect(noted(first.state)).toBeGreaterThan(0);
    expect(first.state.assistantUnread).toBe(true);
    // 還沒打開之前，再記下新的也不重複通知
    const more = run(first.state, [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }]);
    expect(noted(more.state)).toBeGreaterThan(noted(first.state));
    expect(more.outcomes.some((o) => o.kind === 'assistantUnread')).toBe(false);
    // 玩家自己指對的直接告訴玩家，不動未讀記號
    const concern = engine.menu(more.state).concerns[0];
    const spot = spotOf(content.cards.find((c) => c.id === concern.card)!)!;
    const found = engine.step(more.state, { type: 'spot', card: concern.card, option: spot.options.find((o) => isRightSpot(spot, o.id))!.id });
    expect(found.outcomes.some((o) => o.kind === 'assistantUnread')).toBe(false);
    expect(found.outcomes).toContainEqual(expect.objectContaining({ kind: 'cards', via: 'found' }));
    const assistant = content.apps.apps.find((a) => a.view === 'assistant')!;
    const opened = engine.step(found.state, { type: 'openApp', app: assistant.id });
    expect(opened.state.assistantUnread).toBe(false);
    expect(engine.menu(opened.state).assistantUnread).toBe(false);
  });

  it('在意的地方：條件成立時不直接給疑點，要指出哪裡有問題；指錯扣電、不能重複指，指對才成立', () => {
    // 用副本自己寫一筆，不依賴資料檔裡怎麼寫
    const copy = structuredClone(content);
    for (const c of copy.cards) delete c.spot;
    const card = copy.cards.find((c) => c.id === 'card_oldipad')!;
    card.spot = {
      item: 'fd_ipad',
      prompt: '問句',
      options: [
        { id: 'a', text: '甲' },
        { id: 'b', text: '乙' },
        { id: 'c', text: '丙' },
      ],
      answer: 'b',
    };
    copy.meta.battery.cost.spotMiss = 1;
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s = run(s, [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }], e2).state;
    expect(s.cards).not.toContain('card_oldipad');
    expect(e2.menu(s).concerns).toEqual([{ card: 'card_oldipad', item: 'fd_ipad', options: ['a', 'b', 'c'], missCost: 1 }]);
    expect(e2.menu(s).tests.some((t) => t.card === 'card_oldipad')).toBe(false);

    const miss = e2.step(s, { type: 'spot', card: 'card_oldipad', option: 'a' });
    expect(miss.outcomes).toContainEqual({ kind: 'spot', card: 'card_oldipad', option: 'a', right: false });
    expect(s.battery - miss.state.battery).toBe(1);
    expect(e2.menu(miss.state).concerns[0].options).toEqual(['b', 'c']);
    expect(e2.step(miss.state, { type: 'spot', card: 'card_oldipad', option: 'a' }).outcomes[0].kind).toBe('invalid');

    const hit = e2.step(miss.state, { type: 'spot', card: 'card_oldipad', option: 'b' });
    expect(hit.state.cards).toContain('card_oldipad');
    expect(hit.state.concerns).toEqual([]);
    expect(hit.state.battery).toBe(miss.state.battery);
    expect(hit.outcomes).toContainEqual({ kind: 'cards', cards: ['card_oldipad'], via: 'found' });
  });

  it('答案不只一個時，指到任何一個都算對', () => {
    const copy = structuredClone(content);
    for (const c of copy.cards) delete c.spot;
    copy.cards.find((c) => c.id === 'card_oldipad')!.spot = {
      item: 'fd_ipad',
      options: [
        { id: 'a', text: '甲' },
        { id: 'b', text: '乙' },
        { id: 'c', text: '丙' },
      ],
      answer: ['a', 'c'],
    };
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s = run(s, [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }], e2).state;
    expect(e2.step(s, { type: 'spot', card: 'card_oldipad', option: 'c' }).state.cards).toContain('card_oldipad');
    expect(e2.step(s, { type: 'spot', card: 'card_oldipad', option: 'b' }).state.cards).not.toContain('card_oldipad');
  });

  it('每個人只有最新的一則能回：他傳了新訊息，舊的就不能再回', () => {
    const fromOf = (id: string) => {
      const e = content.events.find((x) => x.id === id);
      return e?.kind === 'message' ? e.from : null;
    };
    const copy = legacy();
    const engine = createEngine(copy);
    let s = engine.step(engine.start(), { type: 'sendCover' }).state;
    let expired: string | null = null;
    // 一路只打開 App、不回任何人，讓大家自己繼續傳
    for (const app of content.apps.apps) {
      const before = s.awaiting;
      s = engine.step(s, { type: 'openApp', app: app.id }).state;
      if (s.phase === 'ended') break;
      const senders = s.awaiting.map(fromOf);
      expect(new Set(senders).size).toBe(senders.length);
      expired ??= before.find((id) => !s.awaiting.includes(id)) ?? null;
    }
    expect(expired).not.toBeNull();
    const option = (content.events.find((x) => x.id === expired) as { options?: { id: string }[] }).options![0].id;
    expect(engine.menu(s).replies.some((r) => r.event === expired)).toBe(false);
    if (s.phase !== 'ended') expect(engine.step(s, { type: 'reply', event: expired!, option }).outcomes[0].kind).toBe('invalid');
  });

  it('已讀不回：看到訊息沒回就離開，先追問一句，再不回就升一級；沒讀過的人不受影響', () => {
    const { nudgeAfterActions, raiseAfterActions } = content.meta.readIgnore!;
    expect(content.meta.battery.ladderAuto).toBe(false);
    const fromOf = (id: string) => (content.events.find((x) => x.id === id) as { from: string; thread: string });
    let s = afterCover();
    const event = s.awaiting.find((id) => fromOf(id).thread !== content.meta.coverThread)!;
    const { from, thread } = fromOf(event);
    const others = content.characters.map((c) => c.id).filter((id) => id !== from);
    const start = { ...s.ladder };
    const said = () => s.threads[thread].appended.filter((m) => m.from === from).length;
    // 讀了、沒回。還停在聊天室裡看照片不算離開
    s = run(s, [{ type: 'readThread', thread }]).state;
    const before = said();
    const apps = content.apps.apps.filter((a) => a.view !== 'chat').map((a) => a.id);
    let next = 0;
    const act = () => (s = run(s, [{ type: 'openApp', app: apps[next++ % apps.length] }]).state);
    // 離開那一步不算，再做滿 nudgeAfterActions 個動作才追問
    act();
    for (let i = 0; i < nudgeAfterActions - 1; i++) act();
    expect(said()).toBe(before);
    act();
    expect(said()).toBe(before + 1);
    expect(s.threads[thread].appended.at(-1)!.text).toEqual(content.characters.find((c) => c.id === from)!.nudges![0]);
    // 追問不是新的問題：原本那一則還能回，階梯也還沒動
    expect(engine.menu(s).replies.some((r) => r.event === event)).toBe(true);
    expect(s.ladder[from]).toBe(start[from]);
    for (let i = 0; i < raiseAfterActions - 1; i++) act();
    expect(s.ladder[from]).toBe(start[from]);
    act();
    expect(s.ladder[from]).toBe(start[from] + 1);
    // 同一則訊息只罰一次：他沒有傳新的一則時，再做多少事都不會再追問、再升級
    if (engine.menu(s).replies.some((r) => r.event === event)) {
      const level = s.ladder[from];
      const count = said();
      for (let i = 0; i < (nudgeAfterActions + raiseAfterActions) * 2; i++) act();
      expect(s.ladder[from]).toBe(level);
      expect(said()).toBe(count);
      expect(engine.menu(s).replies.some((r) => r.event === event)).toBe(true);
    }
    // 沒打開過聊天室的人看不到已讀，不會被這條規則推動；電量也不再推動任何人
    for (const id of others) expect(s.ladder[id]).toBe(start[id]);
  });

  it('已讀不回：回了就不算；點開照片、比對這類不耗電的瀏覽不算動作', () => {
    const { nudgeAfterActions, raiseAfterActions } = content.meta.readIgnore!;
    const fromOf = (id: string) => (content.events.find((x) => x.id === id) as { from: string; thread: string; options: { id: string }[] });
    let s = afterCover();
    const event = s.awaiting.find((id) => fromOf(id).thread !== content.meta.coverThread)!;
    const { from, thread, options } = fromOf(event);
    s = run(s, [{ type: 'readThread', thread }, { type: 'openApp', app: 'photos' }]).state;
    const level = s.ladder[from];
    const said = s.threads[thread].appended.length;
    for (const item of engine.menu(s).images) s = run(s, [{ type: 'viewImage', item }]).state;
    expect(s.threads[thread].appended.length).toBe(said);
    expect(s.ignoring[from]).toEqual({ count: 0, nudged: false });
    // 回了之後，再做多少事他都不會因為已讀不回而升級
    s = run(s, [{ type: 'readThread', thread }, { type: 'reply', event, option: options[0].id }]).state;
    const after = s.ladder[from];
    const mine = s.awaiting.some((id) => fromOf(id).from === from);
    const apps = content.apps.apps.filter((a) => a.view !== 'chat').map((a) => a.id);
    for (let i = 0; i < nudgeAfterActions + raiseAfterActions + 2 && !mine; i++) s = run(s, [{ type: 'openApp', app: apps[i % apps.length] }]).state;
    if (!mine) expect(s.ladder[from]).toBe(after);
    expect(level).toBeDefined();
  });

  it('備忘錄分兩欄、時間軸照故事時間排；心聲只在結論還沒到達時出現', () => {
    const s = run(afterCover(), [{ type: 'openApp', app: 'receipts' }]).state;
    const m = memo(content, s);
    expect(m.records.every((i) => i.kind === 'record')).toBe(true);
    expect(m.statements.map((i) => i.id)).toContain('say_aze_stoodup');
    expect(m.timeline.map((r) => r.item).indexOf('rcp_1628')).toBeLessThan(m.timeline.map((r) => r.item).indexOf('rcp_2207'));
    // 時間軸只放資料裡寫了 timeline 的列，每一列帶自己的時間和文字
    const rowsWanted = s.seen.flatMap((id) => content.items.find((i) => i.id === id && !i.flavor)?.timeline ?? []);
    const startRows = content.meta.timelineStart ?? [];
    expect(m.timeline).toHaveLength(rowsWanted.length + startRows.length);
    // 開局就有的列不用看過任何東西，還沒送出開局那句也在
    const atStart = memo(content, engine.start()).timeline;
    expect(atStart.map((r) => r.text)).toEqual(startRows.map((r) => r.text));
    expect(atStart.every((r) => r.item === undefined && r.id.startsWith('start#'))).toBe(true);
    expect(m.timeline.every((r) => r.when && r.label && r.text)).toBe(true);
    expect(new Set(m.timeline.map((r) => r.id)).size).toBe(m.timeline.length);
    expect(reachedConclusions(content, s)).toContain('time_window');
  });

  it('再想想：一次給一句、照順序、每次扣電；給完就不能再按', () => {
    // 用副本自己寫三句，不依賴資料檔的句子
    const copy = structuredClone(content);
    const card = copy.cards.find((c) => c.id === 'card_oldipad')!;
    card.hints = ['第一句', '第二句', '第三句'];
    copy.meta.battery.cost.hint = 1;
    const e2 = createEngine(copy);
    let s = run(e2.step(e2.start(), { type: 'sendCover' }).state, [{ type: 'openApp', app: 'finder' }, { type: 'locate', app: 'finder' }], e2).state;
    // 還在「在意的地方」階段或已經成立，都可以想
    const before = e2.menu(s).thoughts.find((t) => t.card === card.id)!;
    expect(before).toMatchObject({ shown: [], more: true, cost: 1, thinkOnly: false });
    const battery = s.battery;
    const first = e2.step(s, { type: 'think', card: card.id });
    expect(first.outcomes[0]).toMatchObject({ kind: 'hint', card: card.id, index: 0, text: '第一句', more: true });
    s = first.state;
    expect(s.battery).toBe(battery - 1);
    s = e2.step(s, { type: 'think', card: card.id }).state;
    const last = e2.step(s, { type: 'think', card: card.id });
    expect(last.outcomes[0]).toMatchObject({ kind: 'hint', index: 2, text: '第三句', more: false });
    s = last.state;
    expect(s.battery).toBe(battery - 3);
    expect(e2.menu(s).thoughts.find((t) => t.card === card.id)).toMatchObject({ shown: ['第一句', '第二句', '第三句'], more: false });
    expect(e2.step(s, { type: 'think', card: card.id }).outcomes[0].kind).toBe('invalid');
    // 手上沒有的疑點不能想
    expect(e2.step(e2.step(e2.start(), { type: 'sendCover' }).state, { type: 'think', card: card.id }).outcomes[0].kind).toBe('invalid');
    // 指對之後，想過的句子還在
    s = spotAll(e2, s);
    expect(e2.menu(s).thoughts.find((t) => t.card === card.id)).toMatchObject({ concern: false, shown: ['第一句', '第二句', '第三句'] });
  });

  it('聊天室的舊訊息滑到才算看過：打開只算畫面上那幾則，其餘要往上滑', () => {
    // 挑一個開局還沒讀過的聊天室（送出掩護說法的那個群組開局就讀了）
    const opened = afterCover().readThreads;
    const thread = content.threads.find((t) => !opened.includes(t.id) && (t.history ?? []).filter((m) => m.item).length >= 2)!;
    const all = (thread.history ?? []).flatMap((m) => (m.item ? [m.item] : []));
    const shown = all.slice(-1);
    const above = all.slice(0, -1);
    let s = engine.step(afterCover(), { type: 'openApp', app: content.apps.apps.find((a) => a.view === 'chat')!.id }).state;
    expect(engine.menu(s).threads.find((t) => t.thread === thread.id)?.unseen).toEqual(all);
    // 還沒打開聊天室不能滑
    expect(engine.step(s, { type: 'seeMessages', thread: thread.id, items: above }).outcomes[0].kind).toBe('invalid');
    s = engine.step(s, { type: 'readThread', thread: thread.id, visible: shown }).state;
    const reached = (id: string) => s.seen.includes(id) || s.unopened.includes(id);
    expect(shown.every(reached)).toBe(true);
    expect(above.some(reached)).toBe(false);
    expect(engine.menu(s).threads.find((t) => t.thread === thread.id)?.unseen).toEqual(above);
    // 往上滑：不耗電，滑到的才算；別的聊天室的東西不會被算進來
    const battery = s.battery;
    const stranger = content.items.find((i) => !all.includes(i.id) && !reached(i.id))!;
    s = engine.step(s, { type: 'seeMessages', thread: thread.id, items: [above[0], stranger.id] }).state;
    expect(reached(above[0])).toBe(true);
    expect(reached(stranger.id)).toBe(false);
    expect(s.battery).toBe(battery);
    s = engine.step(s, { type: 'seeMessages', thread: thread.id, items: above }).state;
    expect(engine.menu(s).threads.find((t) => t.thread === thread.id)?.unseen).toEqual([]);
    // 沒給 visible（文字試玩整串印出來）就整串都算
    const whole = engine.step(engine.step(afterCover(), { type: 'openApp', app: content.apps.apps.find((a) => a.view === 'chat')!.id }).state, { type: 'readThread', thread: thread.id }).state;
    expect(all.every((id) => whole.seen.includes(id) || whole.unopened.includes(id))).toBe(true);
  });

  it('開局那個群組的舊訊息也是滑到才算看過', () => {
    const thread = content.threads.find((t) => t.id === (content.meta.coverThread ?? content.threads[0].id))!;
    const all = (thread.history ?? []).flatMap((m) => (m.item ? [m.item] : []));
    expect(all.length).toBeGreaterThan(1);
    const shown = all.slice(-1);
    const above = all.slice(0, -1);
    let s = engine.step(engine.start(), { type: 'sendCover', visible: shown }).state;
    const reached = (id: string) => s.seen.includes(id) || s.unopened.includes(id);
    expect(s.readThreads).toContain(thread.id);
    expect(shown.every(reached)).toBe(true);
    expect(above.some(reached)).toBe(false);
    // 沒滑到的說法不會讓助理先記下「在意的地方」
    const early = content.cards.filter((c) => c.spot && above.includes(c.spot.item)).map((c) => c.id);
    expect(s.concerns.some((x) => early.includes(x.card))).toBe(false);
    expect(engine.menu(s).threads.find((t) => t.thread === thread.id)?.unseen).toEqual(above);
    s = engine.step(s, { type: 'seeMessages', thread: thread.id, items: above }).state;
    expect(above.every(reached)).toBe(true);
    // 沒給 visible（文字試玩整串印出來）就整串都算
    const whole = afterCover();
    expect(all.every((id) => whole.seen.includes(id) || whole.unopened.includes(id))).toBe(true);
  });

  it('滑到就算看過的 App（動態牆）：打開只算畫面上那幾筆，往下滑才算其餘的，有照片的也不用點開', () => {
    // 用副本自己標，不依賴資料檔標了哪個 App
    const copy = structuredClone(content);
    const app = copy.apps.apps.find((a) => copy.items.filter((i) => i.app === a.id && !i.thread && !i.hidden && !i.needsLocate).length >= 3 && copy.items.some((i) => i.app === a.id && i.image && !i.hidden))!;
    for (const a of copy.apps.apps) delete a.seeOnScroll;
    app.seeOnScroll = true;
    const page = copy.items.filter((i) => i.app === app.id && !i.thread && !i.hidden && !i.needsLocate).map((i) => i.id);
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover', visible: [] }).state;
    expect(e2.menu(s).apps.find((a) => a.app === app.id)?.unseen).toEqual(page);
    expect(e2.step(s, { type: 'seeItems', app: app.id, items: page }).outcomes[0].kind).toBe('invalid');
    s = e2.step(s, { type: 'openApp', app: app.id, visible: page.slice(0, 1) }).state;
    expect(s.seen).toContain(page[0]);
    expect(page.slice(1).some((id) => s.seen.includes(id) || s.unopened.includes(id))).toBe(false);
    expect(e2.menu(s).apps.find((a) => a.app === app.id)?.unseen).toEqual(page.slice(1));
    const battery = s.battery;
    const stranger = copy.items.find((i) => i.app !== app.id && !s.seen.includes(i.id))!;
    s = e2.step(s, { type: 'seeItems', app: app.id, items: [...page, stranger.id] }).state;
    // 有照片的也直接算看過，不用點開
    expect(page.every((id) => s.seen.includes(id))).toBe(true);
    expect(s.unopened.some((id) => page.includes(id))).toBe(false);
    expect(s.seen).not.toContain(stranger.id);
    expect(s.battery).toBe(battery);
    // 沒給 visible（文字試玩）就整頁都算
    const whole = e2.step(e2.step(e2.start(), { type: 'sendCover' }).state, { type: 'openApp', app: app.id }).state;
    expect(page.every((id) => whole.seen.includes(id))).toBe(true);
    // 沒標的 App 不能用這個動作，照片照舊要點開
    const other = copy.apps.apps.find((a) => a.id !== app.id && copy.items.some((i) => i.app === a.id && i.image && !i.hidden && !i.thread))!;
    const opened = e2.step(s, { type: 'openApp', app: other.id }).state;
    expect(e2.step(opened, { type: 'seeItems', app: other.id, items: [] }).outcomes[0].kind).toBe('invalid');
    expect(opened.unopened.length).toBeGreaterThan(0);
  });

  it('同一張疑點可以依對象在不同的聊天室問（threadTo）：有寫的用指定的，沒寫的用私訊', () => {
    const copy = structuredClone(content);
    const group = copy.threads.find((t) => t.members.length > 1)!;
    const [a, b] = group.members;
    const card = copy.cards.find((c) => !c.thinkOnly)!;
    delete card.thread;
    delete card.targets;
    card.threadTo = { [a]: group.id };
    const e2 = createEngine(copy);
    const dm = (who: string) => copy.threads.find((t) => t.members.length === 1 && t.members[0] === who)!.id;
    expect(e2.testThread(card, a)).toBe(group.id);
    expect(e2.testThread(card, b)).toBe(dm(b));
    let s: GameState = { ...e2.step(e2.start(), { type: 'sendCover' }).state, concerns: [], cards: [card.id] };
    for (const t of copy.threads) s = e2.step(s, { type: 'readThread', thread: t.id }).state;
    expect(e2.menu(s).tests.find((t) => t.card === card.id)?.threadOf).toMatchObject({ [a]: group.id, [b]: dm(b) });
    const sent = (who: string) => e2.step(s, { type: 'test', card: card.id, target: who }).outcomes.find((o) => o.kind === 'sent');
    expect(sent(a)).toMatchObject({ thread: group.id });
    expect(sent(b)).toMatchObject({ thread: dm(b) });
  });

  // 來電的測試用副本自己寫事件，開局就打來，不依賴資料檔
  function withCall(extra: Record<string, unknown> = {}) {
    const copy = structuredClone(content);
    copy.meta.readIgnore = undefined;
    const who = copy.characters[0].id;
    const thread = copy.threads.find((t) => t.members.length === 1 && t.members[0] === who)!.id;
    const message = (id: string, options?: unknown) => ({ id, kind: 'message', thread, from: who, text: [id], ...(options ? { options } : {}) });
    const events = [
      { id: 'call_test', kind: 'call', from: who, onDecline: { effects: { flags: { hung_up: true } }, then: ['msg_after_decline'] }, onMissed: { then: ['msg_after_missed'] }, ...extra },
      message('msg_after_decline'),
      message('msg_after_missed', [{ id: 'calm', text: '別打了', effects: { flags: { calm: true } } }]),
    ];
    copy.events.push(...(events as unknown as typeof copy.events));
    copy.meta.afterCover = ['call_test'];
    copy.meta.afterCoverEffects = undefined;
    const e2 = createEngine(copy);
    return { copy, e2, who, thread, start: e2.step(e2.start(), { type: 'sendCover' }) };
  }

  it('來電：響的時候只能掛斷或讓它響完；掛斷扣電、對方知道被按掉', () => {
    const { copy, e2, who, start } = withCall();
    expect(start.outcomes).toContainEqual({ kind: 'call', event: 'call_test', from: who });
    const s = start.state;
    expect(e2.menu(s).call).toEqual({ event: 'call_test', from: who, declineCost: cost.callDecline ?? 0, ringCost: cost.callRing ?? 0 });
    // 響著的時候別的事都不能做
    expect(e2.step(s, { type: 'openApp', app: copy.apps.apps[0].id }).outcomes[0].kind).toBe('invalid');
    const r = e2.step(s, { type: 'declineCall' });
    expect(r.outcomes).toContainEqual({ kind: 'callEnded', event: 'call_test', from: who, declined: true, cost: cost.callDecline ?? 0 });
    expect(s.battery - r.state.battery).toBe(cost.callDecline ?? 0);
    expect(r.state.call).toBeNull();
    expect(r.state.flags.hung_up).toBe(true);
    expect(r.state.fired).toContain('msg_after_decline');
    expect(r.state.fired).not.toContain('msg_after_missed');
    expect(r.state.missedCalls).toEqual([]);
    // 沒有來電的時候這兩個動作不能用
    expect(e2.step(r.state, { type: 'declineCall' }).outcomes[0].kind).toBe('invalid');
    expect(e2.step(r.state, { type: 'letRing' }).outcomes[0].kind).toBe('invalid');
  });

  it('來電：放著響完扣比較多電，記一筆未接來電，走另一條後續', () => {
    const { e2, who, start } = withCall();
    const r = e2.step(start.state, { type: 'letRing' });
    expect(r.outcomes).toContainEqual({ kind: 'callEnded', event: 'call_test', from: who, declined: false, cost: cost.callRing ?? 0 });
    expect(start.state.battery - r.state.battery).toBe(cost.callRing ?? 0);
    expect(r.state.missedCalls).toEqual([{ event: 'call_test', from: who }]);
    expect(e2.menu(r.state).missedCalls).toEqual([{ event: 'call_test', from: who }]);
    expect(r.state.flags.hung_up).toBeUndefined();
    expect(r.state.fired).toContain('msg_after_missed');
    expect(r.state.fired).not.toContain('msg_after_decline');
  });

  it('連環來電：條件成立之前每隔幾個動作再打一通、每通照樣扣電，後續事件不重複；條件成立就停', () => {
    const { copy, e2, thread, start } = withCall({ repeat: { everyActions: 2, until: { flags: { calm: true } } } });
    const app = copy.apps.apps.find((a) => a.view !== 'chat' && a.view !== 'assistant')!.id;
    const messages = (st: GameState) => st.threads[thread].appended.filter((m) => m.text[0] === 'msg_after_missed').length;
    let s = e2.step(start.state, { type: 'letRing' }).state;
    expect(messages(s)).toBe(1);
    // 看和想不算動作；算動作的做滿兩個才再打
    s = e2.step(s, { type: 'viewProfile', character: copy.characters[1].id }).state;
    s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.call).toBeNull();
    const second = e2.step(s, { type: 'openApp', app });
    expect(second.outcomes.filter((o) => o.kind === 'call')).toHaveLength(1);
    s = second.state;
    const before = s.battery;
    s = e2.step(s, { type: 'letRing' }).state;
    expect(before - s.battery).toBe(cost.callRing ?? 0);
    expect(s.missedCalls).toHaveLength(2);
    // 後續那則訊息已經發生過，不會再傳一次
    expect(messages(s)).toBe(1);
    // 第三通照樣打來
    s = e2.step(e2.step(s, { type: 'openApp', app }).state, { type: 'openApp', app }).state;
    expect(s.call).not.toBeNull();
    s = e2.step(s, { type: 'letRing' }).state;
    expect(s.missedCalls).toHaveLength(3);
    // 回一句讓條件成立，之後就不再打
    s = e2.step(s, { type: 'readThread', thread }).state;
    expect(s.call).toBeNull();
    s = e2.step(s, { type: 'reply', event: 'msg_after_missed', option: 'calm' }).state;
    expect(s.flags.calm).toBe(true);
    for (let i = 0; i < 6; i++) s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.call).toBeNull();
    // 條件成立的期間不打也不累計（之後條件又不成立才會重新數）
    expect(s.callRepeat).toEqual({ call_test: 0 });
  });

  it('連環來電停了之後，條件又不成立就重新開打', () => {
    const { copy, e2, thread, start } = withCall({ repeat: { everyActions: 2, until: { flags: { calm: true } } } });
    const app = copy.apps.apps.find((a) => a.view !== 'chat' && a.view !== 'assistant')!.id;
    let s = e2.step(start.state, { type: 'letRing' }).state;
    s = e2.step(s, { type: 'readThread', thread }).state;
    s = e2.step(s, { type: 'reply', event: 'msg_after_missed', option: 'calm' }).state;
    for (let i = 0; i < 5; i++) s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.call).toBeNull();
    // 條件被改回不成立（資料裡是另一則訊息的效果）：過兩個動作又打來
    s = { ...s, flags: { ...s.flags, calm: false } };
    s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.call).toBeNull();
    s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.call).toEqual({ event: 'call_test', from: copy.characters[0].id });
  });

  it('被已讀不回而受罰的時候，另外觸發那個人的 onIgnored 事件（只發生一次）', () => {
    const copy = structuredClone(content);
    copy.meta.readIgnore = { nudgeAfterActions: 1, raiseAfterActions: 1 };
    const who = copy.characters.find((c) => c.nudges?.length && copy.events.some((e) => e.kind === 'message' && e.from === c.id && e.options?.length))!;
    const thread = copy.threads.find((t) => t.members.length === 1 && t.members[0] === who.id)!.id;
    const extra = [
      { id: 'msg_wait_reply', kind: 'message', thread, from: who.id, text: ['在嗎'], options: [{ id: 'ok', text: '在' }] },
      { id: 'msg_you_ignored', kind: 'message', thread, from: who.id, text: ['妳說過會回的'] },
    ];
    copy.events.push(...(extra as unknown as typeof copy.events));
    copy.meta.afterCover = ['msg_wait_reply'];
    copy.meta.afterCoverEffects = undefined;
    who.onIgnored = ['msg_you_ignored'];
    const e2 = createEngine(copy);
    const app = copy.apps.apps.find((a) => a.view !== 'chat' && a.view !== 'assistant')!.id;
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    // 讀了沒回就離開，一直做別的事，直到她受不了
    s = e2.step(s, { type: 'readThread', thread }).state;
    for (let i = 0; i < 6 && !s.fired.includes('msg_you_ignored'); i++) s = e2.step(s, { type: 'openApp', app }).state;
    expect(s.ignoredOut).toContain('msg_wait_reply');
    expect(s.fired).toContain('msg_you_ignored');
    expect(s.threads[thread].appended.filter((m) => m.text[0] === '妳說過會回的')).toHaveLength(1);
  });

  it('進某一級時發生的事把他退回去（有人替玩家擋掉）：往上那筆排在前面，那一級之後的不再走', () => {
    const copy = legacy();
    const jw = copy.characters.find((c) => c.id === copy.endings.challenge.culprit)!;
    for (const l of jw.ladder) {
      delete l.needsContact;
      delete l.when;
    }
    const thread = copy.threads.find((t) => t.members.length === 1)!;
    copy.events.push({ id: 'msg_blocked', kind: 'message', thread: thread.id, from: thread.members[0], text: ['我幫妳擋了'], effects: { ladder: { [jw.id]: -1 } } } as unknown as (typeof copy.events)[number]);
    jw.ladder.find((l) => l.level === 2)!.onEnter = ['msg_blocked'];
    // 借一個回覆選項，讓它一次把她往上推三級
    const e = copy.events.find((x) => x.kind === 'message' && x.id === 'cov_py_dm')!;
    if (e.kind !== 'message') throw new Error('找不到那則訊息');
    e.options![0].effects = { ladder: { [jw.id]: 3 } };
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s = e2.step(s, { type: 'readThread', thread: e.thread }).state;
    const from = s.ladder[jw.id] ?? 0;
    if (from !== 1) return;
    const r = e2.step(s, { type: 'reply', event: e.id, option: e.options![0].id });
    const moves = r.outcomes.filter((o) => o.kind === 'ladder' && o.character === jw.id);
    expect(moves).toEqual([
      { kind: 'ladder', character: jw.id, from: 1, to: 2, auto: false },
      { kind: 'ladder', character: jw.id, from: 2, to: 1, auto: false },
    ]);
    expect(r.state.ladder[jw.id]).toBe(1);
    expect(r.outcomes.findIndex((o) => o.kind === 'ladder')).toBeLessThan(r.outcomes.findIndex((o) => o.kind === 'message' && o.event === 'msg_blocked'));
  });

  it('回覆選項可以接著觸發事件（triggers）；事件帶 delay 的話過一陣子才出現', () => {
    const copy = structuredClone(content);
    copy.meta.readIgnore = undefined;
    const who = copy.characters[0].id;
    const thread = copy.threads.find((t) => t.members.length === 1 && t.members[0] === who)!.id;
    const extra = [
      { id: 'msg_ask', kind: 'message', thread, from: who, text: ['在嗎'], options: [{ id: 'now', text: '在', triggers: ['msg_now'] }, { id: 'later', text: '等等', triggers: ['msg_later'] }] },
      { id: 'msg_now', kind: 'message', thread, from: who, text: ['好'] },
      { id: 'msg_later', kind: 'message', thread, from: who, text: ['我回來了'], delay: 2 },
    ];
    copy.events.push(...(extra as unknown as typeof copy.events));
    copy.meta.afterCover = ['msg_ask'];
    copy.meta.afterCoverEffects = undefined;
    const e2 = createEngine(copy);
    const s = e2.step(e2.step(e2.start(), { type: 'sendCover' }).state, { type: 'readThread', thread }).state;
    expect(e2.step(s, { type: 'reply', event: 'msg_ask', option: 'now' }).state.fired).toContain('msg_now');
    let later = e2.step(s, { type: 'reply', event: 'msg_ask', option: 'later' }).state;
    expect(later.fired).not.toContain('msg_now');
    if (!later.fired.includes('msg_later')) {
      // 還沒到：再耗一些電就出現
      for (const a of copy.apps.apps) if (!later.fired.includes('msg_later')) later = e2.step(later, { type: 'openApp', app: a.id }).state;
    }
    expect(later.fired).toContain('msg_later');
  });

  it('不理玩家的人（silentWhen）：問他、回他都只有已讀、沒有效果但照扣電；不催、不升級、不打來、不插話', () => {
    const copy = structuredClone(content);
    copy.meta.readIgnore = { nudgeAfterActions: 1, raiseAfterActions: 1 };
    const who = copy.characters.find((c) => copy.reactions.some((r) => r.target === c.id && !r.when))!;
    who.silentWhen = { flags: { gone: true } };
    const thread = copy.threads.find((t) => t.members.length === 1 && t.members[0] === who.id)!.id;
    const extra = [
      { id: 'msg_last_word', kind: 'message', thread, from: who.id, text: ['算了'], options: [{ id: 'sorry', text: '對不起', reply: ['沒事'], effects: { flags: { forgiven: true }, ladder: { [who.id]: 1 } }, triggers: ['msg_after_sorry'] }] },
      { id: 'msg_after_sorry', kind: 'message', thread, from: who.id, text: ['好啦'] },
      { id: 'call_from_silent', kind: 'call', from: who.id },
    ];
    copy.events.push(...(extra as unknown as typeof copy.events));
    copy.meta.afterCover = ['msg_last_word'];
    copy.meta.afterCoverEffects = undefined;
    const reaction = copy.reactions.find((r) => r.target === who.id && !r.when)!;
    const card = copy.cards.find((c) => c.id === reaction.card)!;
    delete card.thread;
    delete card.threadTo;
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s = e2.step(s, { type: 'readThread', thread }).state;
    s = { ...s, flags: { ...s.flags, gone: true }, cards: [card.id], concerns: [] };
    expect(e2.menu(s).silent).toEqual([who.id]);
    const level = s.ladder[who.id] ?? 0;
    // 回他：送出去了，只有已讀；選項的效果、後續都沒有發生
    const replied = e2.step(s, { type: 'reply', event: 'msg_last_word', option: 'sorry' });
    expect(replied.outcomes.map((o) => o.kind)).toContain('sent');
    expect(replied.outcomes).toContainEqual({ kind: 'noReply', thread, character: who.id });
    expect(replied.outcomes.some((o) => o.kind === 'message')).toBe(false);
    expect(replied.state.flags.forgiven).toBeUndefined();
    expect(replied.state.fired).not.toContain('msg_after_sorry');
    expect(replied.state.ladder[who.id] ?? 0).toBe(level);
    expect(replied.state.awaiting).not.toContain('msg_last_word');
    // 問他：一樣只有已讀，反應表不會用到，但照扣電
    const asked = e2.step(s, { type: 'test', card: card.id, target: who.id });
    expect(asked.outcomes).toContainEqual({ kind: 'noReply', thread, character: who.id });
    expect(asked.outcomes.some((o) => o.kind === 'message')).toBe(false);
    expect(s.battery - asked.state.battery).toBe(cost.test ?? 0);
    for (const id of reaction.reveals ?? []) expect(asked.state.seen).not.toContain(id);
    // 已讀不回他：不催、不升級
    const app = copy.apps.apps.find((a) => a.view !== 'chat' && a.view !== 'assistant')!.id;
    let idle = s;
    for (let i = 0; i < 6; i++) idle = e2.step(idle, { type: 'openApp', app }).state;
    expect(idle.threads[thread].appended.length).toBe(s.threads[thread].appended.length);
    expect(idle.ladder[who.id] ?? 0).toBe(level);
    // 還沒不理人的時候，同樣的回覆是有效果的（對照）
    const before = e2.step({ ...s, flags: {} }, { type: 'reply', event: 'msg_last_word', option: 'sorry' });
    expect(before.state.flags.forgiven).toBe(true);
    expect(before.state.fired).toContain('msg_after_sorry');
  });

  it('看個人頁面：自介是一筆說法的，打開才算看過，不耗電；沒有的人打開沒有效果', () => {
    // 用副本自己指定，不依賴資料檔是哪個人
    const copy = structuredClone(content);
    const who = copy.characters[0];
    const other = copy.characters[1];
    const bio = copy.items.find((i) => i.kind === 'statement' && !i.flavor && !i.image)!;
    bio.hidden = true;
    who.bioItem = bio.id;
    delete other.bioItem;
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s.seen = s.seen.filter((id) => id !== bio.id);
    expect(e2.menu(s).profiles.some((p) => p.character === who.id && p.seen)).toBe(false);
    for (const t of copy.threads) s = e2.step(s, { type: 'readThread', thread: t.id }).state;
    s.seen = s.seen.filter((id) => id !== bio.id);
    expect(e2.menu(s).profiles).toContainEqual({ character: who.id, item: bio.id, seen: false });
    const battery = s.battery;
    const nothing = e2.step(s, { type: 'viewProfile', character: other.id });
    expect(nothing.outcomes.map((o) => o.kind)).not.toContain('items');
    const result = e2.step(s, { type: 'viewProfile', character: who.id });
    expect(result.state.seen).toContain(bio.id);
    expect(result.state.battery).toBe(battery);
    expect(e2.menu(result.state).profiles).toContainEqual({ character: who.id, item: bio.id, seen: true });
    expect(memo(copy, result.state).statements.map((i) => i.id)).toContain(bio.id);
  });

  it('只能自己想的疑點（thinkOnly）：條件成立就出現，可以再想想，不能拿去問任何人', () => {
    const copy = structuredClone(content);
    const mine = { id: 'card_only_think', title: '只能自己想', thinkOnly: true, hints: ['想一下'], availableWhen: { seen: ['rcp_1628'] } };
    copy.cards.push(mine as unknown as (typeof copy.cards)[number]);
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    for (const t of copy.threads) s = e2.step(s, { type: 'readThread', thread: t.id }).state;
    s = e2.step(s, { type: 'openApp', app: 'receipts' }).state;
    expect(s.cards).toContain(mine.id);
    const m = e2.menu(s);
    expect(m.tests.some((t) => t.card === mine.id)).toBe(false);
    expect(m.thoughts.find((t) => t.card === mine.id)).toMatchObject({ thinkOnly: true, more: true });
    for (const c of copy.characters) expect(e2.step(s, { type: 'test', card: mine.id, target: c.id }).outcomes[0].kind).toBe('invalid');
    expect(e2.step(s, { type: 'think', card: mine.id }).outcomes[0]).toMatchObject({ kind: 'hint', text: '想一下', more: false });
  });
});
