import { useEffect, useRef, useState } from 'react';
import type { IconId } from '../types';
import type { ReactNode } from 'react';
import markUrl from '../assets/suru-mark.png';
import { AppIcon } from '../shell/icons';
import { S } from '../strings';

// Suru 這一層的視覺零件：深色底、洋紅到青色的光帶（跟 App 圖示同一套）、無襯線字、對稱版面。
// 用在開場、沒電，以及步驟三的備忘錄、測試面板、挑戰書。
// 這裡只有長相，沒有任何遊戲規則。

/** Suru 的記號：就是 App 圖示上那條光帶，去掉了黑色的底 */
export function SuruMark({ pulse = false }: { pulse?: boolean }) {
  return (
    <span className={'suru-mark' + (pulse ? ' suru-mark--pulse' : '')} aria-hidden="true">
      <img src={markUrl} alt="" draggable={false} />
    </span>
  );
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

/**
 * Suru 的心聲：像手機的系統通知一樣從畫面上方滑下來。不擋操作，點一下或過幾秒就收起。
 * 外觀是她手機那一層的通知卡片，只有圖示是 Suru 的。
 */
interface BannerProps {
  text: string;
  onDismiss(): void;
  /** 新訊息通知才有：App 的名字和圖示、誰傳的 */
  app?: { name: string; icon: IconId; title: string };
  /** 點通知要做的事（例如打開那個聊天室）。沒給的話點一下只是收掉 */
  onOpen?(): void;
}

export function SuruBanner({ text, onDismiss, app, onOpen }: BannerProps) {
  const startY = useRef<number | null>(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
    // 只在這則通知出現時計時一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 往上滑就收掉，跟手機的通知一樣
  const move = (y: number) => {
    if (startY.current === null) return;
    const dy = Math.min(0, y - startY.current);
    setLift(dy);
    if (dy < -36) {
      startY.current = null;
      onDismiss();
    }
  };
  return (
    <button
      className="sysnote"
      style={lift ? { transform: 'translateY(' + lift + 'px)', opacity: 1 + lift / 60 } : undefined}
      onClick={() => {
        if (onOpen) onOpen();
        onDismiss();
      }}
      onPointerDown={(e) => (startY.current = e.clientY)}
      onPointerMove={(e) => move(e.clientY)}
      onPointerUp={() => {
        startY.current = null;
        setLift(0);
      }}
      onPointerCancel={() => {
        startY.current = null;
        setLift(0);
      }}
      aria-label={onOpen ? S.noticeOpen : S.noticeDismiss}
    >
      <AppIcon icon={app?.icon ?? 'suru'} size="sm" />
      <span className="sysnote__main">
        <span className="sysnote__head">
          <span className="sysnote__app">{app?.name ?? 'Suru'}</span>
          <span className="sysnote__when">{S.noticeNow}</span>
        </span>
        {app && <span className="sysnote__title">{app.title}</span>}
        <span className="sysnote__text" role="status">{text}</span>
      </span>
      <span className="sysnote__grab" aria-hidden="true" />
    </button>
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
