import { useState } from 'react';
import { DevPanel } from './dev/DevPanel';
import { tensionFromBattery } from './format';
import { usePhoneMock } from './mock/usePhoneMock';
import { Dead } from './screens/Dead';
import { Intro } from './screens/Intro';
import { Phone } from './shell/Phone';
import { S } from './strings';
import { Showcase } from './suru/Showcase';

function devEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('dev');
  } catch {
    return false;
  }
}

export function App() {
  const mock = usePhoneMock();
  const [homePress, setHomePress] = useState(0);
  const [showcase, setShowcase] = useState(false);
  return (
    <div className="stage">
      <div className="device">
        <div className="bezel" aria-hidden="true">
          <span className="bezel__lens" />
          <span className="bezel__speaker" />
        </div>
        <div className="screen">
          {mock.stage === 'intro' ? (
            <Intro key={mock.run} title={mock.introTitle} segments={mock.intro} onDone={mock.finishIntro} />
          ) : (
            <Phone
              key={mock.run}
              data={mock.data}
              battery={mock.battery}
              actions={mock.actions}
              initialNav={mock.afterIntro}
              homePress={homePress}
              tension={tensionFromBattery(mock.battery, mock.startBattery)}
            />
          )}
          {mock.stage === 'dead' && <Dead onRestart={mock.restart} />}
          {showcase && <Showcase demo={mock.suruDemo} onClose={() => setShowcase(false)} />}
        </div>
        <div className="chin">
          <button
            className="chin__home"
            aria-label={S.home}
            disabled={mock.stage !== 'phone'}
            onClick={() => setHomePress((n) => n + 1)}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="rotate" role="alert">
        <span className="rotate__icon" aria-hidden="true" />
        <span>{S.rotate}</span>
      </div>
      {devEnabled() && (
        <DevPanel
          battery={mock.battery}
          onBattery={mock.setBattery}
          onSkipIntro={mock.finishIntro}
          onRestart={mock.restart}
          onClearUnread={mock.clearUnread}
          onResetData={mock.resetData}
          onShowcase={() => setShowcase(true)}
        />
      )}
    </div>
  );
}
