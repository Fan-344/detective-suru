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
});
