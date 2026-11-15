import { useEffect, useRef, useState } from 'react';
import { S } from '../strings';
import type { CalendarData, ClockData, MusicTrack, PhonePrefs } from '../types';
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

function Stopwatch() {
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

const two = (n: number) => String(n).padStart(2, '0');

function WorldClock({ clock }: { clock: ClockData }) {
  // 從資料給的起始時刻開始，照真實經過的秒數往前走
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const baseSeconds = clock.startMinutes * 60 + seconds;
  return (
    <ul className="world">
      {clock.cities.map((city, i) => {
        const total = baseSeconds + city.offsetMinutes * 60;
        const day = Math.floor(total / 86400);
        const inDay = ((total % 86400) + 86400) % 86400;
        const label = day < 0 ? S.clockYesterday : day > 0 ? S.clockTomorrow : S.clockToday;
        return (
          <li key={city.name}>
            <span className="world__city">
              <span className="world__day">{label}</span>
              {city.name}
            </span>
            <span className="world__time" data-testid={i === 0 ? 'world-time' : undefined}>
              {two(Math.floor(inDay / 3600))}:{two(Math.floor(inDay / 60) % 60)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Alarms({ clock }: { clock: ClockData }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(clock.alarms.map((a) => [a.id, a.on])));
  return (
    <ul className="world">
      {clock.alarms.map((a) => (
        <li key={a.id} className={on[a.id] ? '' : 'world__off'}>
          <span className="world__city">
            <span className="world__time">{a.time}</span>
            <span className="world__day">{a.label}</span>
          </span>
          <Switch on={!!on[a.id]} label={`${a.time} ${a.label}`} onToggle={() => setOn({ ...on, [a.id]: !on[a.id] })} />
        </li>
      ))}
    </ul>
  );
}

type ClockTab = 'world' | 'alarm' | 'watch';

/** 時鐘：世界時鐘、鬧鐘、碼錶三個分頁 */
export function Clock({ clock }: { clock: ClockData }) {
  const [tab, setTab] = useState<ClockTab>('world');
  const tabs: { id: ClockTab; label: string }[] = [
    { id: 'world', label: S.clockWorld },
    { id: 'alarm', label: S.clockAlarm },
    { id: 'watch', label: S.clockWatch },
  ];
  return (
    <div className="clock">
      <div className="clock__body">
        {tab === 'world' && <WorldClock clock={clock} />}
        {tab === 'alarm' && <Alarms clock={clock} />}
        {tab === 'watch' && <Stopwatch />}
      </div>
      <div className="clock__tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const isoDate = (year: number, month: number, day: number) => `${year}-${two(month)}-${two(day)}`;

/** 行事曆：翻月份、標出今天、有行程的日子有一個點，點日期看當天的行程 */
export function Calendar({ data }: { data: CalendarData }) {
  const [ty, tm] = data.today.split('-').map(Number);
  const [ym, setYm] = useState({ year: ty, month: tm });
  const [picked, setPicked] = useState(data.today);
  const cells = monthCells(ym.year, ym.month);
  const busy = new Set(data.events.map((e) => e.date));
  const dayEvents = data.events
    .filter((e) => e.date === picked)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
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
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const iso = isoDate(ym.year, ym.month, d);
          const cls = ['cal__day', iso === data.today ? 'cal__day--today' : '', iso === picked ? 'cal__day--picked' : ''].join(' ');
          return (
            <button key={i} className={cls} onClick={() => setPicked(iso)} aria-pressed={iso === picked} aria-label={iso}>
              <span>{d}</span>
              {busy.has(iso) && <i />}
            </button>
          );
        })}
      </div>
      {dayEvents.length === 0 ? (
        <p className="cal__empty">{S.calEmpty}</p>
      ) : (
        <ul className="cal__events">
          {dayEvents.map((e) => (
            <li key={e.id}>
              <span className="cal__when">{e.time ?? S.calAllDay}</span>
              <span>{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SettingsProps {
  wifiName: string;
  battery: number;
  prefs: PhonePrefs;
  onChange(prefs: PhonePrefs): void;
  /** 清掉進度從頭開始。沒給就不顯示這一項 */
  onRestart?(): void;
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle(): void }) {
  return (
    <button className={`switch ${on ? 'switch--on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <span />
    </button>
  );
}

export function Settings({ wifiName, battery, prefs, onChange, onRestart }: SettingsProps) {
  // 重新開始要按兩次：先問一次，免得手滑把進度清掉
  const [asking, setAsking] = useState(false);
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
      {onRestart && <h2 className="list__label">{S.setGame}</h2>}
      {onRestart && (
        <div className="restart">
          {asking ? (
            <>
              <p className="restart__ask">{S.setRestartAsk}</p>
              <button className="restart__btn restart__btn--danger" onClick={onRestart}>{S.setRestartYes}</button>
              <button className="restart__btn" onClick={() => setAsking(false)}>{S.setRestartNo}</button>
            </>
          ) : (
            <button className="restart__btn restart__btn--danger" onClick={() => setAsking(true)}>{S.setRestart}</button>
          )}
        </div>
      )}
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
        <button onClick={() => go(-1)} aria-label={S.musicPrev}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M6 5h2.400v14H6zM20 5.600v12.800c0 .5-.6.8-1 .5L9.800 12.500a.6.6 0 0 1 0-1L19 5.100c.4-.3 1 0 1 .5z" /></svg>
        </button>
        <button className="music__play" onClick={() => setPlaying(!playing)} aria-label={playing ? S.musicPause : S.musicPlay}>
          {playing ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.300v13.400c0 .6.600.900 1.100.6l10.300-6.700a.7.7 0 0 0 0-1.200L9.100 4.700C8.600 4.400 8 4.700 8 5.300z" /></svg>
          )}
        </button>
        <button onClick={() => go(1)} aria-label={S.musicNext}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M15.600 5H18v14h-2.400zM4 5.600v12.800c0 .5.600.8 1 .5l9.200-6.400a.6.6 0 0 0 0-1L5 5.100c-.4-.3-1 0-1 .5z" /></svg>
        </button>
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
