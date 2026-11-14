import { batteryTone, clampBattery } from '../format';
import { S } from '../strings';
import { WifiGlyph } from './icons';

interface Props {
  wifiName: string;
  battery: number;
  showPercent?: boolean;
}

/** 狀態列：左邊是 Wi-Fi，右邊是電量數字；下方一條橫跨螢幕的細線，長度就是剩餘電量。 */
export function StatusBar({ wifiName, battery, showPercent = true }: Props) {
  const value = clampBattery(battery);
  const tone = batteryTone(value);
  return (
    <header className={`status status--${tone}`}>
      <div className="status__row">
        <span className="status__wifi">
          <WifiGlyph />
          <span className="status__ssid">{wifiName}</span>
        </span>
        <span className="status__battery" role="img" aria-label={`${S.battery} ${value}%`}>
          <span className="status__cell" aria-hidden="true">
            <span className="status__cell-fill" style={{ width: `${value}%` }} />
          </span>
          {showPercent && <span className="status__pct" data-testid="battery">{value}%</span>}
        </span>
      </div>
      <div className="status__line" aria-hidden="true">
        <div className="status__line-fill" style={{ width: `${value}%` }} />
      </div>
    </header>
  );
}
