import { useEffect, useRef } from 'react';
import { Avatar } from '../layouts/Chat';
import { S } from '../strings';
import type { IncomingCall } from '../types';

/** 沒人按的話響多久算「響完」（毫秒）。只是呈現的節奏，規則不管時間 */
export const RING_MS = 9000;

interface Props {
  call: IncomingCall;
  onDecline(): void;
  /** 放著響完，變成未接來電 */
  onRing(): void;
}

/**
 * 來電：蓋住整個手機畫面，底下什麼都不能按。
 * Suru 發不出聲音，所以沒有接聽，只能掛斷，或放著讓它響完。
 * 掛斷和響完各扣多少電由遊戲規則決定，這裡只把數字寫出來。
 */
export function CallScreen({ call, onDecline, onRing }: Props) {
  const ring = useRef(onRing);
  ring.current = onRing;
  useEffect(() => {
    const timer = window.setTimeout(() => ring.current(), RING_MS);
    return () => window.clearTimeout(timer);
  }, [call.id]);

  return (
    <div className="call" role="alertdialog" aria-label={S.callIncoming + '：' + call.name}>
      <div className="call__top">
        <span className="call__label">{S.callIncoming}</span>
        <span className="call__name">{call.name}</span>
      </div>
      <div className="call__who">
        <span className="call__ring" aria-hidden="true" />
        <span className="call__ring call__ring--late" aria-hidden="true" />
        <Avatar name={call.name} avatar={call.avatar} />
      </div>
      <p className="call__mute">{S.callMute}</p>
      {/* 響鈴剩多久：這條走完就變成未接來電 */}
      <div className="call__left" aria-hidden="true">
        <span style={{ animationDuration: RING_MS + 'ms' }} />
      </div>
      <p className="call__cost">{S.callRingCost.replace('{cost}', String(call.ringCost))}</p>
      <button className="call__decline" onClick={onDecline} aria-label={S.callDecline}>
        <span className="call__decline-btn" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path
              d="M3.2 14.6c4.9-4.6 12.7-4.6 17.6 0 .5.5.5 1.2.1 1.7l-1.5 1.9c-.4.5-1 .6-1.5.4l-2.7-1.1c-.5-.2-.8-.7-.8-1.2v-1.6a9 9 0 0 0-4.800 0v1.600c0 .5-.3 1-.8 1.200l-2.700 1.100c-.5.2-1.100.1-1.500-.4l-1.500-1.900c-.4-.5-.4-1.200.1-1.700z"
              fill="#fff"
            />
          </svg>
        </span>
        <span className="call__decline-label">{S.callDecline}</span>
        <span className="call__decline-cost">{S.callDeclineCost.replace('{cost}', String(call.declineCost))}</span>
      </button>
    </div>
  );
}
