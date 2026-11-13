import { S } from '../strings';
import { SuruMark } from '../suru/Suru';

/** 沒電：螢幕變暗，剩下 Suru 這一層的一行字，點一下回到開場 */
export function Dead({ onRestart }: { onRestart(): void }) {
  return (
    <button className="suru dead" onClick={onRestart}>
      <span className="dead__inner">
        <span className="dead__zero" aria-hidden="true">0%</span>
        <span className="dead__rule" aria-hidden="true" />
        <span className="dead__title">{S.batteryDead}</span>
        <span className="dead__hint">
          <SuruMark pulse />
          {S.tapToRestart}
        </span>
      </span>
    </button>
  );
}
