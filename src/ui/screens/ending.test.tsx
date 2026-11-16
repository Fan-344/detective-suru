import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';
import { Ending } from './Ending';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const text = ['第一段。', '螢幕暗了下去。', '第三段。'];
const tap = () => act(() => document.querySelector<HTMLElement>('.ending__scroll')!.click());

describe('結局逐段出現', () => {
  it('不點就停在原地；點一下換一段；全部出完才有按鈕', () => {
    render(<Ending title="T" text={text} onRestart={() => undefined} />);
    expect(screen.getByText(S.tapToContinue)).toBeTruthy();
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.queryByText('螢幕暗了下去。')).toBeNull();
    tap();
    expect(screen.getByText('螢幕暗了下去。')).toBeTruthy();
    expect(screen.queryByText('第三段。')).toBeNull();
    expect(screen.queryByRole('button', { name: S.endingRestart })).toBeNull();
    // 最新的一段最亮，講過的變淡
    expect(screen.getByText('螢幕暗了下去。').closest('.intro__seg')!.classList.contains('intro__seg--now')).toBe(true);
    expect(screen.getByText('第一段。').closest('.intro__seg')!.classList.contains('intro__seg--now')).toBe(false);
    tap();
    expect(screen.getByText('第三段。')).toBeTruthy();
    expect(screen.getByRole('button', { name: S.endingRestart })).toBeTruthy();
    expect(screen.queryByText(S.tapToContinue)).toBeNull();
  });

  it('點標題列、點下方「點一下繼續」那行、暗角邊緣也會換下一段；按鈕出現後點畫面不會再動', () => {
    const restart = vi.fn();
    render(<Ending title="T" text={text} screenOff="螢幕暗了下去。" onRestart={restart} />);
    act(() => document.querySelector<HTMLElement>('.suru-head')!.click());
    expect(screen.getByText('螢幕暗了下去。')).toBeTruthy();
    act(() => document.querySelector<HTMLElement>('.intro__hint')!.click());
    expect(screen.getByText('第三段。')).toBeTruthy();
    act(() => document.querySelector<HTMLElement>('.ending')!.click());
    expect(document.querySelectorAll('.ending__seg')).toHaveLength(3);
    screen.getByRole('button', { name: S.endingRestart }).click();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('點到「螢幕暗下」那一段之後一直是黑白加暗角，按鈕也在同樣的狀態下出現', () => {
    render(<Ending title="T" text={text} screenOff="螢幕暗了下去。" onRestart={() => undefined} />);
    const root = document.querySelector('.ending')!;
    expect(root.classList.contains('ending--off')).toBe(false);
    tap();
    expect(root.classList.contains('ending--off')).toBe(true);
    expect(document.querySelector('.ending__vignette')).not.toBeNull();
    tap();
    expect(screen.getByText('第三段。')).toBeTruthy();
    expect(root.classList.contains('ending--off')).toBe(true);
    expect(root.querySelector('button')).not.toBeNull();
  });

  it('開發工具的快轉：數字一變，剩下的段落立刻全部出現', () => {
    const { rerender } = render(<Ending title="T" text={text} devSkip={0} onRestart={() => undefined} />);
    expect(screen.queryByText('第三段。')).toBeNull();
    rerender(<Ending title="T" text={text} devSkip={1} onRestart={() => undefined} />);
    expect(screen.getByText('第三段。')).toBeTruthy();
  });
});

describe('結局的對話段落', () => {
  const names = ['品妤', '宗翰'];
  it('整段符合格式才是對話；「你」是自己傳出去的', async () => {
    const { parseSaid } = await import('./Ending');
    expect(parseSaid('品妤：「沈以晴」「這不好笑」', names)).toEqual({ who: '品妤', mine: false, says: ['沈以晴', '這不好笑'] });
    expect(parseSaid('你：「我不是以晴。」', names)).toEqual({ who: '你', mine: true, says: ['我不是以晴。'] });
    // 段末多句號、敘述裡夾引號、不認得的名字都不算
    expect(parseSaid('品妤：「辛苦了」。', names)).toBeNull();
    expect(parseSaid('她在「永和四樓」開口。', names)).toBeNull();
    expect(parseSaid('房東：「好」', names)).toBeNull();
  });

  it('別人的泡泡靠左、名字標一次；自己的靠右、不標名字；不顯示引號', () => {
    const lines = ['開場。', '品妤：「沈以晴」「這不好笑」', '你：「我不是以晴。」'];
    render(<Ending title="T" text={lines} speakers={{ 品妤: 'pinyu' }} onRestart={() => undefined} />);
    tap();
    tap();
    const chats = document.querySelectorAll('.endchat');
    expect(chats[0].querySelectorAll('.endchat__name').length).toBe(1);
    expect([...chats[0].querySelectorAll('.endchat__bubble')].map((el) => el.textContent)).toEqual(['沈以晴', '這不好笑']);
    expect(chats[1].classList.contains('endchat--mine')).toBe(true);
    expect(chats[1].querySelector('.endchat__name')).toBeNull();
    expect(chats[1].querySelector('.endchat__bubble')!.textContent).toBe('我不是以晴。');
  });
});
