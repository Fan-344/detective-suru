import type { ReactNode } from 'react';

// Suru 這一層的視覺零件：深色底、琥珀色、明體標題、對稱版面。
// 用在開場、沒電，以及步驟三的備忘錄、測試面板、挑戰書。
// 這裡只有長相，沒有任何遊戲規則。

/** Suru 的記號：一個轉了 45 度的小方框 */
export function SuruMark({ pulse = false }: { pulse?: boolean }) {
  return <span className={`suru-mark ${pulse ? 'suru-mark--pulse' : ''}`} aria-hidden="true" />;
}

/** 頂端的抬頭：左右細線夾著字距拉開的標題，右側可放編號 */
export function SuruHeader({ title, counter }: { title: string; counter?: string }) {
  return (
    <div className="suru-head">
      <SuruMark />
      <span className="suru-head__title">{title}</span>
      <span className="suru-head__rule" />
      {counter && <span className="suru-head__counter">{counter}</span>}
    </div>
  );
}

// 四個人物各一個記號和顏色，只在 Suru 這一層出現，她的聊天室裡不會有。
// 記號是自己畫的四種形狀：菱形、十字、半月、三橫。
const MARKS: ReactNode[] = [
  <path key="0" d="M12 3.5 20.5 12 12 20.5 3.5 12z" />,
  <path key="1" d="M12 4v16M4 12h16" />,
  <path key="2" d="M15.5 4.500a8 8 0 1 0 0 15 9.500 9.500 0 0 1 0-15z" />,
  <path key="3" d="M5 7.500h14M5 12h14M5 16.500h14" />,
];

export function SuruToken({ mark, name, active = false }: { mark: number; name: string; active?: boolean }) {
  const index = ((mark % 4) + 4) % 4;
  return (
    <span className={`suru-token suru-token--m${index} ${active ? 'suru-token--active' : ''}`}>
      <span className="suru-token__disc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {MARKS[index]}
        </svg>
      </span>
      <span className="suru-token__name">{name}</span>
    </span>
  );
}

interface CardProps {
  no: number;
  title: string;
  note?: string;
  faceDown?: boolean;
  selected?: boolean;
  onClick?(): void;
}

/** 測試牌：有編號、有正反面 */
export function SuruCard({ no, title, note, faceDown = false, selected = false, onClick }: CardProps) {
  const label = String(no).padStart(2, '0');
  return (
    <button
      className={`suru-card ${faceDown ? 'suru-card--down' : ''} ${selected ? 'suru-card--selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={faceDown ? label : `${label} ${title}`}
    >
      {faceDown ? (
        <span className="suru-card__back"><SuruMark /></span>
      ) : (
        <span className="suru-card__face">
          <span className="suru-card__no">{label}</span>
          <span className="suru-card__title">{title}</span>
          {note && <span className="suru-card__note">{note}</span>}
          <span className="suru-card__no suru-card__no--flip">{label}</span>
        </span>
      )}
    </button>
  );
}
