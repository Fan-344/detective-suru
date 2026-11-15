import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../shell/icons';
import { S } from '../strings';
import { SuruHeader, SuruMark } from '../suru/Suru';
import type { IconId, IntroSegment } from '../types';

interface Props {
  title: string;
  segments: IntroSegment[];
  onDone(): void;
  /** 通知段落要用哪個 App 的圖示。查不到就不畫圖示 */
  noticeIcon?(label: string): IconId | undefined;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 開場：Suru 這一層的畫面。一段一段宣告，點一下前進；
 * 目前這一段最亮，講過的退到後面。手機上的通知則畫成通知卡片的樣子。文字全部來自資料。
 */
export function Intro({ title, segments, onDone, noticeIcon }: Props) {
  const [shown, setShown] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);

  // 只捲動這個區塊本身，讓最新的一段停在畫面上方三分之一處。
  // 不用 scrollIntoView：它會連外層的頁面一起捲，在電腦上會整個跑掉。
  useEffect(() => {
    const box = scroller.current;
    const el = current.current;
    if (!box || !el) return;
    const top = Math.max(0, el.offsetTop - box.clientHeight * 0.28);
    if (typeof box.scrollTo === 'function') box.scrollTo({ top, behavior: 'smooth' });
    else box.scrollTop = top;
  }, [shown]);

  const advance = () => {
    if (shown >= segments.length) onDone();
    else setShown(shown + 1);
  };

  // 遊戲目標自己佔一頁：前面講過的都收起來，只留目標在畫面中間
  const last = segments[shown - 1];
  if (last?.kind === 'goal') {
    return (
      <button className="suru intro intro--goal" onClick={advance} aria-label={S.tapToContinue}>
        <SuruHeader title={title} counter={two(shown) + ' / ' + two(segments.length)} />
        <div className="goal">
          <span className="goal__label">{S.goalLabel}</span>
          <ol className="goal__lines">
            {last.lines.map((line, j) => (
              <li key={j} style={{ animationDelay: 0.25 + j * 0.45 + 's' }}>
                <span className="goal__no">{two(j + 1)}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="intro__hint">
          <SuruMark pulse />
          <span>{shown >= segments.length ? S.goalStart : S.tapToContinue}</span>
        </div>
      </button>
    );
  }

  // Suru App 的介紹也自己佔一頁：圖示和名字、兩句說明、幾個項目。項目的標籤用跟實際畫面一樣的樣子
  if (last?.kind === 'guide') {
    return (
      <button className="suru intro intro--goal" onClick={advance} aria-label={S.tapToContinue}>
        <SuruHeader title={title} counter={two(shown) + ' / ' + two(segments.length)} />
        <div className="guide">
          <div className="guide__in">
          <div className="guide__head">
            <AppIcon icon="suru" size="sm" />
            <span className="guide__title">{last.title}</span>
          </div>
          <div className="guide__lines">
            {last.lines.map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </div>
          <ul className="guide__items">
            {last.items.map((it, j) => (
              <li key={j} style={{ animationDelay: 0.2 + j * 0.18 + 's' }}>
                <span
                  className={
                    'guide__label' + (it.label === S.concernsLabel ? ' guide__label--concern' : it.label === S.doubtsLabel ? ' guide__label--card' : '')
                  }
                >
                  {it.label}
                </span>
                <span className="guide__text">{it.text}</span>
              </li>
            ))}
          </ul>
          </div>
        </div>
        <div className="intro__hint">
          <SuruMark pulse />
          <span>{S.tapToContinue}</span>
        </div>
      </button>
    );
  }

  return (
    <button className="suru intro" onClick={advance} aria-label={S.tapToContinue}>
      <SuruHeader title={title} counter={two(shown) + ' / ' + two(segments.length)} />
      <div className="intro__scroll" ref={scroller}>
        {segments.slice(0, shown).map((seg, i) => {
          const now = i === shown - 1;
          const cls = 'intro__seg intro__seg--' + seg.kind + (now ? ' intro__seg--now' : '');
          if (seg.kind === 'notice') {
            const icon = noticeIcon?.(seg.label);
            return (
              <div key={i} ref={now ? current : undefined} className={cls}>
                <div className="sysnote sysnote--static">
                  {icon && <AppIcon icon={icon} size="sm" />}
                  <span className="sysnote__main">
                    <span className="sysnote__head">
                      <span className="sysnote__app">{seg.label}</span>
                    </span>
                    {seg.lines.map((line, j) => (
                      <span key={j} className="sysnote__text">{line}</span>
                    ))}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div key={i} ref={now ? current : undefined} className={cls}>
              {seg.lines.map((line, j) => (
                <p key={j}>{line}</p>
              ))}
              {seg.kind === 'quote' && seg.signature && <p className="intro__sign">{seg.signature}</p>}
            </div>
          );
        })}
        <div className="intro__end" />
      </div>
      <div className="intro__hint">
        <SuruMark pulse />
        <span>{S.tapToContinue}</span>
      </div>
    </button>
  );
}
