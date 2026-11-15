import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../../content';
import { createEngine, isWeakEnding } from '../../engine';
import { App } from '../App';
import { fingerprint, writeSave } from './save';
import { EMPTY_UI } from './view';
import { S } from '../strings';

// 真的遊戲：內容來自 content/case01，規則來自 src/engine。
// 這裡不寫死任何台詞或數字，要比對的東西都從資料檔讀。
const content = loadCase('case01');
const cost = content.meta.battery.cost;
const start = content.meta.battery.start;

beforeEach(() => {
  // 每個測試都從沒有存檔開始
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const battery = () => Number(screen.getByTestId('battery').textContent?.replace('%', ''));
// 每出現一則訊息，畫面才會排下一則的時間，所以要一小段一小段地往前走
const wait = (ms: number) => {
  for (let t = 0; t < ms; t += 1200) act(() => void vi.advanceTimersByTime(1200));
};
const home = () => fireEvent.click(screen.getByRole('button', { name: S.home }));
const appName = (id: string) => content.apps.apps.find((a) => a.id === id)!.name;
// 圖示上有紅點時，按鈕的名稱前面會多一個數字，所以只比對結尾
const openApp = (id: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`${appName(id)}$`) }));

function passIntro() {
  const intro = screen.getByRole('button', { name: S.tapToContinue });
  for (let i = 0; i < (content.meta.intro ?? []).length; i += 1) fireEvent.click(intro);
}

function startGame() {
  render(<App mode="game" />);
  passIntro();
  fireEvent.click(screen.getByRole('button', { name: S.send }));
  wait(20000);
}

