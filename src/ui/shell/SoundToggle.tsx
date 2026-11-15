import { useEffect, useState } from 'react';
import { isMuted, onMuteChange, setMuted } from '../sound';
import { S } from '../strings';

/** 機身下緣角落的喇叭：開關遊戲音效（震動跟著一起關）。選擇會記住 */
export function SoundToggle() {
  const [muted, setLocal] = useState(isMuted);
  useEffect(() => onMuteChange(() => setLocal(isMuted())), []);
  return (
    <button className={'chin__sound' + (muted ? ' chin__sound--off' : '')} onClick={() => setMuted(!muted)} aria-label={muted ? S.soundOff : S.soundOn} aria-pressed={!muted}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.500L12 5.500v13L7.500 14.500H4z" />
        {muted ? <path d="M16 9.500l5 5M21 9.500l-5 5" /> : <path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11" />}
      </svg>
    </button>
  );
}
