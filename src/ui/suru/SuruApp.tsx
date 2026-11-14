import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../layouts/Chat';
import type { ZoomFn } from '../layouts/Chat';
import { S } from '../strings';
import type { SuruData } from '../types';
import { Accuse } from './Accuse';
import { AccuseForm } from './AccuseForm';
import { SuruHeader } from './Suru';
import { DoubtView, Spot } from './Tools';

type Tab = 'cards' | 'timeline';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: S.suruCards },
  { id: 'timeline', label: S.suruTimeline },
];

interface Props {
  title: string;
  data: SuruData;
  onClose(): void;
  onAccuseAnswer(stepId: string, value: string): void;
  onAccuseFill(slotId: string, answer: string): void;
  onAccuseSubmit(): void;
  onSpot(card: string, option: string): void;
  /** 送出試探的那句話，並跳到它送出的聊天室 */
  onProbe(card: string, target: string, threadId: string | null): void;
  onThink(card: string): void;
  onZoom?: ZoomFn;
}

/** 同一個時段的列排在一起 */
function groupByTime(rows: SuruData['timeline']): { time: string; rows: SuruData['timeline'] }[] {
  const groups: { time: string; rows: SuruData['timeline'] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.time === row.time) last.rows.push(row);
    else groups.push({ time: row.time, rows: [row] });
  }
  return groups;
}

/** 翻牌動畫多久（毫秒），跟樣式裡的 doubt-flip 一致，再多留一點 */
const FLIP_MS = 1000;

/**
 * Suru 助理：玩家自己的那一層，放推理要用的兩樣東西：疑點（含還沒成立的「在意的地方」）和時間軸，
 * 加上「指認兇手」的入口。這裡只負責顯示和收玩家的選擇，規則都在遊戲規則那邊。
 */
export function SuruApp({ title, data, onClose, onAccuseAnswer, onAccuseFill, onAccuseSubmit, onSpot, onProbe, onThink, onZoom }: Props) {
  const [tab, setTab] = useState<Tab>('cards');
  const [accusing, setAccusing] = useState(false);
  const [spotting, setSpotting] = useState<string | null>(null);
  // 點進了哪一張疑點卡
  const [viewing, setViewing] = useState<string | null>(null);

  // 題目全部答完、進度歸零時，回到助理的主畫面
  const answered = useRef(data.accuse.answers.length);
  useEffect(() => {
    if (data.accuse.answers.length < answered.current) setAccusing(false);
    answered.current = data.accuse.answers.length;
  }, [data.accuse.answers.length]);

  const enterTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(enterTimer.current), []);
  // 記住哪些曾經是「在意的地方」。它們變成疑點的那一刻，那張卡要翻面
  const wasConcern = useRef(new Set<string>());
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = data.cards.filter((c) => wasConcern.current.has(c.id) && !flipped.has(c.id)).map((c) => c.id);
    data.concerns.forEach((c) => wasConcern.current.add(c.card));
    if (now.length) setFlipped((prev) => new Set([...prev, ...now]));
    // 玩家剛指對的那一張：等翻牌翻完，直接進到那張疑點裡。這段時間他要是已經點了別張，就不打擾
    const entered = now.find((id) => id === spotting);
    if (entered) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = window.setTimeout(() => setViewing((v) => v ?? entered), FLIP_MS);
    }
    // 只在清單內容變動時檢查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cards.length, data.concerns.length]);

  const concern = data.concerns.find((c) => c.card === spotting);
  // 指對了，那一筆就不在「在意的地方」裡了：回到助理的主畫面
  useEffect(() => {
    if (spotting && !concern) setSpotting(null);
  }, [spotting, concern]);
  if (concern) {
    return <Spot concern={concern} onBack={() => setSpotting(null)} onSpot={(option) => onSpot(concern.card, option)} onThink={() => onThink(concern.card)} onZoom={onZoom} />;
  }

  const doubt = data.cards.find((c) => c.id === viewing);
  if (doubt) {
    return (
      <DoubtView
        doubt={doubt}
        onBack={() => setViewing(null)}
        onThink={() => onThink(doubt.id)}
        onAsk={(target, threadId) => {
          setViewing(null);
          onProbe(doubt.id, target, threadId);
        }}
      />
    );
  }

  if (accusing && data.accuse.form) {
    return (
      <AccuseForm
        title={title}
        intro={data.accuse.intro}
        form={data.accuse.form}
        onBack={() => setAccusing(false)}
        onFill={onAccuseFill}
        onSubmit={onAccuseSubmit}
        onGive={(id) => onAccuseAnswer('give', id)}
      />
    );
  }
  if (accusing) return <Accuse title={title} data={data.accuse} onBack={() => setAccusing(false)} onAnswer={onAccuseAnswer} />;

  const nothing = data.cards.length === 0 && data.concerns.length === 0;

  return (
    <section className="suru suru-app" aria-label={title}>
      <div className="suru-app__top">
        <SuruHeader title={title} />
        <button className="suru-app__close" onClick={onClose}>{S.suruClose}</button>
      </div>

      <div className="suru-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={'suru-tabs__tab' + (tab === t.id ? ' suru-tabs__tab--on' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="suru-app__body" role="tabpanel">
        {tab === 'cards' && (
          <>
            {nothing && <p className="suru-empty">{S.suruEmpty}</p>}
            {/* 兩種卡片：「在意的地方」還沒成立，要先指出哪裡有問題；「疑點」已經成立，可以拿去問人。種類直接標在卡片上 */}
            <div className="doubts">
              {data.concerns.map((c) => (
                <button key={c.card} className="doubt doubt--concern" onClick={() => setSpotting(c.card)}>
                  <span className="doubt__kind doubt__kind--concern">{S.concernsLabel}</span>
                  <span className="doubt__title">{c.item.title}</span>
                  {/* 同一筆資料可能有兩個在意的地方，所以把要問的那一句也印在卡片上 */}
                  {c.prompt && <span className="doubt__q">{c.prompt}</span>}
                </button>
              ))}
              {data.cards.map((c) => (
                <button key={c.id} className={'doubt doubt--card' + (flipped.has(c.id) ? ' doubt--flip' : '')} onClick={() => setViewing(c.id)}>
                  <span className="doubt__kind doubt__kind--card">{S.doubtsLabel}</span>
                  <span className="doubt__title">{c.title}</span>
                  <span className="doubt__no">{String(c.no).padStart(2, '0')}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'timeline' && (
          <div className="suru-time">
            {data.timeline.length === 0 && <p className="suru-empty">{S.suruEmpty}</p>}
            {groupByTime(data.timeline).map((g) => (
              <section key={g.time}>
                <h2 className="suru-time__when">{g.time}</h2>
                <ol>
                  {g.rows.map((row) => (
                    <li key={row.id} className={row.gap ? 'suru-time__gap' : ''}>
                      {row.who ? <Avatar name={row.who.name} avatar={row.who.avatar} /> : <span className="suru-time__thing" aria-hidden="true" />}
                      <span className="suru-time__text">{row.gap ? S.suruGap : row.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>

      {data.accuse.available && (
        <button className="suru-button suru-app__accuse" onClick={() => setAccusing(true)}>{S.accuseEntry}</button>
      )}
    </section>
  );
}
