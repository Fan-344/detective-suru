import { useEffect, type RefObject } from 'react';

/**
 * 開場和結局共用：一段一段出現的畫面，每出現新的一段，就把它捲到畫面上的固定位置。
 * at 是要停在畫面高度的幾分之幾；anchor 說停在那裡的是這一段的頂端還是正中間。
 * 只捲動這個區塊本身；不用 scrollIntoView，它會連外層的頁面一起捲，在電腦上會整個跑掉。
 */
export function useBringIntoView(
  scroller: RefObject<HTMLElement | null>,
  current: RefObject<HTMLElement | null>,
  step: number,
  at: number,
  anchor: 'top' | 'center' = 'top',
) {
  useEffect(() => {
    const box = scroller.current;
    const el = current.current;
    if (!box || !el) return;
    const point = el.offsetTop + (anchor === 'center' ? el.offsetHeight / 2 : 0);
    const top = Math.max(0, point - box.clientHeight * at);
    if (typeof box.scrollTo === 'function') box.scrollTo({ top, behavior: 'smooth' });
    else box.scrollTop = top;
  }, [scroller, current, step, at, anchor]);
}
