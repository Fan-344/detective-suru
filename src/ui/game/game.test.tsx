import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../../content';
import { createEngine } from '../../engine';
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
    // 在意的地方的小卡片上是那句話本身，不露出疑點的標題
    expect(screen.queryByText(card.title)).toBeNull();
    const concern = [...document.querySelectorAll('.doubt--concern')].find((el) => el.textContent?.includes(subject.body)) as HTMLElement;
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

  it('指認兇手：四格都填好才能交；有格子站不住會被退回、扣電、顯示提示，內容留著；全對後交出證據進結局', () => {
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
    // 交出去：被退回，扣一次電，站不住的那一格旁邊出現提示，填的還在
    fireEvent.click(handIn());
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
    // 換成對的那一張，提示收起來；再交就通過，接著選把證據交給誰
    fill(first.id, first.cards![0]);
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(handIn());
    expect(screen.getByTestId('accuse-prompt').textContent).toBe(S.accuseGivePrompt);
    const to = ch.recipients[0];
    fireEvent.click(screen.getByRole('radio', { name: nameOfPerson(to) }));
    fireEvent.click(screen.getByRole('button', { name: S.accuseSubmit }));
    expect(screen.getByRole('button', { name: S.endingRestart })).toBeTruthy();
  });

  it('指認兇手：人指錯了，交出去就直接進那個人的結局', () => {
    startWithAllCards();
    for (const f of cardFields) fill(f.id, f.cards![0]);
    const innocent = ch.suspects.find((x) => x !== ch.culprit)!;
    who(innocent);
    fireEvent.click(handIn());
    const ending = content.endings.endings.find((e) => e.trigger.kind === 'challenge' && e.trigger.accused === innocent)!;
    expect(screen.getByText(ending.title)).toBeTruthy();
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
});