describe('接上遊戲規則', () => {
  it('開場文字來自資料檔，結束後停在群組，輸入框是固定的掩護說法', () => {
    render(<App mode="game" />);
    expect(screen.getByText(content.meta.intro![0].lines[0])).toBeTruthy();
    passIntro();
    const group = content.threads.find((t) => t.id === content.meta.coverThread)!;
    expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    expect(screen.getByText(content.meta.coverStory)).toBeTruthy();
    expect(battery()).toBe(start);
  });

  it('送出掩護說法會扣電，四個人的回覆一則一則出現', () => {
    render(<App mode="game" />);
    passIntro();
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    expect(battery()).toBe(start - cost.send);
    const first = content.events.find((e) => e.id === content.meta.afterCover![0]);
    const last = content.events.find((e) => e.id === content.meta.afterCover![content.meta.afterCover!.length - 1]);
    if (first?.kind !== 'message' || last?.kind !== 'message') throw new Error('afterCover 應該都是訊息');
    // 還沒輪到的訊息先看不到
    expect(screen.queryByText(last.text[0])).toBeNull();
    wait(20000);
    // 同一句話可能在舊訊息裡也出現過，所以只確認看得到
    expect(screen.getAllByText(first.text[0]).length).toBeGreaterThan(0);
    expect(screen.getAllByText(last.text[0]).length).toBeGreaterThan(0);
  });

  it('第一次打開有線索的 App 會扣電，再開一次不扣；內容來自資料檔', () => {
    startGame();
    const before = battery();
    home();
    openApp('receipts');
    expect(battery()).toBe(before - cost.openApp);
    const receipt = content.items.find((i) => i.app === 'receipts')!;
    expect(screen.getByText(receipt.title!)).toBeTruthy();
    home();
    openApp('receipts');
    expect(battery()).toBe(before - cost.openApp);
  });

  it('可以回覆等著回的訊息，回完扣電、選項消失', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    const dm = content.threads.find((t) => t.id === 'dm_pinyu')!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^.?${dm.title}`) }));
    wait(20000);
    const before = battery();
    const options = screen.getAllByRole('button').filter((b) => b.className.includes('options__item'));
    expect(options.length).toBeGreaterThan(0);
    const text = options[0].textContent!;
    fireEvent.click(options[0]);
    expect(battery()).toBe(before - cost.send);
    // 選的那句變成自己送出的訊息
    expect(screen.getAllByText(text).some((el) => el.className.includes('bubble'))).toBe(true);
  });

  it('相簿的照片數量和資料檔一致，聯絡人列出四個人', () => {
    startGame();
    home();
    openApp('photos');
    const photos = content.items.filter((i) => i.app === 'photos' && i.image && !i.hidden);
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('gallery__cell')).length).toBe(photos.length);
    home();
    openApp('contacts');
    for (const c of content.characters) expect(screen.getByRole('button', { name: new RegExp(c.name) })).toBeTruthy();
  });

  it('往右滑會返回上一層', () => {
    startGame();
    const stage = document.querySelector('.phone__stage') as HTMLElement;
    const group = content.threads.find((t) => t.id === content.meta.coverThread)!;
    expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    // 垂直滑動不算
    fireEvent.touchStart(stage, { touches: [{ clientX: 20, clientY: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 40, clientY: 500 }] });
    expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    // 往右滑：從聊天室回到聊天列表
    fireEvent.touchStart(stage, { touches: [{ clientX: 20, clientY: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 180, clientY: 310 }] });
    expect(screen.getByRole('heading', { name: appName('chat') })).toBeTruthy();
  });

  it('已經沒有心聲的通知；其他通知往上滑會收掉', () => {
    render(<App mode="game" />);
    passIntro();
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    // 送出後 Suru 不會跳出心聲；這時候會跳的只有別的聊天室來的新訊息
    expect(screen.queryByRole('status')).toBeNull();
    wait(20000);
    expect(screen.queryByRole('button', { name: S.noticeDismiss })).toBeNull();
    // 用通話的提示來試往上滑
    const who = content.characters[0];
    fireEvent.click(screen.getAllByRole('button', { name: S.profileOpen + '：' + who.name })[0]);
    fireEvent.click(screen.getByRole('button', { name: S.profileCall }));
    const note = screen.getByRole('button', { name: S.noticeDismiss });
    expect(screen.getByRole('status').textContent).toBe(S.callBlocked);
    fireEvent.pointerDown(note, { clientY: 60 });
    fireEvent.pointerMove(note, { clientY: 10 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('發票畫成單據、天氣有圖示、動態牆列出貼文', () => {
    startGame();
    home();
    openApp('receipts');
    const receipt = content.items.find((i) => i.app === 'receipts')!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(receipt.title!) }));
    expect(screen.getByText(S.receiptHeader)).toBeTruthy();
    home();
    openApp('weather');
    expect(document.querySelectorAll('.wx--rain').length).toBe(content.items.filter((i) => i.app === 'weather' && /起大雨/.test(i.body)).length);
    expect(document.querySelectorAll('.wx--clear').length).toBeGreaterThan(0);
    home();
    openApp('social');
    const posts = content.flavor?.posts ?? [];
    expect(posts.length).toBeGreaterThan(0);
    expect(screen.getByText(posts[0].text)).toBeTruthy();
  });

  it('時間軸只放資料檔標成「發生的事」的那幾列，而且看過才出現', () => {
    startGame();
    home();
    openApp('suru');
    fireEvent.click(screen.getByRole('tab', { name: S.suruTimeline }));
    const texts = () => [...document.querySelectorAll('.suru-time__text')].map((el) => el.textContent);
    const receipts = content.items.filter((i) => i.app === 'receipts' && i.timeline?.length);
    expect(receipts.length).toBeGreaterThan(0);
    // 還沒打開發票雲，發票上的事不會出現
    expect(texts()).not.toContain(receipts[0].timeline![0].text);
    fireEvent.click(screen.getByRole('button', { name: S.suruClose }));
    openApp('receipts');
    home();
    openApp('suru');
    fireEvent.click(screen.getByRole('tab', { name: S.suruTimeline }));
    for (const item of receipts) for (const row of item.timeline!) expect(texts()).toContain(row.text);
  });

  it('Link 裡有跟案情無關的聊天室：排在後面，打開不扣電，也不能回', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    const chats = content.flavor?.chats ?? [];
    expect(chats.length).toBeGreaterThan(0);
    const rows = [...document.querySelectorAll('.rows .row__title')].map((el) => el.textContent ?? '');
    expect(rows.length).toBe(content.threads.length + chats.length);
    expect(rows[content.threads.length]).toContain(chats[0].title);
    const before = battery();
    fireEvent.click(document.querySelectorAll('.rows .row')[content.threads.length] as HTMLElement);
    wait(3000);
    expect(battery()).toBe(before);
    expect(screen.getByText(chats[0].messages[0].text)).toBeTruthy();
    expect(document.querySelector('.options')).toBeNull();
  });

  it('Link 裡點頭像或私訊的標題會開個人頁面：完整頭貼、私訊、通話', () => {
    startGame();
    const group = content.threads.find((t) => t.id === content.meta.coverThread)!;
    const who = content.characters[0];
    // 群組裡點某個人的頭像
    fireEvent.click(screen.getAllByRole('button', { name: S.profileOpen + '：' + who.name })[0]);
    expect(screen.getByRole('heading', { name: who.name, level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: S.zoomOpen + '：' + who.name })).toBeTruthy();
    // 通話只跳一句提醒
    fireEvent.click(screen.getByRole('button', { name: S.profileCall }));
    expect(screen.getByRole('status').textContent).toBe(S.callBlocked);
    // 返回會回到原本的群組
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    // 再進去按私訊，會到他的私訊聊天室
    fireEvent.click(screen.getAllByRole('button', { name: S.profileOpen + '：' + who.name })[0]);
    fireEvent.click(screen.getByRole('button', { name: S.profileMessage }));
    const dm = content.threads.find((t) => t.members.length === 1 && t.members[0] === who.id)!;
    // 私訊裡標題和頭像都能開個人頁面
    expect(screen.getAllByRole('button', { name: S.profileOpen + '：' + dm.title }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: new RegExp(dm.title), level: 1 })).toBeTruthy();
  });

  it('開局那句話一定要先送出：送出前返回、home 鍵、往右滑、長按都沒有作用', () => {
    render(<App mode="game" />);
    passIntro();
    const group = content.threads.find((t) => t.id === content.meta.coverThread)!;
    const still = () => {
      expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
      expect(screen.getByRole('button', { name: S.send })).toBeTruthy();
    };
    const homeButton = screen.getByRole('button', { name: S.home }) as HTMLButtonElement;
    expect(homeButton.disabled).toBe(true);
    expect((screen.getByRole('button', { name: S.back }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    still();
    const stage = document.querySelector('.phone__stage') as HTMLElement;
    fireEvent.touchStart(stage, { touches: [{ clientX: 20, clientY: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200, clientY: 305 }] });
    still();
    fireEvent.pointerDown(homeButton);
    wait(1200);
    fireEvent.pointerUp(homeButton);
    still();
    expect(battery()).toBe(start);

    // 送出之後就解鎖了
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    expect((screen.getByRole('button', { name: S.home }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    expect(screen.getByRole('heading', { name: appName('chat') })).toBeTruthy();
  });

  it('品妤私訊裡那張班表是真的照片，點得開', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    const dm = content.threads.find((t) => t.id === 'dm_pinyu')!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp('^.?' + dm.title) }));
    const roster = dm.history.find((m) => m.image?.label === '班表')!;
    const photo = screen.getByRole('button', { name: S.zoomOpen + '：' + roster.image!.description });
    expect(photo.querySelector('img')).toBeTruthy();
    fireEvent.click(photo);
    expect(screen.getByRole('button', { name: S.zoomClose }).querySelector('img')).toBeTruthy();
  });

  it('Instory 是動態牆：四個人的動態和無關的貼文由新到舊排在一起；滑到就算看過', () => {
    startGame();
    home();
    openApp('moments');
    const mine = content.items.filter((x) => x.app === 'moments' && x.image && !x.hidden);
    const others = content.flavor?.moments ?? [];
    expect(document.querySelectorAll('.pfeed__post').length).toBe(mine.length + others.length);
    // 最上面是最新的一則
    const texts = [...document.querySelectorAll('.pfeed__text')].map((el) => el.textContent ?? '');
    expect(texts[0]).toContain(others[0].text);
    const market = mine.find((x) => x.id === 'mo_sat_market')!;
    expect(texts.findIndex((t) => t.includes(market.body))).toBeLessThan(texts.findIndex((t) => t.includes(mine[0].body)));
    // 動態滑到畫面上就算看過，不用點開（測試環境沒有排版，整頁都當作在畫面上）
    home();
    openApp('suru');
    fireEvent.click(screen.getByRole('tab', { name: S.suruTimeline }));
    expect([...document.querySelectorAll('.suru-time__text')].filter((el) => el.textContent === market.timeline![0].text).length).toBe(1);
  });

  it('在意的地方：指出跟哪一筆對不上，指對就翻成疑點；疑點可以要提示、點進去選人去問', () => {
    startGame();
    const card = content.cards.find((c) => c.id === 'card_latte')!;
    const spot = card.spot!;
    const subject = content.items.find((x) => x.id === spot.item)!;
    const answers = Array.isArray(spot.answer) ? spot.answer : [spot.answer];
    const right = spot.options.find((o) => answers.includes(o.id))!;
    const wrong = spot.options.find((o) => !answers.includes(o.id))!;
    // 規則：要先打開過那個人的聊天室，才能拿疑點去問他
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    const dmAze = content.threads.find((t) => t.id === 'dm_aze')!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp('^.?' + dmAze.title) }));
    wait(6000);
    home();
    openApp('receipts');
    home();
    openApp('suru');
    // Suru 只有疑點和時間軸兩個分頁
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([S.suruCards, S.suruTimeline]);
    // 在意的地方的小卡片上是那筆資料本身，不露出疑點的標題
    expect(screen.queryByText(card.title)).toBeNull();
    // 小卡片上印的是那筆資料的名字（說法是那句話，紀錄是它的標題）和要問的那一句
    const label = subject.kind === 'statement' ? subject.body.split('\n')[0] : (subject.title ?? subject.body.split('\n')[0]);
    const concern = [...document.querySelectorAll('.doubt--concern')].find((el) => el.textContent?.includes(label) && el.textContent?.includes(spot.prompt!)) as HTMLElement;
    fireEvent.click(concern);
    expect(screen.getByText(spot.prompt!)).toBeTruthy();
    // 指錯扣電、跳一句提示，那個選項不能再選
    const before = battery();
    fireEvent.click(screen.getByRole('button', { name: wrong.text }));
    expect(battery()).toBe(before - (cost.spotMiss ?? 0));
    expect(screen.queryByRole('button', { name: wrong.text })).toBeNull();
    // 指對：回到卡片格子，那張變成疑點卡
    fireEvent.click(screen.getByRole('button', { name: right.text }));
    const openCard = () => fireEvent.click(screen.getByText(card.title).closest('button') as HTMLElement);
    expect(screen.getByText(card.title).closest('.doubt--card')).toBeTruthy();
    // 翻牌翻完，自動進到那張疑點的內頁，在裡面要提示
    expect(document.querySelector('.doubt-page')).toBeNull();
    act(() => void vi.advanceTimersByTime(1200));
    expect(document.querySelector('.doubt-page')).toBeTruthy();
    const beforeHint = battery();
    fireEvent.click(document.querySelector('.doubt__think') as HTMLElement);
    expect(screen.getByText(card.hints![0])).toBeTruthy();
    expect(battery()).toBe(beforeHint - (cost.hint ?? 0));
    // 在內頁選要拿去問誰；選了就送出，並跳到那個人的聊天室
    const aze = content.characters.find((c) => c.id === 'aze')!;
    const say = card.sayTo?.aze ?? card.say!;
    expect(screen.getByText(say)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: aze.name }));
    expect(battery()).toBe(beforeHint - (cost.hint ?? 0) - (cost.test ?? cost.send));
    expect(screen.getAllByText(say).some((el) => el.className.includes('bubble'))).toBe(true);
    // 回到疑點，內頁看得到問過誰
    home();
    openApp('suru');
    openCard();
    expect(screen.getByText(S.askedPrefix + aze.name)).toBeTruthy();
  });

  it('相簿照拍攝時間排，線索照片和生活照穿插，不是各自擠成一堆', () => {
    startGame();
    home();
    openApp('photos');
    const labels = [...document.querySelectorAll('.gallery__cell')].map((el) => el.getAttribute('aria-label') ?? '');
    const photos = content.items.filter((x) => x.app === 'photos' && x.image && !x.hidden);
    const flavorAt = labels.map((label) => !!photos.find((p) => label.includes(p.image!.description))?.flavor);
    expect(flavorAt.length).toBe(photos.length);
    // 兩種照片交錯出現：從頭看到尾，「是不是生活照」至少變換三次
    const switches = flavorAt.filter((f, i) => i > 0 && f !== flavorAt[i - 1]).length;
    expect(switches).toBeGreaterThanOrEqual(3);
  });

  it('自動存檔：重新整理後接著玩，回到主畫面、電量和看過的東西都還在；資料改版或重新開始就從頭', () => {
    startGame();
    home();
    openApp('receipts');
    const before = battery();
    expect(before).toBeLessThan(start);
    // 重新整理：整個畫面卸掉再重開
    cleanup();
    render(<App mode="game" />);
    // 不用再看一次開場，直接在主畫面，電量沒變
    expect(screen.queryByRole('button', { name: S.tapToContinue })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`${appName('receipts')}$`) })).toBeTruthy();
    expect(battery()).toBe(before);
    // 開過的 App 再開不扣電，代表規則的狀態也接回來了
    openApp('receipts');
    expect(battery()).toBe(before);
    // 存檔的版本對不上（遊戲改版）：不讀，從開場重來
    cleanup();
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('detective-suru:save:'))!;
    const stored = JSON.parse(window.localStorage.getItem(key)!);
    window.localStorage.setItem(key, JSON.stringify({ ...stored, version: 'old' }));
    render(<App mode="game" />);
    expect(screen.getByRole('button', { name: S.tapToContinue })).toBeTruthy();
    // 存檔壞掉也一樣當作沒有
    cleanup();
    window.localStorage.setItem(key, '{not json');
    render(<App mode="game" />);
    expect(screen.getByRole('button', { name: S.tapToContinue })).toBeTruthy();
  });

  it('設定裡可以重新開始：要按兩次確認，按了清掉存檔、回到開場', () => {
    startGame();
    home();
    openApp('receipts');
    expect(battery()).toBeLessThan(start);
    home();
    openApp('settings');
    fireEvent.click(screen.getByRole('button', { name: S.setRestart }));
    // 先問一次，可以取消
    expect(screen.getByText(S.setRestartAsk)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.setRestartNo }));
    expect(screen.queryByText(S.setRestartAsk)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: S.setRestart }));
    fireEvent.click(screen.getByRole('button', { name: S.setRestartYes }));
    // 回到開場；重新整理也還是從頭
    expect(screen.getByRole('button', { name: S.tapToContinue })).toBeTruthy();
    cleanup();
    render(<App mode="game" />);
    expect(screen.getByRole('button', { name: S.tapToContinue })).toBeTruthy();
    passIntro();
    expect(battery()).toBe(start);
  });

  // 指認兇手要先有疑點。這裡直接準備一份「疑點都成立了」的存檔，從存檔接著玩
  function startWithAllCards() {
    const engine = createEngine(content);
    const game = engine.step(engine.start(), { type: 'sendCover' }).state;
    const ready = { ...game, cards: content.cards.map((c) => c.id) };
    writeSave('case01', fingerprint(content), { game: ready, ui: EMPTY_UI, introDone: true, coverSeen: [] });
    render(<App mode="game" />);
    openApp('suru');
    fireEvent.click(screen.getByRole('button', { name: S.accuseEntry }));
  }
  const ch = content.endings.challenge;
  const titleOf = (id: string) => content.cards.find((c) => c.id === id)!.title;
  const nameOfPerson = (id: string) => content.characters.find((c) => c.id === id)!.name;
  const cardFields = ch.fields.filter((f) => (ch.sequence ?? []).includes(f.id));
  const esc = (t: string) => t.replace(/[?？]/g, '.');
  /** 在某一格放上一張疑點：點那一格，從列出來的小卡裡選一張 */
  const fill = (fieldId: string, cardId: string) => {
    const field = ch.fields.find((f) => f.id === fieldId)!;
    fireEvent.click(screen.getByRole('button', { name: field.prompt }));
    // 每一格都列出手上全部成立的疑點
    expect(screen.getAllByRole('radio').length).toBe(content.cards.length);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(esc(titleOf(cardId))) }));
  };
  const who = (id: string) => fireEvent.click(screen.getByRole('radio', { name: nameOfPerson(id) }));
  const handIn = () => screen.getByRole('button', { name: S.accuseHandIn }) as HTMLButtonElement;

  it('指認兇手：四格都填好才能交；人對但有格子放錯會進「站不住」的結局（可回到指認之前改）；全對後交出證據進結局', () => {
    startWithAllCards();
    // 開頭是 Suru 講明的前提，再來是說明
    for (const line of (ch as { premise?: string[] }).premise ?? []) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(ch.intro![0])).toBeTruthy();
    expect(handIn().disabled).toBe(true);
    // 第一格故意放錯的，其他放對的；填的時候不顯示對錯、不扣電
    const first = cardFields[0];
    const wrong = content.cards.find((c) => !first.cards!.includes(c.id))!.id;
    const before = battery();
    fill(first.id, wrong);
    for (const f of cardFields.slice(1)) fill(f.id, f.cards![0]);
    expect(handIn().disabled).toBe(true);
    who(ch.culprit);
    expect(battery()).toBe(before);
    expect(screen.queryByRole('note')).toBeNull();
    expect(handIn().disabled).toBe(false);
    // 交出去。人指對、但有格子放錯：資料有「站不住」的結局就直接進結局（不退回，免得洩漏人指對了）；沒有才退回
    const weak = content.endings.endings.find((e) => isWeakEnding(e));
    fireEvent.click(handIn());
    if (weak) {
      // 不扣電；結局裡只有放錯的那一格對應的反駁，沒放錯的不會出現
      expect(battery()).toBe(before);
      expect(screen.getByRole('heading', { name: weak.title })).toBeTruthy();
      const page = () => document.querySelector('.ending__scroll')?.textContent ?? '';
      const said = (l: string) => [...l.matchAll(/「([^」]*)」/g)].map((m) => m[1]);
      const rebuttals = (weak as { rebuttals?: Record<string, string[]> }).rebuttals ?? {};
      for (const l of rebuttals[first.id] ?? []) for (const q of said(l)) expect(page()).toContain(q);
      for (const f of cardFields.slice(1)) for (const l of rebuttals[f.id] ?? []) for (const q of said(l)) expect(page()).not.toContain(q);
      expect(page()).not.toContain('{rebuttals}');
      // 這種結局不算破案：沒有「第幾次指認」；可以回到指認之前或重新開始
      expect(screen.queryByText(new RegExp(S.endingSolved.split('{n}')[0]))).toBeNull();
      expect([...document.querySelectorAll('.ending > button')].map((el) => el.textContent)).toEqual([S.endingRetry, S.endingRestart]);
      // 重新整理還在這個結局；回到指認之前，格子都還在
      cleanup();
      render(<App mode="game" />);
      expect(screen.getByRole('heading', { name: weak.title })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: S.endingRetry }));
      expect(battery()).toBe(before);
      if (!document.querySelector('.aform')) {
        openApp('suru');
        fireEvent.click(screen.getByRole('button', { name: S.accuseEntry }));
      }
      expect(screen.getByText(titleOf(wrong))).toBeTruthy();
    } else {
      // 被退回，扣一次電，站不住的那一格旁邊出現提示，填的還在
      expect(battery()).toBe(before - (cost.challengeRetry ?? 0));
      expect(screen.getAllByRole('note').map((el) => el.textContent)).toEqual([first.hint]);
      expect(screen.getByText(titleOf(wrong))).toBeTruthy();
      // 重新整理，格子和提示都還在
      cleanup();
      render(<App mode="game" />);
      openApp('suru');
      fireEvent.click(screen.getByRole('button', { name: S.accuseEntry }));
      expect(screen.getByText(titleOf(wrong))).toBeTruthy();
      expect(screen.getAllByRole('note').length).toBe(1);
    }
    // 換成對的那一張再交就通過，接著選把證據交給誰
    fill(first.id, first.cards![0]);
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(handIn());
    expect(screen.getByTestId('accuse-prompt').textContent).toBe(S.accuseGivePrompt);
    const to = ch.recipients[0];
    fireEvent.click(screen.getByRole('radio', { name: nameOfPerson(to) }));
    fireEvent.click(screen.getByRole('button', { name: S.accuseSubmit }));
    expect(screen.getByRole('button', { name: S.endingRestart })).toBeTruthy();
    // 結局裡寫成「名字：「一句」「又一句」」的段落排成訊息：一對引號一則泡泡，其餘是旁白
    // 可能有兩個結局同名，所以連內文一起比：畫面上有它每一段裡的字才算
    const onScreen = document.querySelector('.ending__scroll')?.textContent ?? '';
    const lastBit = (l: string) => [...l.matchAll(/「([^」]*)」/g)].map((m) => m[1]).pop() ?? l;
    const shown = content.endings.endings.find((e) => document.querySelector('.ending__title')?.textContent === e.title && e.text.every((l) => onScreen.includes(lastBit(l))))!;
    // 冒號前面是角色的名字才算對話
    const isSaid = (l: string) => content.characters.some((c) => new RegExp('^' + c.name + '：(?:「[^」]*」\\s*)+$').test(l.trim()));
    const quotes = shown.text.flatMap((l) => (isSaid(l) ? [...l.matchAll(/「([^」]*)」/g)].map((m) => m[1]) : []));
    expect([...document.querySelectorAll('.endchat__bubble')].map((el) => el.textContent)).toEqual(quotes);
    const narration = shown.text.filter((l) => !isSaid(l));
    expect([...document.querySelectorAll('.ending__scroll > p:not(.ending__note)')].map((el) => el.textContent)).toEqual(narration);
    // 破案的結局寫出這是第幾次指認、還剩多少電（被退回不算；進過「站不住」的結局算一次）
    expect(screen.getByText(S.endingSolved.replace('{n}', weak ? '2' : '1').replace('{battery}', String(battery())))).toBeTruthy();
    // 破案的結局也能回到指認之前：不用重新指認，直接回到「交給誰」那一步，可以改交給別人看別的結局
    const solvedBattery = battery();
    fireEvent.click(screen.getByRole('button', { name: S.endingRetry }));
    expect(screen.queryByRole('button', { name: S.endingRestart })).toBeNull();
    expect(screen.getByTestId('accuse-prompt').textContent).toBe(S.accuseGivePrompt);
    expect(battery()).toBe(solvedBattery);
    const other = ch.recipients[ch.recipients.length - 1];
    fireEvent.click(screen.getByRole('radio', { name: nameOfPerson(other) }));
    fireEvent.click(screen.getByRole('button', { name: S.accuseSubmit }));
    expect(screen.getByRole('button', { name: S.endingRestart })).toBeTruthy();
    // 改交給別人不算多一次指認
    expect(screen.getByText(S.endingSolved.replace('{n}', weak ? '2' : '1').replace('{battery}', String(battery())))).toBeTruthy();
    // 指對兇手的結局：看完可以接著看解答篇，再回到結局
    const solution = content.endings.solution;
    if (solution) {
      expect(document.querySelector('.report')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: S.endingSolution.replace('{title}', solution.title) }));
      expect(screen.getByRole('heading', { name: solution.title })).toBeTruthy();
      // 排成報告：【】裡的字是欄位標籤，後面是內容；每一行的字都在
      const page = document.querySelector('.report')!;
      const strip = (t: string) => t.replace(/[【】：:\s]/g, '');
      for (const line of solution.text) expect(strip(page.textContent ?? '')).toContain(strip(line));
      const labels = solution.text.flatMap((l) => (/^【(.+?)】/.exec(l)?.[1] ? [/^【(.+?)】/.exec(l)![1]] : []));
      expect([...page.querySelectorAll('.report__row h2')].map((el) => el.textContent)).toEqual(labels);
      fireEvent.click(screen.getByRole('button', { name: S.endingBack }));
      expect(document.querySelector('.report')).toBeNull();
    }
  });

  it('指認兇手：人指錯了，交出去就直接進那個人的結局', () => {
    startWithAllCards();
    for (const f of cardFields) fill(f.id, f.cards![0]);
    const innocent = ch.suspects.find((x) => x !== ch.culprit)!;
    who(innocent);
    fireEvent.click(handIn());
    const ending = content.endings.endings.find((e) => e.trigger.kind === 'challenge' && e.trigger.accused === innocent)!;
    expect(screen.getByText(ending.title)).toBeTruthy();
    // 指錯人的結局可以回到指認之前：回到那張表，格子（含指錯的人）都還在，電量沒變，可以改了再交
    const beforeRewind = battery();
    fireEvent.click(screen.getByRole('button', { name: S.endingRetry }));
    expect(screen.queryByText(ending.title)).toBeNull();
    expect(battery()).toBe(beforeRewind);
    expect(screen.getByRole('radio', { name: nameOfPerson(innocent) }).getAttribute('aria-checked')).toBe('true');
    for (const f of cardFields) expect(screen.getByText(titleOf(f.cards![0]))).toBeTruthy();
    // 再交一次（還是指錯）回到同一個結局
    fireEvent.click(handIn());
    expect(screen.getByText(ending.title)).toBeTruthy();
    // 指錯人的結局只有「回到指認之前」和「重新開始」
    expect([...document.querySelectorAll('.ending > button')].map((el) => el.textContent)).toEqual([S.endingRetry, S.endingRestart]);
    // 指錯人的結局沒有解答篇，不講破答案
    expect(screen.queryByRole('button', { name: S.endingSolution.replace('{title}', content.endings.solution?.title ?? '') })).toBeNull();
  });

  it('Link 的新訊息會跳通知：正開著的聊天室不跳，別的聊天室來的才跳；點通知直接進那個聊天室', () => {
    render(<App mode="game" />);
    passIntro();
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    const chat = content.apps.apps.find((a) => a.view === 'chat')!;
    const cover = content.threads.find((t) => t.id === content.meta.coverThread)!;
    const dmTitles = content.threads.filter((t) => t.members.length === 1).map((t) => content.characters.find((c) => c.id === t.members[0])!.name);
    // 一則一則等，直到有通知跳出來
    let note: HTMLElement | null = null;
    for (let i = 0; i < 40 && !note; i += 1) {
      act(() => void vi.advanceTimersByTime(1200));
      note = screen.queryByRole('button', { name: S.noticeOpen });
    }
    expect(note).toBeTruthy();
    // 通知上是聊天 App 的名字和傳的人；不會是正開著的群組
    expect(note!.querySelector('.sysnote__app')!.textContent).toBe(chat.name);
    const who = note!.querySelector('.sysnote__title')!.textContent!;
    expect(dmTitles).toContain(who);
    expect(who).not.toContain(cover.title);
    // 好幾個人同時傳訊息時，通知一則接一則跳：不同的人都輪得到
    const seenWho = new Set([who]);
    for (let i = 0; i < 40; i += 1) {
      act(() => void vi.advanceTimersByTime(500));
      const t = screen.queryByRole('button', { name: S.noticeOpen })?.querySelector('.sysnote__title')?.textContent;
      if (t) seenWho.add(t);
    }
    expect(seenWho.size).toBeGreaterThan(1);
    note = screen.queryByRole('button', { name: S.noticeOpen });
    if (!note) return;
    const last = note.querySelector('.sysnote__title')!.textContent!;
    // 點通知：通知收掉，人到了那個私訊裡
    fireEvent.click(note);
    expect(screen.getByRole('heading', { name: last })).toBeTruthy();
  });

  it('系統視窗（登入確認）：蓋在畫面上，按鈕的字來自資料；軟牆只跳提醒、視窗還在；不允許或先不處理才關', () => {
    const event = content.events.find((e) => e.kind === 'system')!;
    if (event.kind !== 'system') return;
    const soft = (event.options ?? []).find((o) => o.hints?.length)!;
    const hard = (event.options ?? []).find((o) => !o.hints?.length)!;
    const open = () => {
      window.localStorage.clear();
      const engine = createEngine(content);
      const game = engine.step(engine.start(), { type: 'sendCover' }).state;
      const full = Object.fromEntries(Object.entries(game.threads).map(([id, t]) => [id, t.appended.length]));
      writeSave('case01', fingerprint(content), { game: { ...game, prompt: event.id }, ui: { ...EMPTY_UI, revealed: full }, introDone: true, coverSeen: [] });
      render(<App mode="game" />);
    };
    open();
    const dialog = screen.getByRole('alertdialog', { name: event.title });
    expect(dialog.textContent).toContain(event.lines[0]);
    const before = battery();
    // 軟牆那顆：跳出資料裡的第一句提醒，視窗還在，不扣電
    fireEvent.click(screen.getByRole('button', { name: soft.label }));
    expect(screen.getByRole('status').textContent).toBe(soft.hints![0]);
    expect(screen.getByRole('alertdialog', { name: event.title })).toBeTruthy();
    expect(battery()).toBe(before);
    // 另一顆：視窗關掉
    fireEvent.click(screen.getByRole('button', { name: hard.label }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // 重來一次，點視窗外面（先不處理）也會關
    cleanup();
    open();
    fireEvent.click(screen.getByRole('button', { name: S.promptLater }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('有疑點可以問的時候，那個人的聊天室底部有一張上拉選單（先回完訊息才出現）；選了就送出那句話、扣電', () => {
    // 準備一份「疑點都成立、每個聊天室都讀過」的存檔
    const engine = createEngine(content);
    const game = engine.step(engine.start(), { type: 'sendCover' }).state;
    const ready = { ...game, cards: content.cards.map((c) => c.id), readThreads: content.threads.map((t) => t.id) };
    const full = Object.fromEntries(Object.entries(ready.threads).map(([id, t]) => [id, t.appended.length]));
    writeSave('case01', fingerprint(content), { game: ready, ui: { ...EMPTY_UI, revealed: full }, introDone: true, coverSeen: [] });
    render(<App mode="game" />);
    // 規則說現在能問的第一筆，以及它會在哪個聊天室送出
    const test = engine.menu(ready).tests[0];
    const card = content.cards.find((c) => c.id === test.card)!;
    const target = test.targets[0];
    const threadId = engine.testThread(card, target)!;
    const thread = content.threads.find((t) => t.id === threadId)!;
    const say = card.sayTo?.[target] ?? card.say!;
    const here = engine.menu(ready).tests.flatMap((t) => t.targets.filter((who) => engine.testThread(content.cards.find((c) => c.id === t.card)!, who) === threadId)).length;
    openApp('chat');
    fireEvent.click(screen.getByRole('button', { name: new RegExp('^.?' + thread.title) }));
    // 還有等著回的訊息時，疑點先不出現；回完才有
    if (document.querySelector('.options__item')) {
      expect(screen.queryByRole('button', { name: new RegExp(S.askHere) })).toBeNull();
      fireEvent.click(document.querySelector('.options__item') as HTMLElement);
      wait(20000);
    }
    // 底部是一條收著的把手，寫著有幾句可以問；點一下拉開，再點一下收起來
    const handle = () => screen.getByRole('button', { name: new RegExp(S.askHere) });
    expect(handle().textContent).toContain(String(here));
    expect(screen.queryByRole('button', { name: say })).toBeNull();
    fireEvent.click(handle());
    expect(screen.getByRole('button', { name: say })).toBeTruthy();
    fireEvent.click(handle());
    expect(screen.queryByRole('button', { name: say })).toBeNull();
    // 也可以用拉的：往上拉打開
    fireEvent.touchStart(handle(), { touches: [{ clientX: 100, clientY: 500 }] });
    fireEvent.touchEnd(handle(), { changedTouches: [{ clientX: 100, clientY: 420 }] });
    expect(screen.getByRole('button', { name: say })).toBeTruthy();
    const before = battery();
    fireEvent.click(screen.getByRole('button', { name: say }));
    expect(battery()).toBe(before - test.cost);
    expect(screen.getAllByText(say).some((el) => el.className.includes('bubble'))).toBe(true);
  });

  it('相簿大圖：左右滑換上一張、下一張，下方一排縮圖可以直接點；滑照片不會被當成往右滑返回', () => {
    startGame();
    home();
    openApp('photos');
    const cells = [...document.querySelectorAll('.gallery__cell')] as HTMLElement[];
    fireEvent.click(cells[0]);
    const stage = document.querySelector('.viewer__stage') as HTMLElement;
    const thumbs = () => [...document.querySelectorAll('.viewer__thumb')] as HTMLElement[];
    const current = () => thumbs().findIndex((t) => t.getAttribute('aria-selected') === 'true');
    // 縮圖跟格子一樣多，目前是第一張
    expect(thumbs().length).toBe(cells.length);
    expect(current()).toBe(0);
    const swipe = (from: number, to: number) => {
      fireEvent.touchStart(stage, { touches: [{ clientX: from, clientY: 300 }] });
      fireEvent.touchMove(stage, { touches: [{ clientX: to, clientY: 304 }] });
      // 滑的過程中圖片不會跟著動
      expect((document.querySelector('.viewer__slide') as HTMLElement).style.transform).toBe('');
      fireEvent.touchEnd(stage, { changedTouches: [{ clientX: to, clientY: 304 }] });
    };
    // 往左滑：下一張；往右滑：回上一張，而且人還在大圖裡（沒有被當成返回）
    swipe(260, 60);
    expect(current()).toBe(1);
    swipe(40, 240);
    expect(current()).toBe(0);
    expect(document.querySelector('.viewer')).toBeTruthy();
    // 第一張再往右滑，不會動
    swipe(40, 240);
    expect(current()).toBe(0);
    // 滑得太短不算
    swipe(200, 180);
    expect(current()).toBe(0);
    // 點縮圖直接跳過去
    fireEvent.click(thumbs()[3]);
    expect(current()).toBe(3);
  });

  it('簡訊：一列一個寄件者，同一個寄件者的併成一串，點進去是一則一則的泡泡；可以搜尋', () => {
    startGame();
    home();
    openApp('sms');
    const sms = content.items.filter((x) => x.app === 'sms' && !x.hidden);
    const senders = [...new Set(sms.map((x) => x.title!))];
    expect(document.querySelectorAll('.comm-row').length).toBe(senders.length);
    // 最新的那一則的寄件者排最上面
    expect(document.querySelector('.comm-row__name')!.textContent).toBe(sms[sms.length - 1].title);
    // 找一個有不只一則的寄件者：列上有則數，點進去每一則各一個泡泡
    const many = senders.find((name) => sms.filter((x) => x.title === name).length > 1)!;
    const theirs = sms.filter((x) => x.title === many);
    fireEvent.click(screen.getByRole('button', { name: many }));
    expect(screen.getByRole('heading', { name: many })).toBeTruthy();
    expect(document.querySelectorAll('.sms-msg__bubble').length).toBe(theirs.length);
    expect(document.querySelector('.sms-thread')!.textContent).toContain(theirs[0].body.split('\n')[0]);
    // 回到清單，搜尋只留下符合的寄件者
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    fireEvent.change(screen.getByRole('searchbox', { name: S.search }), { target: { value: many } });
    expect(document.querySelectorAll('.comm-row').length).toBe(1);
  });

  it('電話：最近通話（新的在上、未接用另一種樣子、可只看未接）、聯絡人、鍵盤；鍵盤撥號打不出去', () => {
    startGame();
    home();
    openApp('phone');
    const calls = content.items.filter((x) => x.app === 'phone' && !x.hidden);
    const isMissed = (x: (typeof calls)[number]) => (x.fields?.find((f) => f.label === S.callDirectionField)?.value ?? x.body).includes('未接');
    const rows = () => [...document.querySelectorAll('.comm-row--call')];
    expect(rows().length).toBe(calls.length);
    expect(rows()[0].querySelector('.comm-row__name')!.textContent).toBe(calls[calls.length - 1].title);
    expect(document.querySelectorAll('.comm-row--missed').length).toBe(calls.filter(isMissed).length);
    fireEvent.click(screen.getByRole('tab', { name: S.callMissedOnly }));
    expect(rows().length).toBe(calls.filter(isMissed).length);
    // 聯絡人分頁列出四個人
    fireEvent.click(screen.getByRole('tab', { name: S.callContacts }));
    for (const c of content.characters) expect(screen.getAllByText(c.name).length).toBeGreaterThan(0);
    // 鍵盤可以按、可以刪；按撥號只會跳一句打不出去
    fireEvent.click(screen.getByRole('tab', { name: S.callKeypad }));
    for (const k of ['0', '9', '1']) fireEvent.click(screen.getByRole('button', { name: k }));
    expect(screen.getByTestId('keypad-digits').textContent).toBe('091');
    fireEvent.click(screen.getByRole('button', { name: S.callDelete }));
    expect(screen.getByTestId('keypad-digits').textContent).toBe('09');
    const before = battery();
    fireEvent.click(screen.getByRole('button', { name: S.callDial }));
    expect(screen.getByRole('status').textContent).toBe(S.callBlocked);
    expect(battery()).toBe(before);
  });
});
