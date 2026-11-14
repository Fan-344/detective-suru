import { S } from '../strings';
import type { FinderDevice } from '../types';

interface Props {
  devices: FinderDevice[];
  onLocate(deviceId: string): void;
}

/**
 * 找裝置：列出帳號底下的裝置。按「定位」之後才看得到位置紀錄。
 * 定位要耗多少電是遊戲規則，這裡只負責顯示。
 */
export function Finder({ devices, onLocate }: Props) {
  return (
    <div className="finder">
      <div className="finder__map" aria-hidden="true">
        {devices.filter((d) => d.located).map((d, i) => (
          <span key={d.id} className="finder__pin" style={{ left: `${34 + i * 28}%`, top: `${42 + i * 12}%` }} />
        ))}
      </div>
      <ul className="finder__list">
        {devices.map((d) => (
          <li key={d.id} className="finder__device">
            <div className="finder__head">
              <span className="finder__name">{d.name}</span>
              {!d.located && (
                <button className="finder__locate" onClick={() => onLocate(d.id)} aria-label={`${S.finderLocate} ${d.name}`}>
                  {S.finderLocate}
                  {d.cost ? <small>－{d.cost}%</small> : null}
                </button>
              )}
            </div>
            {d.located ? (
              <ol className="finder__history">
                {d.history.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            ) : (
              <p className="finder__idle">{S.finderIdle}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
