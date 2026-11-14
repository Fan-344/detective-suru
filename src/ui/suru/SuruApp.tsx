import { useState } from 'react';
import { S } from '../strings';
import type { SuruData, SuruMemoItem } from '../types';
import { Accuse } from './Accuse';
import { SuruCard, SuruHeader, SuruMark } from './Suru';

type Tab = 'cards' | 'clues' | 'timeline';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: S.suruCards },
  { id: 'clues', label: S.suruClues },
  { id: 'timeline', label: S.suruTimeline },
];

interface Props {
  title: string;
  data: SuruData;
  onClose(): void;
  onAccuseAnswer(stepId: string, value: string): void;
}

function Items({ label, items }: { label: string; items: SuruMemoItem[] }) {
  return (
    <section className="suru-clues">
      <h2 className="suru-label">{label}</h2>
      {items.length === 0 ? (
        <p className="suru-empty">{S.suruEmpty}</p>
      ) : (
        <ul className="suru-items">
          {items.map((item) => (
            <li key={item.id}>
              <span className="suru-items__meta">
                <span>{item.source}</span>
                <span>{item.when}</span>
              </span>
              <span className="suru-items__title">{item.title}</span>
              {item.body && <span className="suru-items__body">{item.body}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Suru 助理：玩家自己的那一層，只放推理要用的三樣東西：疑點、線索（紀錄與說法）、時間軸，
 * 加上「指認兇手」的入口。心聲平常是從畫面上方跳出來的通知，這裡只留一行可以展開回顧。
 * 這裡只有長相和分頁，比對、試探等規則在步驟三才接。
 */
export function SuruApp({ title, data, onClose, onAccuseAnswer }: Props) {
  const [tab, setTab] = useState<Tab>('cards');
  const [card, setCard] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const [accusing, setAccusing] = useState(false);
  const latest = data.voice[0];

  if (accusing) {
    return (
      <Accuse
        title={title}
        data={data.accuse}
        records={data.records}
        onBack={() => setAccusing(false)}
        onAnswer={(stepId, value) => {
          // 答完最後一題就回到 Suru 助理
          if (data.accuse.answers.length + 1 >= data.accuse.steps.length) setAccusing(false);
          onAccuseAnswer(stepId, value);
        }}
      />
    );
  }

  return (
    <section className="suru suru-app" aria-label={title}>
      <div className="suru-app__top">
        <SuruHeader title={title} />
        <button className="suru-app__close" onClick={onClose}>{S.suruClose}</button>
      </div>

      {latest && (
        <div className="suru-said">
          <button className="suru-said__latest" onClick={() => setHistory(!history)} aria-expanded={history} aria-label={S.suruSaid}>
            <SuruMark />
            <span className="suru-said__text">{latest.text}</span>
            <span className="suru-said__more" aria-hidden="true">{history ? '▴' : '▾'}</span>
          </button>
          {history && (
            <ul className="suru-said__list">
              {data.voice.slice(1).map((v) => (
                <li key={v.id}>{v.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="suru-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`suru-tabs__tab ${tab === t.id ? 'suru-tabs__tab--on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="suru-app__body" role="tabpanel">
        {tab === 'cards' &&
          (data.cards.length === 0 ? (
            <p className="suru-empty">{S.suruEmpty}</p>
          ) : (
            <div className="suru-hand suru-hand--wrap">
              {data.cards.map((c) => (
                <SuruCard key={c.no} {...c} selected={card === c.no} onClick={() => setCard(card === c.no ? null : c.no)} />
              ))}
            </div>
          ))}

        {tab === 'clues' && (
          <>
            <Items label={S.suruRecords} items={data.records} />
            <Items label={S.suruStatements} items={data.statements} />
          </>
        )}

        {tab === 'timeline' && (
          <ol className="suru-time">
            {data.timeline.map((row) => (
              <li key={row.id} className={row.gap ? 'suru-time__gap' : ''}>
                <span className="suru-time__when">{row.time}</span>
                <span className="suru-time__text">{row.gap ? S.suruGap : row.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button className="suru-button suru-app__accuse" onClick={() => setAccusing(true)}>{S.accuseEntry}</button>
    </section>
  );
}
