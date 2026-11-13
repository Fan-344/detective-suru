import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChatList, ChatRoom } from '../layouts/Chat';
import { GalleryGrid, GalleryViewer } from '../layouts/Gallery';
import { DetailView, ListView } from '../layouts/ListDetail';
import { S } from '../strings';
import { tensionStage, tensionVisual } from '../format';
import type { Nav, PhoneActions, PhoneData } from '../types';
import { HomeScreen } from './HomeScreen';
import { BackGlyph } from './icons';
import { StatusBar } from './StatusBar';

interface Props {
  data: PhoneData;
  battery: number;
  actions: PhoneActions;
  initialNav?: Nav;
  /** 每按一次實體 home 鍵就加一，外殼看到數字變了就回主畫面 */
  homePress?: number;
  /** 緊張程度 0 到 1，只影響畫面氣氛 */
  tension?: number;
}

type Motion = 'open' | 'push' | 'pop' | 'close';

const HOME: Nav = { app: null, detail: null };

/**
 * 手機外殼：狀態列、主畫面、進出 App 的轉場。
 * 「現在開著哪個 App、哪一層」是外殼自己的畫面狀態，不屬於遊戲狀態。
 */
export function Phone({ data, battery, actions, initialNav, homePress = 0, tension = 0 }: Props) {
  const [nav, setNav] = useState<Nav>(initialNav ?? HOME);
  const [motion, setMotion] = useState<Motion>('open');

  const app = data.apps.find((a) => a.id === nav.app) ?? null;

  const go = (next: Nav, how: Motion) => {
    setMotion(how);
    setNav(next);
  };
  const openApp = (appId: string) => go({ app: appId, detail: null }, 'open');
  const openDetail = (id: string) => go({ app: nav.app, detail: id }, 'push');
  const back = () => (nav.detail ? go({ app: nav.app, detail: null }, 'pop') : go(HOME, 'close'));

  const seenPress = useRef(homePress);
  useEffect(() => {
    if (homePress === seenPress.current) return;
    seenPress.current = homePress;
    setMotion('close');
    setNav(HOME);
  }, [homePress]);

  let title = app?.name ?? '';
  let body = null;

  if (app?.layout === 'chat') {
    const thread = data.threads.find((t) => t.id === nav.detail);
    if (thread) {
      title = thread.title;
      body = (
        <ChatRoom
          thread={thread}
          selfId={data.selfId}
          onChoose={(optionId) => actions.onChooseReply(thread.id, optionId)}
          onSendPrefill={() => actions.onSendPrefill(thread.id)}
        />
      );
    } else {
      body = (
        <ChatList
          threads={data.threads}
          onOpen={(id) => {
            actions.onOpenThread(id);
            openDetail(id);
          }}
        />
      );
    }
  } else if (app?.layout === 'list') {
    const groups = data.lists[app.id] ?? [];
    const row = groups.flatMap((g) => g.rows).find((r) => r.id === nav.detail);
    if (row) {
      body = <DetailView detail={row.detail} />;
    } else {
      body = (
        <ListView
          groups={groups}
          onOpen={(id) => {
            actions.onOpenRow(app.id, id);
            openDetail(id);
          }}
        />
      );
    }
  } else if (app?.layout === 'gallery') {
    const items = data.galleries[app.id] ?? [];
    body = nav.detail ? (
      <GalleryViewer items={items} currentId={nav.detail} onGo={(id) => setNav({ app: app.id, detail: id })} />
    ) : (
      <GalleryGrid items={items} onOpen={openDetail} />
    );
  } else if (app) {
    body = <div className="empty">{S.placeholderScreen}</div>;
  }

  // 大圖切換上下張時不重播轉場，所以 key 不含圖片 id
  const viewKey = app?.layout === 'gallery' ? `${nav.app}/${nav.detail ? 'viewer' : ''}` : `${nav.app}/${nav.detail ?? ''}`;

  return (
    <div
      className="phone"
      data-stage={tensionStage(tension)}
      style={{ '--tension': tensionVisual(tension).toFixed(3) } as CSSProperties}
    >
      <StatusBar wifiName={data.wifiName} battery={battery} />
      <div className="phone__stage">
        {app ? (
          <section key={viewKey} className={`appwin appwin--${motion}`} aria-label={title}>
            <div className="appwin__bar">
              <button className="appwin__back" onClick={back} aria-label={S.back}>
                <BackGlyph />
                <span aria-hidden="true">{S.back}</span>
              </button>
              <h1 className="appwin__title">{title}</h1>
              <span />
            </div>
            <div className="appwin__body">{body}</div>
          </section>
        ) : (
          <div key="home" className={`homewrap homewrap--${motion}`}>
            <HomeScreen apps={data.apps} folders={data.folders} threads={data.threads} onOpen={openApp} />
          </div>
        )}
        <div className="phone__veil" aria-hidden="true" />
      </div>
    </div>
  );
}
