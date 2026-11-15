import { useState } from 'react';

interface Props {
  battery: number;
  onBattery(value: number): void;
  onSkipIntro(): void;
  onRestart(): void;
  onClearUnread?(): void;
  onResetData?(): void;
  onShowcase?(): void;
  onVoice?(): void;
  /** 直接看結局：只在本機開發模式給，打包出去的版本沒有 */
  endings?: { id: string; title: string }[];
  onEnding?(id: string): void;
  /** 結局快轉：剩下的段落立刻全部出現。只在本機開發模式、結局畫面時給 */
  onSkipEnding?(): void;
}

/** 驗收用的小面板，只在開發模式或網址帶 ?dev 時出現。不是遊戲的一部分。 */
export function DevPanel({ battery, onBattery, onSkipIntro, onRestart, onClearUnread, onResetData, onShowcase, onVoice, endings, onEnding, onSkipEnding }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`dev ${open ? 'dev--open' : ''}`}>
      <button className="dev__toggle" onClick={() => setOpen(!open)}>
        {open ? '×' : 'DEV'}
      </button>
      {open && (
        <div className="dev__body">
          <label className="dev__row">
            <span>電量 {battery}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={battery}
              onChange={(e) => onBattery(Number(e.target.value))}
            />
          </label>
          <div className="dev__buttons">
            <button onClick={() => onBattery(battery - 8)}>−8%</button>
            <button onClick={() => onBattery(15)}>15%</button>
            <button onClick={() => onBattery(0)}>沒電</button>
            <button onClick={onSkipIntro}>跳過開場</button>
            <button onClick={onRestart}>重播開場</button>
            {onClearUnread && <button onClick={onClearUnread}>清掉紅點</button>}
            {onResetData && <button onClick={onResetData}>還原假資料</button>}
            {onShowcase && <button onClick={onShowcase}>Suru 樣式</button>}
            {onVoice && <button onClick={onVoice}>心聲通知</button>}
            {onSkipEnding && <button onClick={onSkipEnding}>結局快轉</button>}
          </div>
          {endings && onEnding && (
            <label className="dev__row">
              <span>直接看結局</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) onEnding(e.target.value);
                }}
              >
                <option value="">選一個結局…</option>
                {endings.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.id}　{x.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </aside>
  );
}
