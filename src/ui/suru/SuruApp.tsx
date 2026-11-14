import { useState } from 'react';
import { S } from '../strings';
import type { AccuseAnswer, SuruData } from '../types';
import { Accuse } from './Accuse';
import { SuruCard, SuruHeader, SuruMark } from './Suru';

type Tab = 'voice' | 'timeline' | 'records' | 'statements' | 'cards';

const TABS: { id: Tab; label: string }[] = [
  { id: 'voice', label: S.suruVoice },
  { id: 'timeline', label: S.suruTimeline },
  { id: 'records', label: S.suruRecords },
  { id: 'statements', label: S.suruStatements },
  { id: 'cards', label: S.suruCards },
];

interface Props {
  title: string;
  data: SuruData;
  onClose(): void;
  onAccuse(answer: AccuseAnswer): void;
}

/**
 * Suru 助理：玩家自己的那一層。心聲和推理備忘錄都住在這裡，
 * 跟以晴手機裡的備忘錄 App 是兩回事。
 * 這裡只有長相和分頁，比對、出牌等規則在步驟三才接。
 */
export function SuruApp({ title, data, onClose, onAccuse }: Props) {
  const [accusing, setAccusing] = useState(false);
  const [tab, setTab] = useState<Tab>('voice');
  const [card, setCard] = useState<number | null>(null);
  const latest = data.voice[0];
  const earlier = data.voice.slice(1);

  if (accusing) {
    return (
      <Accuse
        title={title}
        data={data.accuse}
        records={data.records}
        onBack={() => setAccusing(false)}
        onSubmit={(answer) => {
          setAccusing(false);
          onAccuse(answer);
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

      <div className="suru-app__now">
        <span className="suru-orb" aria-hidden="true"><SuruMark pulse /></span>
        <p className="suru-app__line">{latest ? latest.text : S.suruSilent}</p>
      </div>

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
        {tab === 'voice' &&
          (earlier.length === 0 ? (
            <p className="suru-empty">{S.suruEmpty}</p>
          ) : (
            <ul className="suru-voice">
              {earlier.map((v) => (
                <li key={v.id}>{v.text}</li>
              ))}
            </ul>
          ))}

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

        {(tab === 'records' || tab === 'statements') && (
          <ul className="suru-items">
            {(tab === 'records' ? data.records : data.statements).map((item) => (
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

        {tab === 'cards' && (
          <div className="suru-hand suru-hand--wrap">
            {data.cards.map((c) => (
              <SuruCard key={c.no} {...c} selected={card === c.no} onClick={() => setCard(card === c.no ? null : c.no)} />
            ))}
          </div>
        )}
      </div>
      <button className="suru-button suru-app__accuse" onClick={() => setAccusing(true)}>{S.accuseEntry}</button>
    </section>
  );
}
