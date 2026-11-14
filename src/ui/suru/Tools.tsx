import type { ReactNode } from 'react';
import { Avatar, ImageBlock } from '../layouts/Chat';
import type { ZoomFn } from '../layouts/Chat';
import { S } from '../strings';
import type { SuruConcern, SuruDoubt, SuruThoughts } from '../types';
import { SuruHeader } from './Suru';

// Suru 助理裡要動手的畫面：指出哪裡有問題、疑點的內頁（要提示、選要拿去問誰）。
// 這裡只負責讓玩家選；選了之後對不對、會發生什麼，都由遊戲規則決定。

function Frame({ title, onBack, children }: { title: string; onBack(): void; children: ReactNode }) {
  return (
    <section className="suru suru-app" aria-label={title}>
      <div className="suru-app__top">
        <SuruHeader title={title} />
        <button className="suru-app__close" onClick={onBack}>{S.back}</button>
      </div>
      <div className="suru-app__body">{children}</div>
    </section>
  );
}

/** 提示：已經給過的句子留在底下，還有下一句就能再按 */
export function Thoughts({ thoughts, onThink }: { thoughts: SuruThoughts; onThink(): void }) {
  if (thoughts.hints.length === 0 && !thoughts.canThink) return null;
  return (
    <div className="doubt__thoughts">
      {thoughts.hints.map((h, i) => (
        <p key={i} className="doubt__hint">{h}</p>
      ))}
      {thoughts.canThink && (
        <button className="doubt__think" onClick={onThink}>
          {S.thinkMore}
          {thoughts.thinkCost ? <small>－{thoughts.thinkCost}%</small> : null}
        </button>
      )}
    </div>
  );
}

interface DoubtProps {
  doubt: SuruDoubt;
  onBack(): void;
  onThink(): void;
  onAsk(target: string, threadId: string | null): void;
}

/** 疑點的內頁：點小卡片進來，在這裡要提示、選要拿去問誰。選了就送出，並跳到那個聊天室 */
export function DoubtView({ doubt, onBack, onThink, onAsk }: DoubtProps) {
  return (
    <Frame title={S.doubtsLabel} onBack={onBack}>
      <div className="doubt-page doubt-page--card">
        <span className="doubt__kind doubt__kind--card">{S.doubtsLabel}</span>
        <h2 className="doubt-page__title">{doubt.title}</h2>
        {doubt.note && <p className="doubt__note">{doubt.note}</p>}
        <Thoughts thoughts={doubt} onThink={onThink} />
      </div>
      {!doubt.thinkOnly && (
        <>
          <p className="accuse__prompt">{S.askWho}</p>
          {doubt.targets.length === 0 && <p className="doubt__nobody">{S.askNobody}</p>}
          <div className="doubt__targets">
            {doubt.targets.map((t) => (
              <button key={t.id} className="doubt__target" onClick={() => onAsk(t.id, t.threadId)} aria-label={t.name}>
                <Avatar name={t.name} avatar={t.avatar} />
                <span className="doubt__target-main">
                  <span className="doubt__target-name">
                    {t.name}
                    <small>
                      {t.where}
                      {t.cost ? '・－' + t.cost + '%' : ''}
                    </small>
                  </span>
                  <span className="doubt__target-say">{t.text}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Frame>
  );
}

interface SpotProps {
  concern: SuruConcern;
  onBack(): void;
  onSpot(option: string): void;
  onThink(): void;
  onZoom?: ZoomFn;
}

/** 在意的地方：把那一筆資料原樣擺出來，問「哪裡有問題」，玩家指出是哪個細節 */
export function Spot({ concern, onBack, onSpot, onThink, onZoom }: SpotProps) {
  const d = concern.item;
  return (
    <Frame title={S.concernsLabel} onBack={onBack}>
      <div className="tool-subject">
        <div className="tool-subject__title">{d.title}</div>
        {d.when && <div className="tool-subject__when">{d.when}</div>}
        {d.image && <ImageBlock image={d.image} className="tool-subject__img" onZoom={onZoom} />}
        {d.lines?.map((line, i) => <p key={i}>{line}</p>)}
        {d.fields && (
          <dl className="tool-subject__fields">
            {d.fields.map((f, i) => (
              <div key={i}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <p className="accuse__prompt">{concern.prompt ?? S.concernAsk}</p>
      <ul className="accuse__picker accuse__picker--open">
        {concern.options.map((o) => (
          <li key={o.id}>
            <button onClick={() => onSpot(o.id)}>
              <span>{o.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {concern.missCost > 0 && <p className="tool-cost">{S.spotMissCost.replace('{n}', String(concern.missCost))}</p>}
      <div className="doubt-page doubt-page--concern">
        <Thoughts thoughts={concern} onThink={onThink} />
      </div>
    </Frame>
  );
}
