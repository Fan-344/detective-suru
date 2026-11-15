import list from './assets/sounds/sounds.json';

// 音效：檔案和清單（音量、要不要循環、怎麼震）由美術・音效那邊維護，這裡只負責播。
// 規則：玩家第一次點畫面之前一律不出聲，也不補播；同一個音效 300ms 內不重播；
// 靜音時震動也一起停。iPhone 切到靜音時照系統規則不出聲，這裡不另外繞過。

export type SoundId = 'wake' | 'clue_spotted' | 'clue_found' | 'clue_wrong' | 'call_ring' | 'login_alert' | 'solved' | 'case_failed' | 'power_off';

interface SoundDef {
  id: string;
  volume?: number;
  loop?: boolean;
  vibrate?: number[];
}

const FILES = import.meta.glob<string>('./assets/sounds/*.m4a', { eager: true, import: 'default' });
const DEFS = new Map<string, SoundDef>((list.sounds as SoundDef[]).map((d) => [d.id, d]));
const urlOf = (id: string) => FILES[`./assets/sounds/${id}.m4a`];

const MUTE_KEY = 'suru-muted';
const REPEAT_GAP = 300;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<string, number>();
/** 正在循環的音效：聲音本身和跟著節奏的震動 */
const loops = new Map<string, { source?: AudioBufferSourceNode; gain?: GainNode; buzz?: number; token: object }>();
let muted = readMuted();
const listeners = new Set<() => void>();

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* 不支援震動的瀏覽器就算了 */
  }
}

/**
 * 玩家點畫面時呼叫。第一次：建立聲音環境，並先把所有音檔解碼好。
 * 之後每次：聲音環境不是在跑的狀態就叫醒它（iPhone 鎖過螢幕、切過 App 會變成 suspended 或 interrupted）。
 * 回傳這次是不是第一次建立。
 */
export function unlockSound(): boolean {
  if (ctx) {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    return false;
  }
  const Make = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Make) return false;
  try {
    ctx = new Make();
  } catch {
    return false;
  }
  const c = ctx;
  void c.resume().catch(() => undefined);
  // 有些手機瀏覽器要在點擊的當下真的播過一點聲音才算解鎖：播一段聽不到的極短空白
  try {
    const blank = c.createBufferSource();
    blank.buffer = c.createBuffer(1, 1, 22050);
    blank.connect(c.destination);
    blank.start(0);
  } catch {
    /* 不支援就算了 */
  }
  for (const id of DEFS.keys()) {
    const url = urlOf(id);
    if (!url) continue;
    buffers.set(
      id,
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => new Promise<AudioBuffer>((ok, fail) => c.decodeAudioData(data, ok, fail)))
        .catch(() => null),
    );
  }
  return true;
}

/** 播一個音效。還沒解鎖、靜音、或 300ms 內剛播過就不播 */
export function playSound(id: SoundId) {
  const def = DEFS.get(id);
  if (!ctx || !def || muted) return;
  const now = Date.now();
  if (now - (lastPlayed.get(id) ?? -Infinity) < REPEAT_GAP) return;
  lastPlayed.set(id, now);
  if (def.loop) {
    if (loops.has(id)) return;
    const entry: { source?: AudioBufferSourceNode; gain?: GainNode; buzz?: number; token: object } = { token: {} };
    loops.set(id, entry);
    if (def.vibrate) {
      const pattern = def.vibrate;
      const period = pattern.reduce((a, b) => a + b, 0);
      vibrate(pattern);
      entry.buzz = window.setInterval(() => vibrate(pattern), period);
    }
    void start(id, def, entry);
    return;
  }
  if (def.vibrate) vibrate(def.vibrate);
  void start(id, def);
}

async function start(id: string, def: SoundDef, entry?: { source?: AudioBufferSourceNode; gain?: GainNode; token: object }) {
  const c = ctx;
  const buffer = await buffers.get(id);
  if (!c || !buffer || muted) return;
  // 循環的音效在解碼完之前就已經被叫停了
  if (entry && loops.get(id) !== entry) return;
  // 聲音環境被暫停了（例如手機鎖過螢幕）：先叫醒再播
  if (c.state !== 'running') await c.resume().catch(() => undefined);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = !!def.loop;
  const gain = c.createGain();
  gain.gain.value = def.volume ?? 1;
  source.connect(gain).connect(c.destination);
  source.start();
  if (entry) {
    entry.source = source;
    entry.gain = gain;
  }
}

/** 停掉一個循環中的音效（例如來電掛斷了） */
export function stopSound(id: SoundId) {
  const entry = loops.get(id);
  if (!entry) return;
  loops.delete(id);
  if (entry.buzz !== undefined) {
    window.clearInterval(entry.buzz);
    vibrate(0);
  }
  try {
    entry.source?.stop();
  } catch {
    /* 已經停了 */
  }
}

export function stopAllSounds() {
  for (const id of [...loops.keys()]) stopSound(id as SoundId);
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* 存不了就只記在這次 */
  }
  if (value) stopAllSounds();
  listeners.forEach((fn) => fn());
}

export function onMuteChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
