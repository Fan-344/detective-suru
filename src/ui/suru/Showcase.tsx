import { useState } from 'react';
import { SuruCard, SuruHeader, SuruToken } from './Suru';

export interface SuruDemo {
  title: string;
  sections: { cards: string; players: string; form: string };
  cards: { no: number; title: string; note?: string }[];
  players: string[];
  form: string[];
  submit: string;
  close: string;
}

/**
 * Suru 樣式示意頁：只用來看測試牌、人物記號、挑戰書的長相。
 * 從 DEV 面板打開，不是遊戲的一部分；正式畫面在步驟三才做。
 */
export function Showcase({ demo, onClose }: { demo: SuruDemo; onClose(): void }) {
  const [card, setCard] = useState<number | null>(demo.cards[0]?.no ?? null);
  const [player, setPlayer] = useState<number | null>(null);
  return (
    <div className="suru suru-show">
      <SuruHeader title={demo.title} />
      <div className="suru-show__scroll">
        <h2 className="suru-label">{demo.sections.cards}</h2>
        <div className="suru-hand">
          {demo.cards.map((c) => (
            <SuruCard key={c.no} {...c} selected={card === c.no} onClick={() => setCard(card === c.no ? null : c.no)} />
          ))}
          <SuruCard no={0} title="" faceDown />
        </div>

        <h2 className="suru-label">{demo.sections.players}</h2>
        <div className="suru-tokens">
          {demo.players.map((name, i) => (
            <button key={name} onClick={() => setPlayer(player === i ? null : i)} aria-pressed={player === i}>
              <SuruToken mark={i} name={name} active={player === i} />
            </button>
          ))}
        </div>

        <h2 className="suru-label">{demo.sections.form}</h2>
        <ol className="suru-form">
          {demo.form.map((field, i) => (
            <li key={field}>
              <span className="suru-form__no">{String(i + 1).padStart(2, '0')}</span>
              <span className="suru-form__name">{field}</span>
              <span className="suru-form__slot" />
            </li>
          ))}
        </ol>
        <button className="suru-button" disabled>{demo.submit}</button>
      </div>
      <button className="suru-button suru-button--ghost" onClick={onClose}>{demo.close}</button>
    </div>
  );
}
