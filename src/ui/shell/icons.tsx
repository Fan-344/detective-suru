import type { ReactNode } from 'react';
import type { IconId } from '../types';

// 自己畫的 App 圖示：單線條圖形放在有色底上，不仿製任何真實品牌。
const GLYPHS: Record<IconId, ReactNode> = {
  // 兩個交疊的對話框
  chat: (
    <>
      <path d="M5 6.5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H10l-3.5 3v-3H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
      <path d="M19.5 10.5a2 2 0 0 1 1.5 1.9v4.1a2 2 0 0 1-2 2v2.2l-2.6-2.2" />
    </>
  ),
  // 一圈光暈加一個點：片刻
  moments: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5M12 20.5A8.5 8.5 0 0 1 3.5 12" />
      <path d="M17.5 17.5l1.6 1.6M4.9 4.9l1.6 1.6" />
    </>
  ),
  // 鋸齒下緣的收據
  receipts: (
    <>
      <path d="M6.5 3.5h11v17l-2.2-1.6-1.8 1.6-1.5-1.6-1.5 1.6-1.8-1.6-2.2 1.6z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </>
  ),
  // 折角的紙
  notes: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14.5 3.5V8H19M9 12h7M9 15.5h7" />
    </>
  ),
  // 山與太陽
  photos: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 5 4" />
    </>
  ),
  // 聽筒
  phone: (
    <path d="M7.2 4h2.6l1.4 3.8-1.9 1.4a11 11 0 0 0 5.5 5.5l1.4-1.9 3.8 1.4v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 5.200 6.2a2 2 0 0 1 2-2.200z" />
  ),
  // 信封
  sms: (
    <>
      <rect x="3.500" y="6" width="17" height="12.500" rx="2.500" />
      <path d="M4.500 8l7.500 5.500L19.500 8" />
    </>
  ),
  // 雲與雨
  weather: (
    <>
      <path d="M7.500 15.500a3.700 3.700 0 0 1-.4-7.400 5 5 0 0 1 9.600 1.200 3.100 3.100 0 0 1 .3 6.200z" />
      <path d="M9 18.500l-.8 2M12.500 18.500l-.8 2M16 18.500l-.8 2" />
    </>
  ),
  // 同心圓加準星
  finder: (
    <>
      <circle cx="12" cy="12" r="7.500" />
      <circle cx="12" cy="12" r="2.500" />
      <path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3" />
    </>
  ),
  // 兩個相連的音符
  music: (
    <>
      <path d="M9 17.5V6l9.5-2v11.5" />
      <circle cx="6.8" cy="17.5" r="2.2" />
      <circle cx="16.3" cy="15.5" r="2.2" />
    </>
  ),
  // 機身與鏡頭
  camera: (
    <>
      <path d="M4 8h3.2l1.4-2.2h6.800L16.800 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.200" r="3.300" />
    </>
  ),
  // 四格
  tools: (
    <>
      <rect x="4.500" y="4.500" width="6" height="6" rx="1.500" />
      <rect x="13.500" y="4.500" width="6" height="6" rx="1.500" />
      <rect x="4.500" y="13.500" width="6" height="6" rx="1.500" />
      <rect x="13.500" y="13.500" width="6" height="6" rx="1.500" />
    </>
  ),
};

export function Glyph({ icon }: { icon: IconId }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[icon]}
    </svg>
  );
}

export function AppIcon({ icon, size = 'md' }: { icon: IconId; size?: 'sm' | 'md' }) {
  return (
    <span className={`app-icon app-icon--${icon} app-icon--${size}`}>
      <Glyph icon={icon} />
    </span>
  );
}

export function WifiGlyph() {
  return (
    <svg viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" aria-hidden="true">
      <path d="M1.500 4.200a9.500 9.500 0 0 1 13 0M3.800 6.700a6.200 6.200 0 0 1 8.400 0M6.100 9.100a2.900 2.900 0 0 1 3.800 0" />
    </svg>
  );
}

export function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.500 5.500L8 12l6.500 6.500" />
    </svg>
  );
}
