import { useLayoutEffect, useRef, useState } from 'react';
import { S } from '../strings';
import type { AccuseForm as FormData } from '../types';
import { SuruHeader, SuruToken } from './Suru';

interface Props {
  title: string;
  intro: string[];
  form: FormData;
  onBack(): void;
  /** 在某一格放上一張疑點（或一個人） */
  onFill(slotId: string, answer: string): void;
  /** 四格都填好，交出去 */
  onSubmit(): void;
  /** 通過之後，把證據交給誰 */
  onGive(personId: string): void;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * 指認兇手：一張表，每一格放一張已經成立的疑點，最後一格選一個人，全部填好再一次交出去。
 * 填的時候不顯示對錯，可以隨意換。被退回時，站不住的那幾格旁邊會多一句提示，填的內容留著。
 * 對不對、指錯人會怎樣，都由遊戲規則決定；這裡只負責讓玩家填和交。
 */
export function AccuseForm({ title, intro, form, onBack, onFill, onSubmit, onGive }: Props) {
  // 正在替哪一格挑疑點
  const [picking, setPicking] = useState<string | null>(null);
  const [giveTo, setGiveTo] = useState<string | null>(null);
  // 進去挑疑點再回來，表要停在原本捲到的位置，不要跳回最上面
  const body = useRef<HTMLDivElement>(null);
  const keptScroll = useRef(0);
  useLayoutEffect(() => {
    if (picking === null && body.current) body.current.scrollTop = keptScroll.current;
  }, [picking]);
  const pick = (slotId: string) => {
    keptScroll.current = body.current?.scrollTop ?? 0;
    setPicking(slotId);
  };
  const slot = form.slots.find((s) => s.id === picking && s.kind === 'card');

  // 挑疑點：列出手上全部成立的疑點小卡
  if (slot) {
    return (
      <section className="suru suru-app" aria-label={S.accuseEntry}>
        <div className="suru-app__top">
          <SuruHeader title={title} />
          <button className="suru-app__close" onClick={() => setPicking(null)}>{S.back}</button>
        </div>
        <div className="suru-app__body accuse">
          <p className="accuse__prompt" data-testid="accuse-prompt">{slot.prompt}</p>
          <div className="doubts accuse__cards" role="radiogroup" aria-label={S.accuseCards}>
            {slot.options.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={slot.answer === c.id}
                className={'doubt doubt--card' + (slot.answer === c.id ? ' doubt--picked' : '')}
                onClick={() => {
                  onFill(slot.id, c.id);
                  setPicking(null);
                }}
              >
                <span className="doubt__kind doubt__kind--card">{S.doubtsLabel}</span>
                <span className="doubt__title">{c.name}</span>
                {c.no !== undefined && <span className="doubt__no">{two(c.no)}</span>}
              </button>
            ))}
          </div>
          {slot.options.length === 0 && <p className="suru-empty">{S.suruEmpty}</p>}
        </div>
      </section>
    );
  }

  // 通過之後：選把證據交給誰
  if (form.passed) {
    return (
      <section className="suru suru-app" aria-label={S.accuseEntry}>
        <div className="suru-app__top">
          <SuruHeader title={title} />
          <button className="suru-app__close" onClick={onBack}>{S.back}</button>
        </div>
        <div className="suru-app__body accuse">
          <p className="accuse__prompt" data-testid="accuse-prompt">{S.accuseGivePrompt}</p>
          <div className="accuse__give" role="radiogroup" aria-label={S.accuseGive}>
            {form.recipients.map((p) => (
              <button key={p.id} role="radio" aria-checked={giveTo === p.id} className={giveTo === p.id ? 'on' : ''} onClick={() => setGiveTo(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <button className="suru-button suru-app__accuse" disabled={!giveTo} onClick={() => giveTo && onGive(giveTo)}>{S.accuseSubmit}</button>
      </section>
    );
  }

  return (
    <section className="suru suru-app" aria-label={S.accuseEntry}>
      <div className="suru-app__top">
        <SuruHeader title={title} />
        <button className="suru-app__close" onClick={onBack}>{S.back}</button>
      </div>

      <div className="suru-app__body accuse" ref={body}>
        {form.premise.length > 0 && (
          <div className="accuse__premise">
            {form.premise.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        <div className="accuse__intro">
          {intro.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <ol className="aform">
          {form.slots.map((s, i) => {
            const chosen = s.options.find((o) => o.id === s.answer);
            return (
              <li key={s.id} className={'aform__slot' + (s.hint ? ' aform__slot--back' : '')}>
                <p className="aform__q">
                  <span className="suru-form__no">{two(i + 1)}</span>
                  <span>{s.prompt}</span>
                </p>
                {s.kind === 'card' ? (
                  <button className={'aform__box' + (chosen ? ' aform__box--filled' : '')} onClick={() => pick(s.id)} aria-label={s.prompt}>
                    {chosen ? (
                      <>
                        <span className="doubt__kind doubt__kind--card">{S.doubtsLabel}</span>
                        <span className="aform__card">{chosen.name}</span>
                        <span className="aform__change">{S.accuseChange}</span>
                      </>
                    ) : (
                      <span className="aform__empty">{S.accusePick}</span>
                    )}
                  </button>
                ) : (
                  <div className="suru-tokens" role="radiogroup" aria-label={s.prompt}>
                    {s.options.map((p, mark) => (
                      <button key={p.id} role="radio" aria-checked={s.answer === p.id} aria-label={p.name} onClick={() => onFill(s.id, p.id)}>
                        <SuruToken mark={mark} name={p.name} active={s.answer === p.id} />
                      </button>
                    ))}
                  </div>
                )}
                {s.hint && <p className="aform__hint" role="note">{s.hint}</p>}
              </li>
            );
          })}
        </ol>
        {!!form.retryCost && <p className="tool-cost">{S.accuseRejectCost.replace('{cost}', String(form.retryCost))}</p>}
      </div>

      <button className="suru-button suru-app__accuse" disabled={!form.ready} onClick={onSubmit}>{S.accuseHandIn}</button>
    </section>
  );
}
