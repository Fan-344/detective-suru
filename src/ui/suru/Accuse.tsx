import { useState } from 'react';
import { S } from '../strings';
import type { AccuseAnswer, AccuseData, SuruMemoItem } from '../types';
import { SuruHeader, SuruToken } from './Suru';

interface Props {
  title: string;
  data: AccuseData;
  records: SuruMemoItem[];
  onBack(): void;
  onSubmit(answer: AccuseAnswer): void;
}

/**
 * 指認兇手：先看幾行說明，選是誰、每一欄指向一筆紀錄，最後選把證據交給誰。
 * 這裡只負責讓玩家填，判定對錯是遊戲規則，步驟三才接。
 */
export function Accuse({ title, data, records, onBack, onSubmit }: Props) {
  const [who, setWho] = useState<number | null>(null);
  const [picks, setPicks] = useState<(string | null)[]>(() => data.fields.map(() => null));
  const [open, setOpen] = useState<number | null>(null);
  const [give, setGive] = useState<number | null>(null);
  const ready = who !== null && give !== null && picks.every(Boolean);

  return (
    <section className="suru suru-app" aria-label={S.accuseEntry}>
      <div className="suru-app__top">
        <SuruHeader title={title} />
        <button className="suru-app__close" onClick={onBack}>{S.back}</button>
      </div>
      <div className="suru-app__body accuse">
        <div className="accuse__intro">
          {data.intro.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <h2 className="suru-label">{S.accuseWho}</h2>
        <div className="suru-tokens" role="radiogroup" aria-label={S.accuseWho}>
          {data.suspects.map((name, i) => (
            <button key={name} role="radio" aria-checked={who === i} aria-label={name} onClick={() => setWho(i)}>
              <SuruToken mark={i} name={name} active={who === i} />
            </button>
          ))}
        </div>

        <h2 className="suru-label">{S.accuseProof}</h2>
        <ol className="suru-form accuse__fields">
          {data.fields.map((field, i) => {
            const chosen = records.find((r) => r.id === picks[i]);
            return (
              <li key={field}>
                <button className="accuse__field" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <span className="suru-form__no">{String(i + 1).padStart(2, '0')}</span>
                  <span className="suru-form__name">{field}</span>
                  {chosen ? <span className="accuse__chosen">{chosen.title}</span> : <span className="suru-form__slot" />}
                </button>
                {open === i && (
                  <ul className="accuse__picker">
                    {records.map((r) => (
                      <li key={r.id}>
                        <button
                          className={picks[i] === r.id ? 'on' : ''}
                          onClick={() => {
                            setPicks(picks.map((p, j) => (j === i ? r.id : p)));
                            setOpen(null);
                          }}
                        >
                          <span>{r.title}</span>
                          <small>{r.source}・{r.when}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        <h2 className="suru-label">{S.accuseGive}</h2>
        <div className="accuse__give" role="radiogroup" aria-label={S.accuseGive}>
          {data.recipients.map((name, i) => (
            <button key={name} role="radio" aria-checked={give === i} className={give === i ? 'on' : ''} onClick={() => setGive(i)}>
              {name}
            </button>
          ))}
        </div>

        <button
          className="suru-button accuse__submit"
          disabled={!ready}
          onClick={() => ready && onSubmit({ who: data.suspects[who!], records: picks as string[], giveTo: data.recipients[give!] })}
        >
          {S.accuseSubmit}
        </button>
      </div>
    </section>
  );
}
