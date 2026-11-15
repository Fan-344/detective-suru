import { S } from '../strings';
import type { SystemPrompt } from '../types';

interface Props {
  prompt: SystemPrompt;
  /** 按了某一顆按鈕；null 是不處理、把視窗關掉 */
  onAnswer(option: string | null): void;
}

/**
 * 示意地圖：自己畫的幾條路、一塊綠地、一條水，中間一圈「大概在這附近」。
 * 不是真的地圖，也不對應任何真實街道；地點的名字由資料給，寫在圖的下緣。
 */
function AreaMap({ label }: { label: string }) {
  return (
    <div className="sysprompt__map" role="img" aria-label={label}>
      <svg viewBox="0 0 280 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="280" height="120" fill="#e6e9ee" />
        <path d="M-10 96 C 50 84, 90 112, 150 100 S 250 78, 300 92 L300 130 L-10 130 Z" fill="#bcd8ee" />
        <rect x="176" y="14" width="64" height="38" rx="6" fill="#cfe6cf" transform="rotate(-8 208 33)" />
        <g stroke="#fff" strokeLinecap="round" fill="none">
          <path d="M-10 40 L300 22" strokeWidth="7" />
          <path d="M-10 74 L300 58" strokeWidth="5" />
          <path d="M40 -10 L64 130" strokeWidth="5" />
          <path d="M112 -10 L130 130" strokeWidth="7" />
          <path d="M196 -10 L214 130" strokeWidth="4" />
          <path d="M252 -10 L262 130" strokeWidth="4" />
          <path d="M70 52 L122 48" strokeWidth="3" />
          <path d="M146 86 L210 80" strokeWidth="3" />
        </g>
        <circle cx="128" cy="52" r="34" fill="rgba(74, 126, 255, 0.18)" stroke="rgba(74, 126, 255, 0.55)" strokeWidth="1.5" />
        <circle cx="128" cy="52" r="6" fill="#4a7eff" stroke="#fff" strokeWidth="2.5" />
      </svg>
      <span className="sysprompt__place">{label}</span>
    </div>
  );
}

/**
 * 系統視窗：手機自己跳出來的確認框（例如「登入確認」），蓋在所有畫面上面，要先處理才能做別的事。
 * 標題、內文、每一顆按鈕的字都來自資料；按了會發生什麼由遊戲規則決定。
 * 有的按鈕按了不會關（規則只回一句提醒），所以這裡不自己關，等規則說沒有視窗了才消失。
 * 點視窗外面變暗的地方，等於不處理、把它關掉。
 */
export function PromptDialog({ prompt, onAnswer }: Props) {
  return (
    <div className="sysprompt" role="alertdialog" aria-label={prompt.title}>
      <button className="sysprompt__away" onClick={() => onAnswer(null)} aria-label={S.promptLater} />
      <div className="sysprompt__card">
        <h2 className="sysprompt__title">{prompt.title}</h2>
        <div className="sysprompt__body">
          {prompt.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {prompt.map && <AreaMap label={prompt.map} />}
        <div className="sysprompt__actions">
          {prompt.options.map((o) => (
            <button key={o.id} onClick={() => onAnswer(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
