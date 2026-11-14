import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DevPanel } from './dev/DevPanel';
import { tensionFromBattery } from './format';
import { useGame } from './game/useGame';
import { usePhoneMock } from './mock/usePhoneMock';
import { Dead } from './screens/Dead';
import { Ending } from './screens/Ending';
import { Intro } from './screens/Intro';
import { Phone } from './shell/Phone';
import { S } from './strings';
import { Showcase } from './suru/Showcase';
import type { IconId, IntroSegment, Nav, PhoneActions, PhoneData } from './types';

function hasParam(name: string): boolean {
  try {
    return new URLSearchParams(window.location.search).has(name);
  } catch {
    return false;
  }
}

const devEnabled = () => import.meta.env.DEV || hasParam('dev');

interface ShellProps {
  stage: 'intro' | 'phone' | 'over';
  run: number;
  battery: number;
  startBattery: number;
  data: PhoneData | null;
  actions: PhoneActions;
  intro: IntroSegment[];
  afterIntro: Nav;
  onIntroDone(): void;
  noticeIcon?(label: string): IconId | undefined;
  /** 蓋在手機畫面上的東西（沒電、結局、樣式示意頁） */
  overlay?: ReactNode;
  dev?: ReactNode;
  /** 設定裡的「重新開始遊戲」 */
  onRestart?(): void;
}

/** 機身、螢幕、實體 home 鍵。真的遊戲和假資料示範共用這一層。 */
function Shell({ stage, run, battery, startBattery, data, actions, intro, afterIntro, onIntroDone, noticeIcon, overlay, dev, onRestart }: ShellProps) {
  const [homePress, setHomePress] = useState(0);
  const [assistPress, setAssistPress] = useState(0);

  // 實體 home 鍵：短按回主畫面，長按叫出 Suru 助理
  const pressTimer = useRef<number | undefined>(undefined);
  const longFired = useRef(false);
  const pressStart = () => {
    longFired.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longFired.current = true;
      setAssistPress((n) => n + 1);
    }, 450);
  };
  const pressEnd = () => window.clearTimeout(pressTimer.current);
  const pressClick = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    setHomePress((n) => n + 1);
  };
  const suruCalling = stage === 'phone' && !!data && (data.apps.find((a) => a.layout === 'suru')?.unread ?? 0) > 0;

  return (
    <div className="stage">
      <div className="device">
        <div className="bezel" aria-hidden="true">
          <span className="bezel__lens" />
          <span className="bezel__speaker" />
        </div>
        <div className="screen">
          {stage === 'intro' || !data ? (
            <Intro key={run} title="SURU" segments={intro} onDone={onIntroDone} noticeIcon={noticeIcon} />
          ) : (
            <Phone
              key={run}
              data={data}
              battery={battery}
              actions={actions}
              initialNav={afterIntro}
              onRestart={onRestart}
              homePress={homePress}
              assistPress={assistPress}
              tension={tensionFromBattery(battery, startBattery)}
            />
          )}
          {overlay}
        </div>
        <div className="chin">
          <button
            className={`chin__home ${suruCalling ? 'chin__home--calling' : ''}`}
            aria-label={S.home}
            disabled={stage !== 'phone' || !!data?.locked}
            onClick={pressClick}
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="rotate" role="alert">
        <span className="rotate__icon" aria-hidden="true" />
        <span>{S.rotate}</span>
      </div>
      {dev}
    </div>
  );
}

/** 真的遊戲：內容來自 content/，規則來自 src/engine */
function GameApp() {
  const game = useGame();
  if (game.stage === 'error') {
    return (
      <div className="stage">
        <pre className="load-error">{S.loadError}{'\n\n'}{game.error}</pre>
      </div>
    );
  }
  return (
    <Shell
      stage={game.stage === 'ended' ? 'over' : game.stage}
      run={game.run}
      battery={game.battery}
      startBattery={game.startBattery}
      data={game.data}
      actions={game.actions}
      intro={game.intro}
      afterIntro={game.afterIntro}
      onIntroDone={game.finishIntro}
      noticeIcon={game.noticeIcon}
      onRestart={game.restart}
      overlay={game.ending ? <Ending title={game.ending.title} text={game.ending.text} onRestart={game.restart} /> : undefined}
      dev={
        devEnabled() ? (
          <DevPanel battery={game.battery} onBattery={game.setBattery} onSkipIntro={game.finishIntro} onRestart={game.restart} />
        ) : undefined
      }
    />
  );
}

/** 假資料示範：只用來看版型和樣式，網址帶 ?mock 才會出現 */
function MockApp() {
  const mock = usePhoneMock();
  const [showcase, setShowcase] = useState(false);
  return (
    <Shell
      stage={mock.stage === 'dead' ? 'over' : mock.stage}
      run={mock.run}
      battery={mock.battery}
      startBattery={mock.startBattery}
      data={mock.data}
      actions={mock.actions}
      intro={mock.intro}
      afterIntro={mock.afterIntro}
      onIntroDone={mock.finishIntro}
      overlay={
        <>
          {mock.stage === 'dead' && <Dead onRestart={mock.restart} />}
          {showcase && <Showcase demo={mock.suruDemo} onClose={() => setShowcase(false)} />}
        </>
      }
      dev={
        devEnabled() ? (
          <DevPanel
            battery={mock.battery}
            onBattery={mock.setBattery}
            onSkipIntro={mock.finishIntro}
            onRestart={mock.restart}
            onClearUnread={mock.clearUnread}
            onResetData={mock.resetData}
            onShowcase={() => setShowcase(true)}
            onVoice={mock.showVoice}
          />
        ) : undefined
      }
    />
  );
}

export function App({ mode }: { mode?: 'game' | 'mock' }) {
  return (mode ?? (hasParam('mock') ? 'mock' : 'game')) === 'mock' ? <MockApp /> : <GameApp />;
}
