import { describe, expect, it } from 'vitest';
import { assembleCase, ContentError, formatIssues, listCases, parseWhen, readRawCase, validateCase, type RawCase } from './index';

// 測試用的最小內容。全部是佔位文字，與任何案件無關。
function sample(): RawCase {
  return {
    meta: {
      id: 'sample',
      dayOrder: ['週六', '週日', '週一'],
      battery: { start: 50, cost: { openApp: 1, readThread: 1, send: 2, locate: 4 }, ladderTickEvery: 10 },
      coverStory: '佔位的開場句',
      coverThread: 't_group',
      self: { id: 'owner', name: '機主' },
    },
    characters: [
      {
        id: 'a',
        name: '甲',
        style: '佔位',
        ladder: [
          { level: 1, id: 'one', onEnter: ['ev_msg'] },
          { level: 2, id: 'two', onEnter: ['ev_end'] },
        ],
        genericReplies: [['蛤']],
      },
    ],
    apps: { apps: [{ id: 'chat', name: '聊聊', icon: 'chat', view: 'chat' }, { id: 'bills', name: '帳單', icon: 'bills', view: 'list' }], folders: [] },
    items: [
      { id: 'rec_1', app: 'bills', kind: 'record', when: '週六 18:42', title: '佔位店家', body: '佔位品項' },
      { id: 'say_1', app: 'chat', kind: 'statement', thread: 't_group', speaker: 'a', body: '佔位說法' },
      { id: 'say_2', app: 'chat', kind: 'statement', thread: 't_group', speaker: 'a', body: '佔位說法二', hidden: true },
    ],
    threads: [
      {
        id: 't_group',
        title: '佔位群組',
        members: ['a'],
        history: [
          { from: 'owner', when: '週六 15:50', text: '佔位訊息' },
          { from: 'a', when: '週六 15:53', text: '佔位說法', item: 'say_1' },
        ],
      },
    ],
    links: [{ statement: 'say_1', record: 'rec_1', result: 'conflict', unlocks: ['card_1'] }],
    cards: [{ id: 'card_1', title: '佔位牌', say: '佔位問句' }],
    reactions: [{ card: 'card_1', target: 'a', reply: ['佔位回覆'], reveals: ['say_2'], effects: { ladder: { a: 1 } } }],
    events: [
      { id: 'ev_msg', kind: 'message', thread: 't_group', from: 'a', text: ['佔位'], options: [{ id: 'o1', text: '佔位回覆' }] },
      { id: 'ev_end', kind: 'ending', ending: 'end_ladder' },
    ],
    conclusions: [{ id: 'c1', text: '佔位結論', routes: [['rec_1'], ['say_1', 'say_2']] }],
    voice: [
      { id: 'v1', conclusion: 'c1', level: 1, text: '佔位問題一？' },
      { id: 'v2', conclusion: 'c1', level: 2, text: '佔位問題二？' },
      { id: 'v3', conclusion: 'c1', level: 3, text: '佔位問題三？' },
    ],
    endings: {
      challenge: { whoPrompt: '佔位', suspects: ['a'], culprit: 'a', fields: [{ id: 'f1', prompt: '佔位題目', hint: '佔位提示？', accept: [['rec_1']] }], recipients: ['a'] },
      endings: [
        { id: 'end_battery', title: '佔位', text: ['佔位'], trigger: { kind: 'battery' } },
        { id: 'end_ladder', title: '佔位', text: ['佔位'], trigger: { kind: 'ladder', character: 'a', level: 2 } },
      ],
    },
  };
}

/** 改壞一個地方，回傳所有問題排成的文字 */
function breakIt(change: (raw: any) => void): string {
  const raw = sample();
  change(raw);
  return formatIssues(validateCase(raw));
}

