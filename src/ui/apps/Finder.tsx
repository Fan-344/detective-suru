import { S } from '../strings';
import type { FinderDevice } from '../types';

interface Props {
  devices: FinderDevice[];
  onLocate(deviceId: string): void;
}

// 示意地圖：自己畫的一座不存在的城市。幾個街區各有各的走向（像真的城市那樣不是一張整齊的方格），
// 加上幾條大路、一條河、幾塊綠地。不對應任何真實街道，也沒有地名。
const DISTRICTS = [
  { clip: '0,0 190,0 230,170 120,250 0,210', angle: 12, gap: 15 },
  { clip: '190,0 400,0 400,150 300,210 230,170', angle: -24, gap: 13 },
  { clip: '0,210 120,250 160,420 0,470', angle: -8, gap: 17 },
  { clip: '120,250 230,170 300,210 330,380 160,420', angle: 31, gap: 12 },
  { clip: '300,210 400,150 400,430 330,380', angle: 4, gap: 16 },
  { clip: '0,470 160,420 330,380 400,430 400,600 0,600', angle: -17, gap: 14 },
];

function grid(gap: number): string {
  // 一整片斜的格線，之後用街區的外框裁掉多的
  let d = '';
  for (let p = -500; p <= 900; p += gap) d += `M${p} -400V1000M-500 ${p}H900`;
  return d;
}

function CityMap() {
  return (
    <svg className="finder__city" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="600" fill="#1a252e" />
      <defs>
        {DISTRICTS.map((x, i) => (
          <clipPath key={i} id={`fd-clip-${i}`}>
            <polygon points={x.clip} />
          </clipPath>
        ))}
      </defs>
      {/* 小巷：每個街區一種走向和疏密 */}
      {DISTRICTS.map((x, i) => (
        <g key={i} clipPath={`url(#fd-clip-${i})`}>
          <path d={grid(x.gap)} transform={`rotate(${x.angle} 200 300)`} stroke="#2b3944" strokeWidth="1.1" fill="none" />
        </g>
      ))}
      {/* 綠地 */}
      <g fill="#1d4133">
        <path d="M36 96c14-10 40-6 46 10s-8 36-28 38-34-34-18-48z" />
        <path d="M244 52l52-14 16 40-44 22z" />
        <path d="M176 300c22-8 52 4 50 26s-34 30-52 20-16-40 2-46z" />
        <path d="M318 452l56-8 10 52-60 12z" />
        <path d="M40 520l44 6-4 44-46-8z" />
        <path d="M0 330l26 6 4 70-30 10z" />
      </g>
      {/* 河：一條寬的、一條支流 */}
      <g fill="none" stroke="#17384f" strokeLinecap="round">
        <path d="M92 -10C70 90 128 150 104 250S44 400 84 500s-10 80-4 120" strokeWidth="20" />
        <path d="M104 250c50 20 90 4 130 30s60 20 180 10" strokeWidth="7" />
      </g>
      {/* 街區之間的路 */}
      <g fill="none" stroke="#394a57" strokeWidth="3.200" strokeLinejoin="round">
        <path d="M190 0L230 170 300 210 330 380 400 430" />
        <path d="M0 210L120 250 230 170" />
        <path d="M120 250L160 420 0 470" />
        <path d="M160 420L330 380" />
        <path d="M300 210L400 150" />
      </g>
      {/* 幾條大路和一條快速道路 */}
      <g fill="none" strokeLinecap="round">
        <path d="M-10 150C120 120 250 250 410 300" stroke="#42566a" strokeWidth="5" />
        <path d="M150 -10C170 200 260 380 300 610" stroke="#42566a" strokeWidth="5" />
        <path d="M-10 560C140 500 260 520 410 480" stroke="#42566a" strokeWidth="4" />
        <path d="M-10 40C150 70 280 20 410 90" stroke="#516a80" strokeWidth="7" />
        <path d="M-10 40C150 70 280 20 410 90" stroke="#1a252e" strokeWidth="1.200" strokeDasharray="10 8" />
      </g>
    </svg>
  );
}

/** 裝置的小圖：名字像平板就畫平板，其餘畫手機 */
function DeviceGlyph({ name }: { name: string }) {
  const tablet = /pad|平板/i.test(name);
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tablet ? <rect x="4.500" y="3" width="15" height="18" rx="2.200" /> : <rect x="7" y="2.500" width="10" height="19" rx="2.400" />}
      <path d={tablet ? 'M11 18.200h2' : 'M10.800 18.600h2.400'} />
    </svg>
  );
}

/** 定位到的裝置在地圖上的位置：資料沒有座標，所以照順序放在幾個固定的點上 */
const SPOTS = [
  { left: 64, top: 17 },
  { left: 30, top: 27 },
  { left: 47, top: 8 },
  { left: 82, top: 30 },
];

/**
 * 找裝置：整個畫面是一張地圖，定位到的裝置在地圖上有一個圖釘；
 * 下方一張面板列出帳號底下的裝置。按「定位」之後才看得到位置紀錄。
 * 定位要耗多少電是遊戲規則，這裡只負責顯示。
 */
export function Finder({ devices, onLocate }: Props) {
  const located = devices.filter((d) => d.located);
  return (
    <div className="finder">
      <CityMap />
      {located.map((d, i) => {
        const spot = SPOTS[i % SPOTS.length];
        return (
          <span key={d.id} className="finder__pin" style={{ left: `${spot.left}%`, top: `${spot.top}%` }} aria-hidden="true">
            <DeviceGlyph name={d.name} />
          </span>
        );
      })}
      <div className="finder__sheet">
        <span className="finder__grab" aria-hidden="true" />
        <h2 className="finder__title">{S.finderDevices}</h2>
        <ul className="finder__list">
          {devices.map((d) => (
            <li key={d.id} className="finder__device">
              <div className="finder__head">
                <span className="finder__icon">
                  <DeviceGlyph name={d.name} />
                </span>
                <span className="finder__main">
                  <span className="finder__name">{d.name}</span>
                  <span className="finder__sub">{d.located ? S.finderLocated : S.finderIdle}</span>
                </span>
                {!d.located && (
                  <button className="finder__locate" onClick={() => onLocate(d.id)} aria-label={`${S.finderLocate} ${d.name}`}>
                    {S.finderLocate}
                    {d.cost ? <small>－{d.cost}%</small> : null}
                  </button>
                )}
              </div>
              {d.located && (
                <ol className="finder__history">
                  {d.history.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
