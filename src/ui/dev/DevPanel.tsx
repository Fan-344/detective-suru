import { useState } from 'react';

interface Props {
  battery: number;
  onBattery(value: number): void;
  onSkipIntro(): void;
  onRestart(): void;
  onClearUnread(): void;
  onResetData(): void;
  onShowcase(): void;
}

/** 驗收用的小面板，只在開發模式或網址帶 ?dev 時出現。不是遊戲的一部分。 */
export function DevPanel({ battery, onBattery, onSkipIntro, onRestart, onClearUnread, onResetData, onShowcase }: Props) {
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
            <button onClick={onClearUnread}>清掉紅點</button>
            <button onClick={onResetData}>還原假資料</button>
            <button onClick={onShowcase}>Suru 樣式</button>
          </div>
        </div>
      )}
    </aside>
  );
}
