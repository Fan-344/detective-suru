import { describe, expect, it } from 'vitest';
import { loadCase } from '../content';
import { createEngine, memo, reachedConclusions, voice, type Action, type GameState, type Outcome } from './index';

const content = loadCase('case01');
const engine = createEngine(content);
const cost = content.meta.battery.cost;

/** 依序執行動作；任何一步不合法就讓測試失敗 */
function run(state: GameState, actions: Action[]): { state: GameState; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  for (const action of actions) {
    const r = engine.step(state, action);
    const bad = r.outcomes.find((o) => o.kind === 'invalid');
    if (bad && bad.kind === 'invalid') throw new Error(`${JSON.stringify(action)}：${bad.reason}`);
    state = r.state;
    outcomes.push(...r.outcomes);
  }
  return { state, outcomes };
}

const afterCover = () => run(engine.start(), [{ type: 'sendCover' }]).state;

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
    let s = run(afterCover(), [
      { type: 'readThread', thread: 'dm_pinyu' },
      { type: 'reply', event: 'cov_py_dm', option: 'sleepy' },
    ]).state;
    expect(s.soothe.pinyu).toBe('calm');
    for (const app of ['sms', 'notes', 'receipts', 'weather', 'phone']) {
      if (s.spent < content.meta.battery.ladderTickEvery) s = run(s, [{ type: 'openApp', app }]).state;
    }
    expect(s.spent).toBeGreaterThanOrEqual(content.meta.battery.ladderTickEvery);
    expect(s.ladder.pinyu).toBe(1);
    expect(s.ladder.zonghan).toBe(2);
    expect(s.fired).toContain('msg_zh_refund');
    expect(s.soothe).toEqual({});
  });

  it('紙袋牌引出登入視窗；可以按按鈕、關掉，或放著去做別的事（等於不理它）', () => {
    let s = run(afterCover(), [{ type: 'openApp', app: 'receipts' }]).state;
    expect(s.cards).toContain('card_bag');
    s = run(s, [{ type: 'test', card: 'card_bag', target: 'zonghan' }]).state;
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

  it('視窗上的軟牆按鈕只丟出提醒，視窗還在、不耗電、階梯不變', () => {
    // 資料檔還沒有這顆按鈕，這裡在副本上加一顆來測
    const copy = structuredClone(content);
    const login = copy.events.find((e) => e.id === 'sys_login_prompt');
    if (login?.kind !== 'system') throw new Error('找不到登入視窗');
    login.options = [...(login.options ?? []), { id: 'allow', label: '允許', hints: ['第一句', '第二句'] } as never];
    const e2 = createEngine(copy);
    let s = e2.step(e2.start(), { type: 'sendCover' }).state;
    s = e2.step(s, { type: 'openApp', app: 'receipts' }).state;
    s = e2.step(s, { type: 'test', card: 'card_bag', target: 'zonghan' }).state;
    const first = e2.step(s, { type: 'answerPrompt', option: 'allow' });
    expect(first.outcomes).toEqual([{ kind: 'promptHint', event: 'sys_login_prompt', text: '第一句' }]);
    expect(first.state.prompt).toBe('sys_login_prompt');
    expect(first.state.battery).toBe(s.battery);
    expect(first.state.ladder).toEqual(s.ladder);
    const second = e2.step(first.state, { type: 'answerPrompt', option: 'allow' });
    expect(second.outcomes).toEqual([{ kind: 'promptHint', event: 'sys_login_prompt', text: '第二句' }]);
  });

  it('挑戰書：指錯人直接進結局；指對人但欄位沒選對就退回並扣電', () => {
    const s = run(afterCover(), [
      { type: 'openApp', app: 'photos' },
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
    expect([...m.records, ...m.statements, ...m.timeline].map((i) => i.id)).not.toContain(flavor.id);
    expect(engine.menu(s).challenge?.records ?? []).not.toContain(flavor.id);
  });

  it('備忘錄分兩欄、時間軸照故事時間排；心聲只在結論還沒到達時出現', () => {
    const s = run(afterCover(), [{ type: 'openApp', app: 'receipts' }]).state;
    const m = memo(content, s);
    expect(m.records.every((i) => i.kind === 'record')).toBe(true);
    expect(m.statements.map((i) => i.id)).toContain('say_aze_stoodup');
    expect(m.timeline.map((i) => i.id).indexOf('rcp_1628')).toBeLessThan(m.timeline.map((i) => i.id).indexOf('rcp_2207'));
    expect(reachedConclusions(content, s)).toContain('time_window');
    const lines = voice(engine, s).map((l) => l.id);
    expect(lines).toContain('v_coma_1');
    expect(lines.some((id) => id.startsWith('v_time'))).toBe(false);
  });
});
