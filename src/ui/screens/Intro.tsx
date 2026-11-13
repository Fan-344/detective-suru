import { useEffect, useRef, useState } from 'react';
import { S } from '../strings';
import { SuruHeader, SuruMark } from '../suru/Suru';
import type { IntroSegment } from '../types';

interface Props {
  title: string;
  segments: IntroSegment[];
  onDone(): void;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 開場：Suru 這一層的畫面。一段一段宣告，點一下前進；
 * 目前這一段最亮，講過的退到後面。文字全部來自資料。
 */
export function Intro({ title, segments, onDone }: Props) {
  const [shown, setShown] = useState(1);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [shown]);

  const advance = () => {
    if (shown >= segments.length) onDone();
    else setShown(shown + 1);
  };

  return (
    <button className="suru intro" onClick={advance} aria-label={S.tapToContinue}>
      <SuruHeader title={title} counter={`${two(shown)} / ${two(segments.length)}`} />
      <div className="intro__scroll">
        {segments.slice(0, shown).map((seg, i) => (
          <div key={i} className={`intro__seg intro__seg--${seg.kind} ${i === shown - 1 ? 'intro__seg--now' : ''}`}>
            {seg.kind === 'notice' && <div className="suru-label">{seg.label}</div>}
            {seg.lines.map((line, j) => (
              <p key={j}>{line}</p>
            ))}
            {seg.kind === 'quote' && seg.signature && <p className="intro__sign">{seg.signature}</p>}
          </div>
        ))}
        <div ref={end} className="intro__end" />
      </div>
      <div className="intro__hint">
        <SuruMark pulse />
        <span>{S.tapToContinue}</span>
      </div>
    </button>
  );
}
