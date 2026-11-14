import type { ReactNode } from 'react';
import type { IconId } from '../types';

// 自己畫的 App 圖示。每個圖示各有自己的底色和畫法，像是不同公司做的 App；
// 每個只借一個大家熟悉的特徵（顏色或圖形其中一樣），其餘都是自己的設計，不仿製任何真實品牌。
// 底色寫在 ui.css 的 .app-icon--<id>，這裡只畫圖形。畫布是 60×60。
// 目前主要用圖檔，這些手畫的版本是沒有圖檔時的備援。
const ART: Partial<Record<IconId, ReactNode>> = {
  // 簡訊：米白色實心信封
  sms: (
    <>
      <rect x="12" y="17.5" width="36" height="25" rx="6" fill="#fff4e3" />
      <path d="M16 22.5 30 33l14-10.5" fill="none" stroke="#7a3fe0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // 備忘錄：一筆手寫的筆跡
  notes: (
    <path
      d="M12.5 39c5.5-11.5 11.5-19 14.5-16.5 3.2 2.700-5 13.500-1.500 13.800 3.300.300 6.200-8.300 10.300-7.300 3 .800 1.200 5.200 4.200 5.400 2.300.100 5-2.800 7.500-6.400"
      fill="none"
      stroke="#5a1f3d"
      strokeWidth="4.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // 雲端發票：鋸齒邊的收據加條碼，微微傾斜
  receipts: (
    <g transform="rotate(-9 30 30)">
      <path d="M17.5 17l3.200-3 3.100 3 3.100-3 3.100 3 3.100-3 3.100 3 3.100-3 3.200 3v26l-3.200 3-3.100-3-3.100 3-3.100-3-3.100 3-3.100-3-3.100 3-3.200-3z" fill="#fff" />
      <g fill="#1f2a22">
        <rect x="22" y="31" width="1.6" height="8" />
        <rect x="25" y="31" width="2.6" height="8" />
        <rect x="29" y="31" width="1.4" height="8" />
        <rect x="31.8" y="31" width="1.2" height="8" />
        <rect x="34.4" y="31" width="2.6" height="8" />
        <rect x="38.4" y="31" width="1.6" height="8" />
      </g>
      <rect x="22" y="21.5" width="12" height="2.6" rx="1.3" fill="#cfe9d6" />
    </g>
  ),
  // 片刻：一圈有缺口的圓環，缺口旁一個點
  moments: (
    <>
      <circle cx="29" cy="31" r="12.5" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray="58 20.54" transform="rotate(-18 29 31)" />
      <circle cx="42.5" cy="19" r="3.4" fill="#fff" />
    </>
  ),
  // 相簿：三塊重疊的半透明色塊
  photos: (
    <>
      <rect x="12" y="12" width="21" height="21" rx="6.5" fill="#35c4f4" />
      <rect x="20" y="19.5" width="21" height="21" rx="6.5" fill="#ffd43b" fillOpacity="0.9" />
      <rect x="27" y="27" width="21" height="21" rx="6.5" fill="#ff5c8d" fillOpacity="0.88" />
    </>
  ),
  // 電話：實心話筒
  phone: (
    <path
      transform="translate(0.5 0) scale(2.45)"
      d="M7.2 4h2.600l1.400 3.800-1.900 1.400a11 11 0 0 0 5.500 5.500l1.400-1.900 3.800 1.400v2.600a2 2 0 0 1-2.200 2A15.500 15.500 0 0 1 5.200 6.200a2 2 0 0 1 2-2.200z"
      fill="#fff"
    />
  ),
  // 聊聊：胖胖的實心對話框
  chat: (
    <>
      <ellipse cx="30" cy="27.5" rx="17.5" ry="13.5" fill="#fff3df" />
      <path d="M19.5 35.500 16 46.500l12.500-7z" fill="#fff3df" />
    </>
  ),
  // 天氣：一朵實心的雲
  weather: (
    <g fill="#fff">
      <circle cx="22.5" cy="34.5" r="7.5" />
      <circle cx="32" cy="28.5" r="10.5" />
      <circle cx="41" cy="35" r="7" />
      <rect x="22.5" y="34" width="18.5" height="8" />
    </g>
  ),
  // 找裝置：雷達同心圓
  finder: (
    <>
      <g fill="none" stroke="#86e04f" strokeWidth="2.6">
        <circle cx="30" cy="30" r="17" />
        <circle cx="30" cy="30" r="10.5" />
      </g>
      <path d="M30 30 42 18" stroke="#86e04f" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="30" cy="30" r="3.6" fill="#86e04f" />
    </>
  ),
  // 音樂：一道聲波
  music: (
    <path
      d="M10.5 32c3.200 0 4-11.500 7.800-11.500 4.200 0 4.600 21 9 21 4.200 0 5-17 8.800-17 3.300 0 3.600 9 6.800 9 2.300 0 3.200-3 6.600-3"
      fill="none"
      stroke="#ff2e7e"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // 相機：深色機身
  camera: (
    <>
      <rect x="22" y="15.5" width="13" height="8" rx="2.5" fill="#2b2b30" />
      <rect x="11.5" y="20" width="37" height="24.5" rx="5.5" fill="#2b2b30" />
      <circle cx="30" cy="32.5" r="8" fill="#f1ede4" />
      <circle cx="30" cy="32.5" r="4.6" fill="#2b2b30" />
      <circle cx="42.5" cy="25.5" r="1.8" fill="#f0a23a" />
    </>
  ),
  // Suru：細線菱形，中間一點
  suru: (
    <>
      <path d="M30 12.5 47.500 30 30 47.500 12.500 30z" fill="none" stroke="#f0b54a" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="30" cy="30" r="3" fill="#f0b54a" />
    </>
  ),
  // 工具：四格
  tools: (
    <g fill="#fff" fillOpacity="0.9">
      <rect x="14" y="14" width="14" height="14" rx="4" />
      <rect x="32" y="14" width="14" height="14" rx="4" />
      <rect x="14" y="32" width="14" height="14" rx="4" />
      <rect x="32" y="32" width="14" height="14" rx="4" />
    </g>
  ),
};

// 有圖檔的圖示用圖檔（src/ui/assets/icons/<id>.png，已去背、自帶圓角），沒有的退回上面手畫的版本。
const IMAGES = import.meta.glob<string>('../assets/icons/*.png', { eager: true, import: 'default' });
const imageOf = (icon: IconId): string | undefined => IMAGES[`../assets/icons/${icon}.png`];

export function AppIcon({ icon, size = 'md' }: { icon: IconId; size?: 'sm' | 'md' }) {
  const src = imageOf(icon);
  if (src) {
    return (
      <span className={`app-icon app-icon--img app-icon--${size}`}>
        <img src={src} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span className={`app-icon app-icon--${icon} app-icon--${size}`}>
      <svg viewBox="0 0 60 60" aria-hidden="true">{ART[icon] ?? ART.tools}</svg>
    </span>
  );
}

export function WifiGlyph() {
  return (
    <svg viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 4.200a9.500 9.500 0 0 1 13 0M3.800 6.700a6.200 6.200 0 0 1 8.400 0M6.100 9.100a2.900 2.900 0 0 1 3.800 0" />
    </svg>
  );
}

export function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 5.500L8 12l6.500 6.500" />
    </svg>
  );
}
