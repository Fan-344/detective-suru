import { useState } from 'react';
import { S } from '../strings';
import type { AccuseData } from '../types';
import { SuruHeader, SuruToken } from './Suru';

interface Props {
  title: string;
  data: AccuseData;
  onBack(): void;
  onAnswer(stepId: string, value: string): void;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 指認兇手：Suru 照推理的順序一題一題問。
 * 有的題目用一張已經成立的疑點回答，有的選一個人，最後選把證據交給誰。
 * 答過的題目留在上方，看得到推理是怎麼一步一步接起來的。可以中途離開，回來從同一題繼續。
 * 這裡只負責問和收答案；答得對不對、指錯人會怎樣，都由遊戲規則決定。
 */
export function Accuse({ title, data, onBack, onAnswer }: Props) {
  const records = data.choices;
  const [picked, setPicked] = useState<string | null>(null);
  const index = Math.min(data.index ?? data.answers.length, data.steps.length - 1);
  const step = data.steps[index];
  const people = step.kind === 'who' || step.kind === 'give' ? (step.options ?? []) : [];
  const cards = data.cards ?? [];
  // 回報給規則的是 id；沒有 id 的（假資料示範）就回報名字
  const idOf = (name: string, i: number) => step.optionIds?.[i] ?? name;

  const answer = () => {
    if (!picked) return;
    setPicked(null);
    onAnswer(step.id, picked);
  };

  return (
    <section className="suru suru-app" aria-label={S.accuseEntry}>
      <div className="suru-app__top">
        <SuruHeader title={title} counter={`${two(index + 1)} / ${two(data.steps.length)}`} />
        <button className="suru-app__close" onClick={onBack}>{S.back}</button>
      </div>

      <div className="suru-app__body accuse">
        {index === 0 && (
          <div className="accuse__intro">
            {data.intro.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {index > 0 && (
          <ol className="accuse__chain">
            {data.answers.slice(0, index).map((a, i) => (
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
            {records.length === 0 && <li className="suru-empty">{S.suruEmpty}</li>}
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

        {step.kind === 'card' && (
          <>
            <div className="doubts accuse__cards" role="radiogroup" aria-label={S.accuseCards}>
              {cards.map((c) => (
                <button key={c.id} role="radio" aria-checked={picked === c.id} className={'doubt doubt--card' + (picked === c.id ? ' doubt--picked' : '')} onClick={() => setPicked(c.id)}>
                  <span className="doubt__kind doubt__kind--card">{S.doubtsLabel}</span>
                  <span className="doubt__title">{c.title}</span>
                  <span className="doubt__no">{two(c.no)}</span>
                </button>
              ))}
            </div>
            {cards.length === 0 && <p className="suru-empty">{S.suruEmpty}</p>}
            {!!data.retryCost && <p className="tool-cost">{S.accuseRetry.replace('{cost}', String(data.retryCost))}</p>}
          </>
        )}

        {step.kind === 'who' && (
          <div className="suru-tokens" role="radiogroup" aria-label={S.accuseWho}>
            {people.map((name, i) => (
              <button key={name} role="radio" aria-checked={picked === idOf(name, i)} aria-label={name} onClick={() => setPicked(idOf(name, i))}>
                <SuruToken mark={i} name={name} active={picked === idOf(name, i)} />
              </button>
            ))}
          </div>
        )}

        {step.kind === 'give' && (
          <div className="accuse__give" role="radiogroup" aria-label={S.accuseGive}>
            {people.map((name, i) => (
              <button key={name} role="radio" aria-checked={picked === idOf(name, i)} className={picked === idOf(name, i) ? 'on' : ''} onClick={() => setPicked(idOf(name, i))}>
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
