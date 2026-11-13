import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import fixture from './mock/fixture.json';
import { S } from './strings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function passIntro() {
  const intro = screen.getByRole('button', { name: S.tapToContinue });
  for (let i = 0; i < fixture.intro.length; i += 1) fireEvent.click(intro);
}

const home = () => fireEvent.click(screen.getByRole('button', { name: S.home }));
const back = () => fireEvent.click(screen.getByRole('button', { name: S.back }));

describe('外觀框架', () => {
  it('開場一段一段出現，結束後進入群組，輸入框只能按送出', () => {
    render(<App />);
    expect(screen.getByText(fixture.intro[0].lines[0])).toBeTruthy();
    expect(screen.queryByText(fixture.intro[1].lines[0])).toBeNull();
    passIntro();
    const group = fixture.phone.threads[0];
    expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    expect(screen.getByText(group.prefill!)).toBeTruthy();
    expect(screen.getByRole('button', { name: S.send })).toBeTruthy();
  });

  it('送出後出現在聊天室，對方輸入中，之後回覆', () => {
    vi.useFakeTimers();
    render(<App />);
    passIntro();
    fireEvent.click(screen.getByRole('button', { name: S.send }));
    expect(screen.queryByRole('button', { name: S.send })).toBeNull();
    expect(screen.getByLabelText(new RegExp(S.typing))).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(fixture.mockReplyText)).toBeTruthy();
  });

  it('能進出三種版型', () => {
    render(<App />);
    passIntro();
    home();

    // 清單加詳情
    fireEvent.click(screen.getByRole('button', { name: /雲端發票/ }));
    const row = fixture.phone.lists.receipts[0].rows[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(row.title) }));
    expect(screen.getByText(row.detail.when)).toBeTruthy();
    back();
    back();

    // 縮圖格子加大圖
    fireEvent.click(screen.getByRole('button', { name: /相簿/ }));
    const photo = fixture.phone.galleries.photos[0];
    fireEvent.click(screen.getByRole('button', { name: photo.image.description }));
    expect(screen.getByText(photo.when)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.next }));
    expect(screen.getByText(fixture.phone.galleries.photos[1].when)).toBeTruthy();
    home();

    // 聊天列表與聊天室
    fireEvent.click(screen.getByRole('button', { name: /聊聊/ }));
    const dm = fixture.phone.threads[1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dm.title) }));
    expect(screen.getByText(dm.options![0].text)).toBeTruthy();
  });

  it('資料夾裡的 App 打得開', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /工具/ }));
    fireEvent.click(screen.getByRole('button', { name: /找裝置/ }));
    expect(screen.getByText(S.placeholderScreen)).toBeTruthy();
  });

  it('電量歸零顯示沒電畫面，點一下回到開場', () => {
    render(<App />);
    passIntro();
    expect(screen.getByTestId('battery').textContent).toBe(`${fixture.startBattery}%`);
    fireEvent.click(screen.getByRole('button', { name: 'DEV' }));
    fireEvent.click(screen.getByRole('button', { name: '沒電' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(S.batteryDead) }));
    expect(screen.getByText(fixture.intro[0].lines[0])).toBeTruthy();
  });

  it('Suru 樣式示意頁看得到測試牌、對象和挑戰書', () => {
    render(<App />);
    passIntro();
    fireEvent.click(screen.getByRole('button', { name: 'DEV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suru 樣式' }));
    const demo = fixture.suruDemo;
    expect(screen.getByText(demo.cards[0].title)).toBeTruthy();
    expect(screen.getByText(demo.form[3])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: demo.close }));
    expect(screen.queryByText(demo.cards[0].title)).toBeNull();
  });
});
