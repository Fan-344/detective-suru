import { useEffect, useRef, useState, type RefObject } from 'react';
import { playSound } from '../sound';
import { Avatar } from '../layouts/Chat';
import { S } from '../strings';
import { SuruHeader, SuruMark } from '../suru/Suru';
import { useBringIntoView } from './paced';

interface Props {
  title: string;
  text: string[];
  /** 內文裡出現的人：名字對到頭像。寫成「名字：「一句」」的段落會排成那個人傳的訊息 */
  speakers?: Record<string, string>;
  /** 結局內文最後多放一行小字（例如第幾次指認、剩多少電） */
  note?: string;
  /** 回到指認之前。規則有提供才給，沒給就不顯示那顆按鈕 */
  onRetry?(): void;
  onRestart(): void;
  /**
   * 內文裡「螢幕暗下」的那一段（原文）。出現到這一段時播關機音，四周壓上暗角、整個畫面褪成黑白，
   * 之後一直維持這樣（手機沒電了）
   */
  screenOff?: string;
  /** 開發工具：這個數字一變，剩下的段落立刻全部出現。正式版不給 */
  devSkip?: number;
  /** 開發工具直接跳進來的結局：上方標一行小字，提醒狀態是假的 */
  devBadge?: string;
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 一段是不是對話：整段要是「名字：「一句」「又一句」」，名字是「你」（Suru 自己傳出去的）或認得的人。
 * 冒號是全形、段末沒有句號。敘述裡夾著引號的句子不算，照敘述顯示。
 */
export function parseSaid(line: string, names: string[]): { who: string; mine: boolean; says: string[] } | null {
  const pattern = new RegExp('^(' + [S.endingSelf, ...names].map(escape).join('|') + ')：((?:「[^」]*」)+)$');
  const m = pattern.exec(line);
  if (!m) return null;
  return { who: m[1], mine: m[1] === S.endingSelf, says: [...m[2].matchAll(/「([^」]*)」/g)].map((x) => x[1]) };
}

/**
 * 結局的內文：一般的段落是旁白；整段是對話的，排成聊天的泡泡（一組引號一個泡泡、不顯示引號）。
 * 「你」是 Suru 傳出去的，靠右、用自己這一方的顏色、不標名字；別人靠左，名字和頭像在這一段只標一次。
 * 跟開場一樣一段一段出現：最新的一段最亮，講過的退到後面。
 */
function Story({ lines, speakers, current }: { lines: string[]; speakers: Record<string, string>; current: RefObject<HTMLDivElement | null> }) {
  const names = Object.keys(speakers);
  return (
    <>
      {lines.map((line, i) => {
        const now = i === lines.length - 1;
        const said = parseSaid(line, names);
        const cls = 'intro__seg ending__seg' + (said ? ' ending__seg--chat' : '') + (now ? ' intro__seg--now' : '');
        if (!said) {
          return (
            <div key={i} ref={now ? current : undefined} className={cls}>
              <p>{line}</p>
            </div>
          );
        }
        return (
          <div key={i} ref={now ? current : undefined} className={cls}>
            <div className={'endchat' + (said.mine ? ' endchat--mine' : '')}>
              {!said.mine && (
                <span className="endchat__avatar">
                  <Avatar name={said.who} avatar={speakers[said.who]} />
                </span>
              )}
              <span className="endchat__main">
                {!said.mine && <span className="endchat__name">{said.who}</span>}
                {said.says.map((t, j) => (
                  <span key={j} className="endchat__bubble">{t}</span>
                ))}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 結局：Suru 那一層的畫面，跟開場同一套演出。標題和內文都來自資料檔。
 * 新的一段出現在畫面中間，舊的往上退、變淡；一律點一下才換下一段，不會自己往下跑。
 * 全部出完之後：
 * - 回到指認之前（經過指認進入的結局才有，由規則決定）
 * - 重新開始
 * 沒電、被查到的結局只有重新開始。
 */
export function Ending({ title, text, note, speakers = {}, onRetry, onRestart, screenOff, devBadge, devSkip }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(1);
  const done = shown >= text.length;
  const offAt = screenOff === undefined ? -1 : text.indexOf(screenOff);
  // 出現到「螢幕暗下」那一段：從此維持暗角加黑白，不再亮回來
  const off = offAt >= 0 && shown > offAt;
  const played = useRef(false);
  useEffect(() => {
    if (!off || played.current) return;
    played.current = true;
    playSound('power_off');
  }, [off]);
  // 開發工具的快轉
  const skipSeen = useRef(devSkip);
  useEffect(() => {
    if (devSkip === skipSeen.current) return;
    skipSeen.current = devSkip;
    setShown(text.length);
  }, [devSkip, text.length]);
  // 最新的一段停在畫面正中間
  useBringIntoView(scroller, current, shown, 0.5, 'center');

  const next = () => {
    if (!done) setShown((n) => Math.min(text.length, n + 1));
  };

  return (
    <div className={'suru ending' + (off ? ' ending--off' : '')}>
      <SuruHeader title="SURU" counter={two(shown) + ' / ' + two(text.length)} />
      <div
        className="intro__scroll ending__scroll"
        ref={scroller}
        onClick={next}
        role={done ? undefined : 'button'}
        aria-label={done ? undefined : S.tapToContinue}
      >
        {devBadge && <p className="ending__dev">{devBadge}</p>}
        <h1 className="ending__title">{title}</h1>
        <Story lines={text.slice(0, shown)} speakers={speakers} current={current} />
        {done && note && <p className="ending__note">{note}</p>}
        <div className="ending__end" />
      </div>

      {!done && (
        <div className="intro__hint">
          <SuruMark pulse />
          <span>{S.tapToContinue}</span>
        </div>
      )}
      {done && onRetry && <button className="suru-button" onClick={onRetry}>{S.endingRetry}</button>}
      {done && <button className={onRetry ? 'ending__minor' : 'suru-button'} onClick={onRestart}>{S.endingRestart}</button>}
      {off && <div className="ending__vignette" aria-hidden="true" />}
    </div>
  );
}