describe('格式檢查', () => {
  it('完整的內容沒有問題', () => {
    expect(formatIssues(validateCase(sample()))).toBe('');
    expect(assembleCase(sample()).meta.id).toBe('sample');
  });

  it('缺檔會指出是哪個檔', () => {
    expect(breakIt((r) => delete r.items)).toContain('items.json｜整個檔案｜找不到這個檔案');
  });

  it('缺欄位會指出是哪一筆', () => {
    expect(breakIt((r) => delete r.items[0].body)).toContain('items.json｜第 1 筆（rec_1）｜缺少 body');
  });

  it('id 重複', () => {
    expect(breakIt((r) => (r.items[1].id = 'rec_1'))).toContain('id「rec_1」重複了');
  });

  it('說法沒寫是誰講的', () => {
    expect(breakIt((r) => delete r.items[1].speaker)).toContain('說法一定要寫 speaker');
  });

  it('時間寫法看不懂，或那一天不在 dayOrder 裡', () => {
    expect(breakIt((r) => (r.items[0].when = '星期六晚上'))).toContain('when「星期六晚上」看不懂');
    expect(breakIt((r) => (r.items[0].when = '週三 10:00'))).toContain('when「週三 10:00」看不懂');
  });

  it('舊訊息沒有依時間排', () => {
    expect(breakIt((r) => (r.threads[0].history[1].when = '週六 15:00'))).toContain('比上一則還早');
  });

  it('聊天訊息指向不存在的人或 item', () => {
    expect(breakIt((r) => (r.threads[0].history[1].from = 'nobody'))).toContain('from 指向不存在的人物「nobody」');
    expect(breakIt((r) => (r.threads[0].history[1].item = 'nope'))).toContain('item 指向不存在的 item 「nope」');
  });

  it('比對的兩邊放反了', () => {
    expect(breakIt((r) => (r.links[0].statement = 'rec_1'))).toContain('statement「rec_1」不是說法');
  });

  it('反應表指向不存在的牌', () => {
    expect(breakIt((r) => (r.reactions[0].card = 'card_x'))).toContain('card 指向不存在的測試牌「card_x」');
  });

  it('階梯等級不連續、事件不存在', () => {
    expect(breakIt((r) => (r.characters[0].ladder[1].level = 3))).toContain('等級要從 1 連續編號');
    expect(breakIt((r) => (r.characters[0].ladder[0].onEnter = ['ev_x']))).toContain('指向不存在的事件「ev_x」');
  });

  it('隱藏的 item 沒有東西帶出來', () => {
    expect(breakIt((r) => delete r.reactions[0].reveals)).toContain('玩家永遠看不到');
  });

  it('結論少於兩條路', () => {
    expect(breakIt((r) => r.conclusions[0].routes.pop())).toContain('只有 1 條路，每個結論至少要兩條');
  });

  it('結論缺某一級的心聲', () => {
    expect(breakIt((r) => r.voice.pop())).toContain('voice.json｜結論「c1」｜缺少第 3 級的心聲');
  });

  it('挑戰書的答案只能指向紀錄', () => {
    expect(breakIt((r) => (r.endings.challenge.fields[0].accept = [['say_1']]))).toContain('每一項答案都必須指向紀錄');
  });

  it('assembleCase 會把全部問題列在錯誤訊息裡', () => {
    const raw = sample();
    delete (raw.items as any[])[0].body;
    (raw.cards as any[])[0].title = '';
    try {
      assembleCase(raw);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).issues).toHaveLength(2);
    }
  });
});

describe('時間解析', () => {
  const order = ['週五', '週六', '週日', '週一'];
  it('排得出先後，跨過週日到週一也對', () => {
    const texts = ['週一 09:00', '週六 約22:00', '較早', '週五', '上週三 20:00', '週六 18:42', '週日 08:40'];
    const sorted = [...texts].sort((a, b) => parseWhen(a, order)!.sort - parseWhen(b, order)!.sort);
    expect(sorted).toEqual(['較早', '上週三 20:00', '週五', '週六 18:42', '週六 約22:00', '週日 08:40', '週一 09:00']);
  });
  it('拆出日期、時刻和「約」', () => {
    expect(parseWhen('週六 約22:00', order)).toMatchObject({ day: '週六', time: '22:00', approx: true });
    expect(parseWhen('週五', order)).toMatchObject({ day: '週五', time: null, approx: false });
  });
  it('不合理的時刻不接受', () => {
    expect(parseWhen('週六 25:00', order)).toBeNull();
  });
});

// 真正的案件資料。資料夾裡還沒有檔案時這一段會自動略過。
describe('案件資料', () => {
  const cases = listCases();
  it.skipIf(cases.length === 0).each(cases.length ? cases : ['（尚無）'])('%s 通過格式檢查', (caseId) => {
    const raw = readRawCase(caseId);
    let issues = validateCase(raw);
    // 還在寫的案件（meta.draft 為 true）先不計較缺檔，其他錯誤照樣要過
    if ((raw.meta as { draft?: boolean } | undefined)?.draft) issues = issues.filter((i) => i.where !== '整個檔案');
    expect(formatIssues(issues)).toBe('');
  });
});
