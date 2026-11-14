import { describe, expect, it } from 'vitest';
import { loadCase } from '../content';
import { createEngine, isRightSpot, memo, reachedConclusions, spotOf, voice, type Action, type Engine, type GameState, type Outcome } from './index';

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
  delete copy.meta.readIgnore;
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

  it('比對：矛盾解鎖牌、沒有對應回傳看不出關聯、不耗電', () => {
    const s = run(afterCover(), [{ type: 'openApp', app: 'receipts' }]).state;
    const none = engine.step(s, { type: 'compare', statement: 'say_aze_stoodup', record: 'rcp_1628' });
    expect(none.outcomes).toContainEqual({ kind: 'link', statement: 'say_aze_stoodup', record: 'rcp_1628', result: 'none' });
    const hit = engine.step(s, { type: 'compare', statement: 'say_aze_stoodup', record: 'rcp_1842' });
    expect(hit.state.cards).toContain('card_latte');
    expect(hit.state.battery).toBe(s.battery);
  });

  it('測試：有反應用反應表，沒有就輪流用通用反應', () => {
    let s = run(afterCover(), [
      { type: 'openApp', app: 'receipts' },
      { type: 'compare', statement: 'say_aze_stoodup', record: 'rcp_1842' },
      { type: 'readThread', thread: 'dm_aze' },
      { type: 'readThread', thread: 'dm_zonghan' },
    ]).state;
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
    // 一直回訊息把電耗下去（不依賴資料裡的間隔數字），直到輪到她
    for (let i = 0; i < 20 && s.phase === 'play' && s.ladder[jw.id] < gate.level; i++) {
      const id = s.awaiting[0];
      const e = copy.events.find((x) => x.id === id);
      if (e?.kind !== 'message') break;
      s = e2.step(s, { type: 'reply', event: id, option: e.options![e.options!.length - 1].id }).state;
    }
    expect(s.attended.length).toBeGreaterThan(0);
    expect(s.ladder[jw.id]).toBeGreaterThanOrEqual(gate.level);
    expect(s.seen).toContain('rec_login');
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
    // 回她本人一句之後，再耗一段電就照常往上
    const mine = s.awaiting.find((id) => copy.events.find((e) => e.id === id && e.kind === 'message' && e.from === jw.id));
    const event = copy.events.find((e) => e.id === mine);
    if (event?.kind !== 'message') throw new Error('沒有她等著回的訊息');
    s = e2.step(s, { type: 'reply', event: event.id, option: event.options![event.options!.length - 1].id }).state;
    expect(s.attended).toContain(jw.id);
    for (let i = 0; i < 20 && s.phase === 'play' && s.ladder[jw.id] < gate.level; i++) {
      const id = s.awaiting[0];
      const e = copy.events.find((x) => x.id === id);
      if (e?.kind !== 'message') break;
      s = e2.step(s, { type: 'reply', event: id, option: e.options![e.options!.length - 1].id }).state;
    }
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

  it('指認兇手一題一題問：答錯扣電、同一筆不能再選，答對才問下一題，全部答完才選交給誰', () => {
    const ch = content.endings.challenge;
    const sequence = ch.sequence!;
    // 直接把所有東西都當作看過，不依賴資料檔裡怎麼拿到
    let s: GameState = { ...afterCover(), seen: content.items.map((i) => i.id) };
    const ask = () => engine.menu(s).challenge!.ask!;
    expect(engine.step(s, { type: 'submitChallenge', accused: ch.culprit, fields: {}, givenTo: ch.recipients[0] }).outcomes[0].kind).toBe('invalid');
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
      const wrong = ask().options.find((id) => !field.accept.some((g) => g.includes(id)))!;
      const miss = engine.step(s, { type: 'answerChallenge', answer: wrong });
      expect(miss.outcomes).toContainEqual({ kind: 'challengeAnswer', question, answer: wrong, right: false, cost: cost.challengeRetry });
      expect(s.battery - miss.state.battery).toBe(cost.challengeRetry);
      expect(miss.state.accusation.step).toBe(index);
      expect(engine.menu(miss.state).challenge!.ask!.options).not.toContain(wrong);
      expect(engine.step(miss.state, { type: 'answerChallenge', answer: wrong }).outcomes[0].kind).toBe('invalid');
      const hit = engine.step(miss.state, { type: 'answerChallenge', answer: field.accept[0][0] });
      expect(hit.outcomes).toContainEqual({ kind: 'challengeAnswer', question, answer: field.accept[0][0], right: true, cost: 0 });
      expect(hit.state.battery).toBe(miss.state.battery);
      s = hit.state;
    });
    expect(ask()).toMatchObject({ question: null, options: ch.recipients });
    expect(engine.step(s, { type: 'handOver', givenTo: 'pinyu' }).state.ended).toBe('end_pinyu');
  });

  it('挑戰書（沒寫提問順序時的舊流程）：指錯人直接進結局；指對人但欄位沒選對就退回並扣電', () => {
    const copy = structuredClone(content);
    delete copy.endings.challenge.sequence;
    const engine = createEngine(copy);
    const s = run(engine.step(engine.start(), { type: 'sendCover' }).state, [
      { type: 'openApp', app: 'photos' },
      { type: 'viewImage', item: 'ph_compare' },
      { type: 'viewImage', item: 'ph_ipad' },
      { type: 'viewImage', item: 'ph_boxes' },
      { type: 'openApp', app: 'weather' },
      { type: 'openApp', app: 'sms' },
    ]).state;
    const fields = { motive: ['ph_compare'], alibi: ['wx_taichung_sat'], method: ['sms_er'], presence: ['sms_er'] };
    const wrong = engine.step(s, { type: 'submitChallenge', accused: 'zonghan', fields, givenTo: 'pinyu' });
    expect(wrong.state.ended).toBe('end_wrong_zonghan');
    const retry = engine.step(s, { type: 'submitChallenge', accused: 'jingwen', fields, givenTo: 'pinyu' });
    expect(retry.state.ended).toBeNull();
    expect(retry.outcomes).toContainEqual({ kind: 'challengeRejected', fields: ['method', 'presence'], cost: cost.challengeRetry });
    expect(s.battery - retry.state.battery).toBe(cost.challengeRetry);
    const tooMany = engine.step(s, { type: 'submitChallenge', accused: 'jingwen', fields: { ...fields, motive: ['ph_compare', 'ph_ipad', 'ph_boxes'] }, givenTo: 'pinyu' });
    expect(tooMany.outcomes[0].kind).toBe('invalid');
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
    expect(engine.menu(s).challenge?.records ?? []).not.toContain(flavor.id);
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

  it('助理自己記下的疑點只給一個未讀記號，不重複，打開助理 App 就清掉；比對出來的不算', () => {
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
    // 比對出來的直接告訴玩家，不動未讀記號
    const withReceipts = run(more.state, [{ type: 'openApp', app: 'receipts' }]).state;
    const found = engine.step(withReceipts, { type: 'compare', statement: 'say_aze_stoodup', record: 'rcp_1842' });
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
    expect(m.timeline).toHaveLength(rowsWanted.length);
    expect(m.timeline.every((r) => r.when && r.text)).toBe(true);
    expect(new Set(m.timeline.map((r) => r.id)).size).toBe(m.timeline.length);
    expect(reachedConclusions(content, s)).toContain('time_window');
    const lines = voice(engine, s).map((l) => l.id);
    expect(lines).toContain('v_coma_1');
    expect(lines.some((id) => id.startsWith('v_time'))).toBe(false);
  });
});
