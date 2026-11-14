import { useEffect, useRef, useState } from 'react';
import { S } from '../strings';
import type { MusicTrack, PhonePrefs } from '../types';
import { CALC_START, calcPress, formatElapsed, formatTrackTime, monthCells, stepMonth } from './calc';

// 跟案情無關的背景 App。它們真的能用，讓這支手機像一支有人在用的手機。
// 這裡沒有任何線索，也沒有遊戲規則。

const CALC_KEYS = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];

export function Calculator() {
  const [state, setState] = useState(CALC_START);
  return (
    <div className="calc">
      <div className="calc__display" data-testid="calc-display">{state.display}</div>
      <div className="calc__keys">
        {CALC_KEYS.map((key) => {
          const kind = /[0-9.]/.test(key) ? 'num' : ['÷', '×', '-', '+', '='].includes(key) ? 'op' : 'fn';
          const active = kind === 'op' && state.op === key && state.fresh;
          return (
            <button
              key={key}
              className={`calc__key calc__key--${kind} ${key === '0' ? 'calc__key--wide' : ''} ${active ? 'calc__key--on' : ''}`}
              onClick={() => setState((s) => calcPress(s, key))}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 時鐘：遊戲裡沒有時間，所以只有碼錶 */
export function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const base = useRef(0);

  useEffect(() => {
    if (!running) return;
    const startedAt = performance.now() - base.current;
    const timer = window.setInterval(() => {
      base.current = performance.now() - startedAt;
      setElapsed(base.current);
    }, 31);
    return () => window.clearInterval(timer);
  }, [running]);

  const reset = () => {
    base.current = 0;
    setElapsed(0);
    setLaps([]);
  };

  return (
    <div className="watch">
      <div className="watch__time" data-testid="watch-time">{formatElapsed(elapsed)}</div>
      <div className="watch__buttons">
        <button className="watch__btn" onClick={running ? () => setLaps((l) => [elapsed, ...l]) : reset} disabled={!running && elapsed === 0}>
          {running ? S.watchLap : S.watchReset}
        </button>
        <button className={`watch__btn ${running ? 'watch__btn--stop' : 'watch__btn--go'}`} onClick={() => setRunning(!running)}>
          {running ? S.watchStop : S.watchStart}
        </button>
      </div>
      <ol className="watch__laps">
        {laps.map((lap, i) => (
          <li key={laps.length - i}>
            <span>{S.watchLap} {laps.length - i}</span>
            <span>{formatElapsed(lap)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Calendar({ start }: { start: { year: number; month: number } }) {
  const [ym, setYm] = useState(start);
  const cells = monthCells(ym.year, ym.month);
  return (
    <div className="cal">
      <div className="cal__head">
        <button onClick={() => setYm(stepMonth(ym.year, ym.month, -1))} aria-label={S.calPrev}>‹</button>
        <h2>{ym.year} 年 {ym.month} 月</h2>
        <button onClick={() => setYm(stepMonth(ym.year, ym.month, 1))} aria-label={S.calNext}>›</button>
      </div>
      <div className="cal__grid cal__grid--week">
        {S.calWeek.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal__grid">
        {cells.map((d, i) => (
          <span key={i} className={d ? 'cal__day' : ''}>{d ?? ''}</span>
        ))}
      </div>
      <p className="cal__empty">{S.calEmpty}</p>
    </div>
  );
}

interface SettingsProps {
  wifiName: string;
  battery: number;
  prefs: PhonePrefs;
  onChange(prefs: PhonePrefs): void;
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle(): void }) {
  return (
    <button className={`switch ${on ? 'switch--on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <span />
    </button>
  );
}

export function Settings({ wifiName, battery, prefs, onChange }: SettingsProps) {
  return (
    <div className="list">
      <h2 className="list__label">{S.setConnection}</h2>
      <dl className="detail__fields setgroup">
        <div className="detail__field"><dt>Wi-Fi</dt><dd>{wifiName}</dd></div>
        <div className="detail__field"><dt>{S.battery}</dt><dd>{battery}%</dd></div>
      </dl>
      <h2 className="list__label">{S.setDisplay}</h2>
      <dl className="detail__fields setgroup">
        <div className="detail__field">
          <dt>{S.setShowPercent}</dt>
          <dd><Switch on={prefs.showPercent} label={S.setShowPercent} onToggle={() => onChange({ ...prefs, showPercent: !prefs.showPercent })} /></dd>
        </div>
        <div className="detail__field">
          <dt>{S.setReduceMotion}</dt>
          <dd><Switch on={prefs.reduceMotion} label={S.setReduceMotion} onToggle={() => onChange({ ...prefs, reduceMotion: !prefs.reduceMotion })} /></dd>
        </div>
      </dl>
    </div>
  );
}

/** 相機：手機放在維修店的架子上，鏡頭前是黑的 */
export function Camera() {
  const [flash, setFlash] = useState(0);
  return (
    <div className="cam">
      <div className="cam__view">{flash > 0 && <span key={flash} className="cam__flash" />}</div>
      <div className="cam__bar">
        <button className="cam__shutter" aria-label={S.camShutter} onClick={() => setFlash((n) => n + 1)}><span /></button>
      </div>
    </div>
  );
}

export function Music({ tracks }: { tracks: MusicTrack[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const track = tracks[index];

  useEffect(() => {
    if (!playing || !track) return;
    const timer = window.setInterval(() => setPos((p) => p + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, track]);

  useEffect(() => {
    if (track && pos >= track.seconds) {
      setPos(0);
      setIndex((i) => (i + 1) % tracks.length);
    }
  }, [pos, track, tracks.length]);

  if (!track) return <div className="empty">{S.emptyList}</div>;
  const go = (delta: number) => {
    setPos(0);
    setIndex((index + delta + tracks.length) % tracks.length);
  };

  return (
    <div className="music">
      <div className={`music__cover img--tone${track.tone % 6}`} />
      <div className="music__title">{track.title}</div>
      <div className="music__artist">{track.artist}</div>
      <div className="music__bar"><span style={{ width: `${(pos / track.seconds) * 100}%` }} /></div>
      <div className="music__times"><span>{formatTrackTime(pos)}</span><span>{formatTrackTime(track.seconds)}</span></div>
      <div className="music__controls">
        <button onClick={() => go(-1)} aria-label={S.musicPrev}>⏮</button>
        <button className="music__play" onClick={() => setPlaying(!playing)} aria-label={playing ? S.musicPause : S.musicPlay}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => go(1)} aria-label={S.musicNext}>⏭</button>
      </div>
      <ul className="rows rows--card music__list">
        {tracks.map((t, i) => (
          <li key={t.title}>
            <button className="row" onClick={() => { setIndex(i); setPos(0); setPlaying(true); }}>
              <span className={`row__dot ${i === index ? 'row__dot--on' : ''}`} />
              <span className="row__main"><span className="row__title">{t.title}</span><span className="row__sub">{t.artist}</span></span>
              <span className="row__meta">{formatTrackTime(t.seconds)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
