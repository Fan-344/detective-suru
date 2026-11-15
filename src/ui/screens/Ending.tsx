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
 * 有解答篇的結局，看完之後多一步可以接著看事情的全貌；沒有的（指錯人、沒電）就只有結局本身，不講破答案。
 */
export function Ending({ title, text, solution, speakers = {}, onRestart }: Props) {
  const [page, setPage] = useState<'ending' | 'solution'>('ending');
  const scroller = useRef<HTMLDivElement>(null);
  // 換頁之後從頭讀起
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [page]);

  const showing = page === 'solution' && solution ? solution : { title, text };
  return (
    <div className="suru ending">
      <SuruHeader title="SURU" counter={solution ? (page === 'ending' ? '01 / 02' : '02 / 02') : undefined} />
      <div className="ending__scroll" ref={scroller} key={page}>
        <h1 className="ending__title">{showing.title}</h1>
        {page === 'solution' ? <Report lines={showing.text} /> : <Story lines={showing.text} speakers={speakers} />}
      </div>
      {solution && page === 'ending' ? (
        <button className="suru-button" onClick={() => setPage('solution')}>{S.endingSolution.replace('{title}', solution.title)}</button>
      ) : (
        <button className="suru-button" onClick={onRestart}>{S.endingRestart}</button>
      )}
      {solution && (
        <button className="ending__minor" onClick={page === 'ending' ? onRestart : () => setPage('ending')}>
          {page === 'ending' ? S.endingRestart : S.endingBack}
        </button>
      )}
    </div>
  );
}
