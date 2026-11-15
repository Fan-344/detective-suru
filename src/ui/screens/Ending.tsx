import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../layouts/Chat';
import { S } from '../strings';
import { SuruHeader } from '../suru/Suru';

interface Props {
  title: string;
  text: string[];
  /** 解答篇：只有指對兇手的結局才會給。看完結局之後可以接著看 */
  solution?: { title: string; text: string[] };
  /** 內文裡出現的人：名字對到頭像。寫成「名字：「一句」」的段落會排成那個人傳的訊息 */
  speakers?: Record<string, string>;
  /** 結局內文最後多放一行小字（例如第幾次指認、剩多少電） */
  note?: string;
  /** 回到指認之前。規則有提供才給，沒給就不顯示那顆按鈕 */
  onRetry?(): void;
  onRestart(): void;
}

/**
 * 結局的內文：一般的段落是旁白；寫成「名字：「一句」「又一句」」的段落是某個人在聊天室裡說的話，
 * 排成訊息的樣子（頭像、名字、一對引號一則泡泡）。同一個人連著說，名字和頭像只出現一次。
 */
function Story({ lines, speakers }: { lines: string[]; speakers: Record<string, string> }) {
  const parsed = lines.map((line) => {
    const m = /^([^：「」]{1,8})：((?:「[^」]*」\s*)+)$/.exec(line.trim());
    // 冒號前面要是認得的人名才算對話；「她又傳來一則：「…」」這種是旁白
    return m && speakers[m[1]] ? { who: m[1], says: [...m[2].matchAll(/「([^」]*)」/g)].map((x) => x[1]) } : null;
  });
  return (
    <>
      {lines.map((line, i) => {
        const said = parsed[i];
        if (!said) return <p key={i}>{line}</p>;
        const first = parsed[i - 1]?.who !== said.who;
        const last = parsed[i + 1]?.who !== said.who;
        return (
          <div key={i} className={'endchat' + (first ? ' endchat--first' : '') + (last ? ' endchat--last' : '')}>
            <span className="endchat__avatar">{first && <Avatar name={said.who} avatar={speakers[said.who]} />}</span>
            <span className="endchat__main">
              {first && <span className="endchat__name">{said.who}</span>}
              {said.says.map((t, j) => (
                <span key={j} className="endchat__bubble">{t}</span>
              ))}
            </span>
          </div>
        );
      })}
    </>
  );
}

/**
 * 解答篇排成一份報告：開頭「名稱：內容」的幾行是表頭，
 * 之後每一行開頭【】裡的字是欄位名稱，後面是內容。不是這兩種寫法的行就照一般段落放。
 */
function Report({ lines }: { lines: string[] }) {
  const firstField = lines.findIndex((l) => /^【.+?】/.test(l));
  const headCount = firstField < 0 ? 0 : firstField;
  const head = lines.slice(0, headCount).map((l) => /^([^：:]{1,8})[：:]\s*(.+)$/.exec(l));
  return (
    <div className="report">
      {head.some(Boolean) && (
        <dl className="report__head">
          {lines.slice(0, headCount).map((l, i) =>
            head[i] ? (
              <div key={i}>
                <dt>{head[i]![1]}</dt>
                <dd>{head[i]![2]}</dd>
              </div>
            ) : (
              <p key={i}>{l}</p>
            ),
          )}
        </dl>
      )}
      {lines.slice(headCount).map((l, i) => {
        const m = /^【(.+?)】\s*(.*)$/.exec(l);
        return m ? (
          <section key={i} className="report__row">
            <h2>{m[1]}</h2>
            <p>{m[2]}</p>
          </section>
        ) : (
          <p key={i} className="report__plain">{l}</p>
        );
      })}
    </div>
  );
}

/**
 * 結局：Suru 那一層的畫面。標題和內文都來自資料檔。
 * 看完結局之後：
 * - 回到指認之前（經過指認進入的結局才有，由規則決定）
 * - 重新開始
 * 資料有解答篇時，破案的結局可以多看一頁。沒電、被查到的結局只有重新開始。
 */
export function Ending({ title, text, solution, note, speakers = {}, onRetry, onRestart }: Props) {
  const [page, setPage] = useState<'ending' | 'solution'>('ending');
  const scroller = useRef<HTMLDivElement>(null);
  // 換頁之後從頭讀起
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [page]);

  const onSolution = page === 'solution' && !!solution;
  return (
    <div className="suru ending">
      <SuruHeader title="SURU" counter={solution ? (onSolution ? '02 / 02' : '01 / 02') : undefined} />
      <div className="ending__scroll" ref={scroller} key={page}>
        <h1 className="ending__title">{onSolution && solution ? solution.title : title}</h1>
        {onSolution && solution ? (
          <Report lines={solution.text} />
        ) : (
          <>
            <Story lines={text} speakers={speakers} />
            {note && <p className="ending__note">{note}</p>}
          </>
        )}
      </div>

      {onRetry && <button className="suru-button" onClick={onRetry}>{S.endingRetry}</button>}
      {solution && (
        <button className={onRetry ? 'ending__minor' : 'suru-button'} onClick={() => setPage(onSolution ? 'ending' : 'solution')}>
          {onSolution ? S.endingBack : S.endingSolution.replace('{title}', solution.title)}
        </button>
      )}
      <button className={onRetry || solution ? 'ending__minor' : 'suru-button'} onClick={onRestart}>{S.endingRestart}</button>
    </div>
  );
}
