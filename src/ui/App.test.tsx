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
    fireEvent.click(screen.getByRole('button', { name: /發票雲/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Link/ }));
    const dm = fixture.phone.threads[1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dm.title) }));
    expect(screen.getByText(dm.options![0].text)).toBeTruthy();
  });

  it('找裝置在資料夾裡，按定位之後才看得到位置紀錄', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /工具/ }));
    fireEvent.click(screen.getByRole('button', { name: /找裝置/ }));
    const device = fixture.phone.finder[0];
    expect(screen.queryByText(device.history[0])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `${S.finderLocate} ${device.name}` }));
    expect(screen.getByText(device.history[0])).toBeTruthy();
    expect(screen.getByText(device.history[1])).toBeTruthy();
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

  it('Suru 樣式示意頁看得到疑點、對象和開始推理的表單', () => {
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

  it('Suru 助理：從圖示打開，有疑點、線索、時間軸三個分頁，收起後回主畫面', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /Suru/ }));
    const suru = fixture.phone.suru;
    expect(screen.getByText(suru.voice[0].text)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: S.suruTimeline }));
    expect(screen.getByText(suru.timeline[0].text!)).toBeTruthy();
    expect(screen.getAllByText(S.suruGap).length).toBe(2);
    fireEvent.click(screen.getByRole('tab', { name: S.suruClues }));
    expect(screen.getByText(suru.records[0].title)).toBeTruthy();
    expect(screen.getByText(suru.statements[0].title)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.suruSaid }));
    expect(screen.getByText(suru.voice[1].text)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.suruClose }));
    expect(screen.getByRole('button', { name: /發票雲/ })).toBeTruthy();
  });

  it('長按 home 鍵叫出 Suru 助理，短按回主畫面', () => {
    vi.useFakeTimers();
    render(<App />);
    passIntro();
    const button = screen.getByRole('button', { name: S.home });
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(screen.getByRole('tab', { name: S.suruCards })).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('tab', { name: S.suruCards })).toBeNull();
  });

  it('背景 App 真的能用：計算機、行事曆、設定', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /計算機/ }));
    for (const key of ['7', '×', '6', '=']) fireEvent.click(screen.getByRole('button', { name: key }));
    expect(screen.getByTestId('calc-display').textContent).toBe('42');
    home();

    fireEvent.click(screen.getByRole('button', { name: /行事曆/ }));
    expect(screen.getByText('2026 年 11 月')).toBeTruthy();
    expect(screen.getByText(S.calEmpty)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2026-11-14' }));
    expect(screen.getByText(fixture.phone.calendar.events[0].title)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.calNext }));
    expect(screen.getByText('2026 年 12 月')).toBeTruthy();
    home();

    fireEvent.click(screen.getByRole('button', { name: /設定/ }));
    expect(screen.getByTestId('battery')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: S.setShowPercent }));
    expect(screen.queryByTestId('battery')).toBeNull();
  });

  it('連續逛三個背景 App 會跳出 Suru 的提醒，點一下收起，不擋操作', () => {
    render(<App />);
    passIntro();
    for (const name of [/計算機/, /音樂/]) {
      home();
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(screen.queryByRole('status')).toBeNull();
    home();
    fireEvent.click(screen.getByRole('button', { name: /時鐘/ }));
    expect(screen.getByRole('status').textContent).toBe(fixture.wander.hints[0]);
    expect(screen.getByRole('tab', { name: S.clockWorld })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.noticeDismiss }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('時鐘有三個分頁，世界時鐘從資料給的時刻開始走', () => {
    vi.useFakeTimers();
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /時鐘/ }));
    expect(screen.getByTestId('world-time').textContent).toBe('16:20:00');
    act(() => {
      vi.advanceTimersByTime(61000);
    });
    expect(screen.getByTestId('world-time').textContent).toBe('16:21:01');
    fireEvent.click(screen.getByRole('tab', { name: S.clockAlarm }));
    expect(screen.getByText(fixture.phone.clock.alarms[0].label)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: S.clockWatch }));
    expect(screen.getByTestId('watch-time').textContent).toBe('00:00.00');
  });

  it('聯絡人 App：上方是背景前言，每個人一筆，點開看簡介', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /聯絡人$/ }));
    const cast = fixture.phone.contacts;
    expect(screen.getByText(cast.intro[0])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(cast.people[1].name) }));
    expect(screen.getByText(cast.people[1].brief)).toBeTruthy();
    back();
    expect(screen.getByText(cast.intro[2])).toBeTruthy();
  });

  it('指認兇手：一題一題問，答過的留在上方，中途離開回來從同一題繼續', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /Suru/ }));
    fireEvent.click(screen.getByRole('button', { name: S.accuseEntry }));
    const accuse = fixture.phone.suru.accuse;
    const records = fixture.phone.suru.records;
    const prompt = () => screen.getByTestId('accuse-prompt').textContent;
    expect(screen.getByText(accuse.intro[0])).toBeTruthy();
    expect(prompt()).toBe(accuse.steps[0].prompt);
    const submit = () => screen.getByRole('button', { name: S.accuseSubmit }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);

    const pickRecord = (i: number) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(records[i].title) }));
    pickRecord(0);
    fireEvent.click(submit());
    expect(prompt()).toBe(accuse.steps[1].prompt);
    // 答過的那筆會留在上方，同時也還在下面的選單裡
    expect(screen.getAllByText(records[0].title).length).toBe(2);

    // 中途離開再回來，還在第二題
    fireEvent.click(screen.getByRole('button', { name: S.back }));
    fireEvent.click(screen.getByRole('button', { name: S.accuseEntry }));
    expect(prompt()).toBe(accuse.steps[1].prompt);

    pickRecord(1);
    fireEvent.click(submit());
    fireEvent.click(screen.getByRole('radio', { name: accuse.steps[2].options![0] }));
    fireEvent.click(submit());
    pickRecord(2);
    fireEvent.click(submit());
    pickRecord(0);
    fireEvent.click(submit());
    expect(prompt()).toBe(accuse.steps[5].prompt);
    fireEvent.click(screen.getByRole('radio', { name: accuse.steps[5].options![1] }));
    fireEvent.click(submit());
    expect(screen.getByRole('status').textContent).toBe(fixture.accuseResult);
    expect(screen.getByRole('tab', { name: S.suruCards })).toBeTruthy();
  });

  it('頭像和聊天裡的照片點一下看大圖，再點一下關閉', () => {
    render(<App />);
    passIntro();
    home();
    fireEvent.click(screen.getByRole('button', { name: /聯絡人$/ }));
    const person = fixture.phone.contacts.people[2];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${person.name}`) }));
    fireEvent.click(screen.getByRole('button', { name: `${S.zoomOpen}：${person.name}` }));
    fireEvent.click(screen.getByRole('button', { name: S.zoomClose }));
    expect(screen.queryByRole('button', { name: S.zoomClose })).toBeNull();
    home();

    fireEvent.click(screen.getByRole('button', { name: /Link/ }));
    fireEvent.click(screen.getByRole('button', { name: /聯絡人丁/ }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${S.zoomOpen}：圖片`) }));
    expect(screen.getByRole('button', { name: S.zoomClose })).toBeTruthy();
  });

  it('心聲像系統通知一樣跳出來，點一下收起', () => {
    vi.useFakeTimers();
    render(<App />);
    passIntro();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByRole('status').textContent).toBe(fixture.phone.suru.voice[0].text);
    fireEvent.click(screen.getByRole('button', { name: S.noticeDismiss }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
