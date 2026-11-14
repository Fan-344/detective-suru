import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../../content';
import { App } from '../App';
import { S } from '../strings';

// 真的遊戲：內容來自 content/case01，規則來自 src/engine。
// 這裡不寫死任何台詞或數字，要比對的東西都從資料檔讀。
const content = loadCase('case01');
const cost = content.meta.battery.cost;
const start = content.meta.battery.start;

beforeEach(() => vi.useFakeTimers());
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

  it('心聲一次只跳一個問題，通知往上滑會收掉', () => {
    render(<App mode="game" />);
    passIntro();
    // 通知過幾秒會自己收起，所以送出後馬上看
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    const note = screen.getByRole('button', { name: S.noticeDismiss });
    // 綁結論的心聲很多句，但畫面上只會有一則通知
    expect(screen.getAllByRole('status').length).toBe(1);
    const bound = content.voice.filter((v) => v.conclusion && (v.level ?? 1) === 1);
    expect(bound.length).toBeGreaterThan(1);
    expect(screen.getByRole('status').textContent).toBe(bound[0].text);
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

  it('時間軸只放紀錄，不放聊天裡說的話', () => {
    startGame();
    home();
    openApp('receipts');
    home();
    openApp('suru');
    fireEvent.click(screen.getByRole('tab', { name: S.suruTimeline }));
    const rows = [...document.querySelectorAll('.suru-time__text')].map((el) => el.textContent);
    expect(rows.length).toBeGreaterThan(0);
    // 說法的寫法是「某人：「…」」，時間軸裡不該出現
    expect(rows.some((t) => t?.includes('：「'))).toBe(false);
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
});
