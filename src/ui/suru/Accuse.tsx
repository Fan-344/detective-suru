import { useState } from 'react';
import { S } from '../strings';
import type { AccuseData, SuruMemoItem } from '../types';
import { SuruHeader, SuruToken } from './Suru';

interface Props {
  title: string;
  data: AccuseData;
  records: SuruMemoItem[];
  onBack(): void;
  onAnswer(stepId: string, value: string): void;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 指認兇手：Suru 照推理的順序一題一題問。
 * 有的題目用一筆紀錄回答，有的選一個人，最後選把證據交給誰。
 * 答過的題目留在上方，看得到推理是怎麼一步一步接起來的。可以中途離開，回來從同一題繼續。
 * 這裡只負責問和收答案；答得對不對、指錯人會怎樣，是遊戲規則，步驟三才接。
 */
export function Accuse({ title, data, records, onBack, onAnswer }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const index = Math.min(data.answers.length, data.steps.length - 1);
  const step = data.steps[index];
  const people = step.kind === 'record' ? [] : (step.options ?? []);

  const answer = () => {
    if (!picked) return;
    const label = step.kind === 'record' ? (records.find((r) => r.id === picked)?.title ?? picked) : picked;
    setPicked(null);
    onAnswer(step.id, label);
  };

  return (
    <section className="suru suru-app" aria-label={S.accuseEntry}>
      <div className="suru-app__top">
        <SuruHeader title={title} counter={`${two(index + 1)} / ${two(data.steps.length)}`} />
        <button className="suru-app__close" onClick={onBack}>{S.back}</button>
      </div>

      <div className="suru-app__body accuse">
        {data.answers.length === 0 && (
          <div className="accuse__intro">
            {data.intro.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {data.answers.length > 0 && (
          <ol className="accuse__chain">
            {data.answers.map((a, i) => (
              <li key={i}>
                <span className="suru-form__no">{two(i + 1)}</span>
                <span className="accuse__chain-q">{data.steps[i].prompt}</span>
                <span className="accuse__chain-a">{a}</span>
              </li>
            ))}
          </ol>
        )}

        <p className="accuse__prompt" data-testid="accuse-prompt">{step.prompt}</p>

        {step.kind === 'record' && (
          <ul className="accuse__picker accuse__picker--open" role="radiogroup" aria-label={S.accuseProof}>
            {records.map((r) => (
              <li key={r.id}>
                <button role="radio" aria-checked={picked === r.id} className={picked === r.id ? 'on' : ''} onClick={() => setPicked(r.id)}>
                  <span>{r.title}</span>
                  <small>{r.source}・{r.when}</small>
                </button>
              </li>
            ))}
          </ul>
        )}

        {step.kind === 'who' && (
          <div className="suru-tokens" role="radiogroup" aria-label={S.accuseWho}>
            {people.map((name, i) => (
              <button key={name} role="radio" aria-checked={picked === name} aria-label={name} onClick={() => setPicked(name)}>
                <SuruToken mark={i} name={name} active={picked === name} />
              </button>
            ))}
          </div>
        )}

        {step.kind === 'give' && (
          <div className="accuse__give" role="radiogroup" aria-label={S.accuseGive}>
            {people.map((name) => (
              <button key={name} role="radio" aria-checked={picked === name} className={picked === name ? 'on' : ''} onClick={() => setPicked(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="suru-button suru-app__accuse" disabled={!picked} onClick={answer}>{S.accuseSubmit}</button>
    </section>
  );
}
