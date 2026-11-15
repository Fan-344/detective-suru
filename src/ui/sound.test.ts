import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 假的聲音環境：記下開始播了哪些（用音量分辨不出來，所以記 buffer 的名字）
let started: string[];
let stopped: number;
class FakeContext {
  state = 'running';
  destination = {};
  resume = () => Promise.resolve();
  decodeAudioData(data: ArrayBuffer, ok: (b: unknown) => void) {
    ok({ name: new TextDecoder().decode(data) });
  }
  createGain() {
    return { gain: { value: 1 }, connect: (x: unknown) => x };
  }
  createBufferSource() {
    const node = {
      buffer: null as { name: string } | null,
      loop: false,
      connect: (x: unknown) => x,
      start: () => started.push(node.buffer!.name),
      stop: () => stopped++,
    };
    return node;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  started = [];
  stopped = 0;
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', (url: string) => Promise.resolve({ arrayBuffer: () => Promise.resolve(new TextEncoder().encode(String(url)).buffer) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('音效', () => {
  it('第一次點畫面之前不出聲，也不補播', async () => {
    const s = await import('./sound');
    s.playSound('clue_found');
    s.unlockSound();
    await flush();
    await flush();
    expect(started).toEqual([]);
  });

  it('解鎖後會播；同一個音效 300ms 內不重播', async () => {
    const s = await import('./sound');
    s.unlockSound();
    s.playSound('clue_found');
    s.playSound('clue_found');
    await flush();
    await flush();
    expect(started.length).toBe(1);
    expect(started[0]).toContain('clue_found');
  });

  it('來電鈴聲循環播放，掛斷就停', async () => {
    const s = await import('./sound');
    s.unlockSound();
    s.playSound('call_ring');
    await flush();
    await flush();
    expect(started.length).toBe(1);
    s.stopSound('call_ring');
    expect(stopped).toBe(1);
  });

  it('靜音時不出聲，選擇會記住', async () => {
    const s = await import('./sound');
    s.setMuted(true);
    s.unlockSound();
    s.playSound('solved');
    await flush();
    await flush();
    expect(started).toEqual([]);
    vi.resetModules();
    const again = await import('./sound');
    expect(again.isMuted()).toBe(true);
  });
});
