import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

// 音效本身換成記錄用的假函式：這裡只檢查「什麼時候叫了哪個音效」
const played: string[] = [];
vi.mock('../sound', () => ({
  playSound: (id: string) => played.push(id),
  stopSound: () => undefined,
  stopAllSounds: () => undefined,
  unlockSound: () => false,
  isMuted: () => false,
  setMuted: () => undefined,
  onMuteChange: () => () => undefined,
}));

const { App } = await import('../App');

beforeEach(() => {
  played.length = 0;
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('音效的時機', () => {
  it('開場第一次點畫面播喚醒聲；重播開場之後，第一次點又會再播一次', () => {
    render(<App mode="game" />);
    expect(played).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: S.tapToContinue }));
    expect(played).toEqual(['wake']);
    // 同一輪再點不會再響
    fireEvent.click(screen.getByRole('button', { name: S.tapToContinue }));
    expect(played).toEqual(['wake']);
    // 跳過開場，再用開發面板重播開場
    fireEvent.click(screen.getByRole('button', { name: 'DEV' }));
    fireEvent.click(screen.getByRole('button', { name: '跳過開場' }));
    fireEvent.click(screen.getByRole('button', { name: '重播開場' }));
    played.length = 0;
    fireEvent.click(screen.getByRole('button', { name: S.tapToContinue }));
    expect(played).toEqual(['wake']);
  });
});
