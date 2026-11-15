import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../../content';
import { createEngine } from '../../engine';
import { buildPhoneData, EMPTY_UI, markNoReply } from '../game/view';
import { S } from '../strings';
import { CallScreen, RING_MS } from './Call';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const call = { id: 'c1', name: '測試來電', declineCost: 1, ringCost: 3 };

describe('來電畫面', () => {
  it('只有掛斷，沒有接聽；按掛斷就回報', () => {
    const onDecline = vi.fn();
    const onRing = vi.fn();
    render(<CallScreen call={call} onDecline={onDecline} onRing={onRing} />);
    expect(screen.getByRole('alertdialog', { name: S.callIncoming + '：' + call.name })).toBeTruthy();
    // 畫面上唯一能按的就是掛斷
    expect(screen.getAllByRole('button').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: S.callDecline }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onRing).not.toHaveBeenCalled();
  });

  it('放著不按，響完就回報一次「沒接」', () => {
    const onRing = vi.fn();
    render(<CallScreen call={call} onDecline={() => {}} onRing={onRing} />);
    act(() => void vi.advanceTimersByTime(RING_MS - 100));
    expect(onRing).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(200));
    expect(onRing).toHaveBeenCalledTimes(1);
  });
});

describe('來電接上遊戲規則', () => {
  // 案件資料裡還不一定有來電，所以自己加一通最簡單的，直接讓它響
  const base = loadCase('case01');
  const from = base.characters[0];
  const content = { ...base, events: [...base.events, { id: 'call_test', kind: 'call' as const, from: from.id }] };
  const engine = createEngine(content);
  const playing = engine.step(engine.start(), { type: 'sendCover' }).state;
  const ringing = { ...playing, call: { event: 'call_test', from: from.id } };
  const cost = content.meta.battery.cost;
  const phoneApp = content.apps.apps.find((a) => a.icon === 'phone')!;
  const missedRows = (state: typeof playing) =>
    (buildPhoneData(engine, state, EMPTY_UI).lists[phoneApp.id] ?? []).flatMap((g) => g.rows).filter((r) => r.subtitle === S.callMissed);

  it('電話在響：畫面資料帶著是誰打來、掛斷和響完各扣多少', () => {
    const full = Object.fromEntries(Object.entries(ringing.threads).map(([id, t]) => [id, t.appended.length]));
    const data = buildPhoneData(engine, ringing, { ...EMPTY_UI, revealed: full });
    expect(data.call).toEqual({ id: 'call_test', name: from.name, avatar: from.id, declineCost: cost.callDecline ?? 0, ringCost: cost.callRing ?? 0, waiting: false });
    // 對方的訊息還沒出完：先等，不馬上響
    expect(buildPhoneData(engine, ringing, EMPTY_UI).call?.waiting).toBe(true);
    expect(buildPhoneData(engine, playing, EMPTY_UI).call).toBeUndefined();
  });

  it('響完：扣電，電話 App 最上面多一筆未接來電，圖示的紅點加一', () => {
    const badge = (state: typeof playing) => buildPhoneData(engine, state, EMPTY_UI).apps.find((a) => a.id === phoneApp.id)!.unread ?? 0;
    const after = engine.step(ringing, { type: 'letRing' }).state;
    expect(after.battery).toBe(ringing.battery - (cost.callRing ?? 0));
    expect(buildPhoneData(engine, after, EMPTY_UI).call).toBeUndefined();
    expect(missedRows(after).map((r) => r.title)).toEqual([from.name]);
    expect(buildPhoneData(engine, after, EMPTY_UI).lists[phoneApp.id][0].label).toBe(S.callMissedGroup);
    expect(badge(after)).toBe(badge(ringing) + 1);
  });

  it('掛斷：扣電，但不算未接來電', () => {
    const after = engine.step(ringing, { type: 'declineCall' }).state;
    expect(after.battery).toBe(ringing.battery - (cost.callDecline ?? 0));
    expect(missedRows(after)).toEqual([]);
  });
});

describe('已讀不回', () => {
  const content = loadCase('case01');
  const engine = createEngine(content);
  const state = engine.step(engine.start(), { type: 'sendCover' }).state;
  const dm = content.threads.find((t) => t.members.length === 1)!;
  const who = dm.members[0];
  const self = content.meta.self?.id ?? '';
  // 假裝玩家在這個私訊裡送了一句、規則回報「對方已讀但沒有回」
  const sent = { ...state, threads: { ...state.threads, [dm.id]: { appended: [...(state.threads[dm.id]?.appended ?? []), { from: self, text: ['在嗎'] }] } } };
  const outcomes = [{ kind: 'noReply' as const, thread: dm.id, character: who }];

  it('規則說對方已讀沒回：那句話底下掛「已讀」，靠自己這一側；沒有這個結果就不會有', () => {
    const at = sent.threads[dm.id].appended.length - 1;
    const ui = markNoReply({ ...EMPTY_UI, revealed: { [dm.id]: at + 1 } }, sent, outcomes);
    expect(ui.readNoReply[dm.id]).toEqual([at]);
    const msgs = buildPhoneData(engine, sent, ui).threads.find((t) => t.id === dm.id)!.messages;
    const last = msgs[msgs.length - 1];
    expect(last.note).toBe(S.readMark);
    expect(last.noteMine).toBe(true);
    expect(msgs[msgs.length - 2].text).toBe('在嗎');
    // 同一個結果再來一次不會重複記；沒有結果就原封不動
    expect(markNoReply(ui, sent, outcomes)).toBe(ui);
    const plain = buildPhoneData(engine, sent, { ...EMPTY_UI, revealed: { [dm.id]: at + 1 } }).threads.find((t) => t.id === dm.id)!.messages;
    expect(plain.some((m) => m.note === S.readMark)).toBe(false);
  });
});
