import { describe, expect, it } from 'vitest';
import { avatarChar } from './Chat';

describe('沒有圖的頭像取哪個字', () => {
  it('先拿掉括號裡的補充，再取最後一個字', () => {
    expect(avatarChar('小安（月光雜誌）')).toBe('安');
    expect(avatarChar('接案插畫互助群（214）')).toBe('群');
    expect(avatarChar('阿澤')).toBe('澤');
  });
  it('整個名字都在括號裡時，照原樣取', () => {
    expect(avatarChar('（214）')).toBe('）');
  });
});
