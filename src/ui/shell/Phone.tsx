import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Dialer, Sms } from '../apps/Comms';
import { Calculator, Calendar, Camera, Clock, Music, Settings } from '../apps/Extras';
import { Finder } from '../apps/Finder';
import { CallScreen } from '../screens/Call';
import { PromptDialog } from '../screens/Prompt';
import { SuruBanner } from '../suru/Suru';
import { ChatList, ChatRoom, ImageBlock } from '../layouts/Chat';
import type { ZoomTarget } from '../layouts/Chat';
import { ContactCard, ContactList } from '../layouts/Contacts';
import { GalleryGrid, GalleryViewer } from '../layouts/Gallery';
import { Feed, PhotoFeed } from '../layouts/Feed';
import { Profile } from '../layouts/Profile';
import { DetailView, ListView } from '../layouts/ListDetail';
import { SuruApp } from '../suru/SuruApp';
import { S } from '../strings';
import { tensionStage, tensionVisual } from '../format';
import type { Nav, PhoneActions, PhoneData, PhonePrefs } from '../types';
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
  /** 每長按一次 home 鍵就加一，外殼看到數字變了就叫出 Suru 助理 */
  assistPress?: number;
  /** 緊張程度 0 到 1，只影響畫面氣氛 */
  tension?: number;
  /** 設定裡的「重新開始遊戲」 */
  onRestart?(): void;
}

type Motion = 'open' | 'push' | 'pop' | 'close';

const HOME: Nav = { app: null, detail: null };

/**
 * 手機外殼：狀態列、主畫面、進出 App 的轉場。
 * 「現在開著哪個 App、哪一層」是外殼自己的畫面狀態，不屬於遊戲狀態。
 */
export function Phone({ data, battery, actions, initialNav, homePress = 0, assistPress = 0, tension = 0, onRestart }: Props) {
  const [nav, setNav] = useState<Nav>(initialNav ?? HOME);
  const [motion, setMotion] = useState<Motion>('open');
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const onZoom = (target: ZoomTarget) => {
    if (data.locked) return;
    // 點開照片要讓遊戲規則知道「看過了」
    if (target.image?.itemId) actions.onViewImage(target.image.itemId);
    setZoom(target);
  };

  useEffect(() => {
    actions.onNavigate(nav);
    // 只在換畫面時通知
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.app, nav.detail]);
  const [prefs, setPrefs] = useState<PhonePrefs>({ showPercent: true, reduceMotion: false });

  const app = data.apps.find((a) => a.id === nav.app) ?? null;

  const locked = !!data.locked;
  const go = (next: Nav, how: Motion) => {
    // 鎖住的時候不能換畫面
    if (locked) return;
    setMotion(how);
    setNav(next);
  };
  const openApp = (appId: string) => {
    actions.onOpenApp(appId);
    if (data.apps.find((a) => a.id === appId)?.layout === 'suru') actions.onOpenSuru();
    go({ app: appId, detail: null }, 'open');
  };
  const openDetail = (id: string) => go({ app: nav.app, detail: id }, 'push');
  // 個人頁面記在 detail 裡，前面加 @；從哪個聊天室點進來的另外記著，返回時回到那裡
  const [profileFrom, setProfileFrom] = useState<string | null>(null);
  const openProfile = (memberId: string, from: string | null) => {
    actions.onViewProfile(memberId);
    setProfileFrom(from);
    go({ app: nav.app, detail: '@' + memberId }, 'push');
  };
  const back = () => {
    if (nav.detail?.startsWith('@') && profileFrom) return go({ app: nav.app, detail: profileFrom }, 'pop');
    return nav.detail ? go({ app: nav.app, detail: null }, 'pop') : go(HOME, 'close');
  };

  const seenPress = useRef(homePress);
  useEffect(() => {
    if (homePress === seenPress.current) return;
    seenPress.current = homePress;
    if (locked) return;
    setMotion('close');
    setNav(HOME);
    setZoom(null);
  }, [homePress]);

  const seenAssist = useRef(assistPress);
  useEffect(() => {
    if (assistPress === seenAssist.current) return;
    seenAssist.current = assistPress;
    if (locked) return;
    const suru = data.apps.find((a) => a.layout === 'suru');
    if (!suru) return;
    actions.onOpenApp(suru.id);
    actions.onOpenSuru();
    setMotion('open');
    setNav({ app: suru.id, detail: null });
    // 只在長按次數改變時觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistPress]);

  // 往右滑返回上一層（手指從畫面左半邊開始、大致水平地往右滑一段距離）
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const box = e.currentTarget.getBoundingClientRect();
    // 量不到寬度時（例如測試環境）不限制起點
    const inLeftHalf = !box.width || (t && t.clientX - box.left < box.width * 0.5);
    swipe.current = app && t && inLeftHalf ? { x: t.clientX, y: t.clientY } : null;
  };
  const swipeEnd = (e: React.TouchEvent) => {
    const from = swipe.current;
    const t = e.changedTouches[0];
    swipe.current = null;
    if (!from || !t || locked) return;
    const dx = t.clientX - from.x;
    const dy = Math.abs(t.clientY - from.y);
    if (dx > 70 && dy < dx * 0.6) {
      setZoom(null);
      back();
    }
  };

  let title = app?.name ?? '';
  let body = null;

  // 私訊的標題列點一下也能開個人頁面
  let titleAction: (() => void) | undefined;
  if (app?.layout === 'chat') {
    const thread = data.threads.find((t) => t.id === nav.detail);
    const profile = nav.detail?.startsWith('@') ? data.profiles.find((p) => '@' + p.id === nav.detail) : undefined;
    if (profile) {
      title = profile.name;
      body = (
        <Profile
          profile={profile}
          onZoom={onZoom}
          onCall={() => actions.onCall(profile.id)}
          onMessage={() => {
            if (!profile.threadId) return;
            actions.onOpenThread(profile.threadId);
            go({ app: nav.app, detail: profile.threadId }, 'pop');
          }}
        />
      );
    } else if (thread) {
      title = thread.title;
      if (!thread.group && thread.members[0]) titleAction = () => openProfile(thread.members[0].id, thread.id);
      body = (
        <ChatRoom
          thread={thread}
          selfId={data.selfId}
          onChoose={(optionId) => {
            // 「ask::疑點::對象」是拿疑點來問，其他是回覆等著回的訊息
            const [kind, card, target] = optionId.split('::');
            if (kind === 'ask' && card && target) actions.onProbe(card, target);
            else actions.onChooseReply(thread.id, optionId);
          }}
          onSendPrefill={() => actions.onSendPrefill(thread.id)}
          onZoom={onZoom}
          onProfile={(memberId) => openProfile(memberId, thread.id)}
          onSeen={(ids) => actions.onSeeMessages(thread.id, ids)}
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
      body = <DetailView detail={row.detail} onZoom={onZoom} />;
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
  } else if (app?.layout === 'sms') {
    // 簡訊：detail 是「寄件者的名字」，開著的是那個寄件者的那一串
    if (nav.detail) title = nav.detail;
    body = <Sms groups={data.lists[app.id] ?? []} sender={nav.detail} onOpen={openDetail} />;
  } else if (app?.layout === 'dialer') {
    const groups = data.lists[app.id] ?? [];
    const row = groups.flatMap((g) => g.rows).find((r) => r.id === nav.detail);
    const contactsApp = data.apps.find((a) => a.layout === 'contacts');
    body = row ? (
      <DetailView detail={row.detail} onZoom={onZoom} />
    ) : (
      <Dialer
        groups={groups}
        cast={data.contacts}
        onOpenRow={(id) => {
          actions.onOpenRow(app.id, id);
          openDetail(id);
        }}
        onOpenContact={(name) => contactsApp && go({ app: contactsApp.id, detail: name }, 'push')}
        // 鍵盤撥號沒有對象；結果一樣是打不出去的那句提示
        onCall={() => actions.onCall('')}
      />
    );
  } else if (app?.layout === 'gallery') {
    const items = data.galleries[app.id] ?? [];
    body = nav.detail ? (
      <GalleryViewer
        items={items}
        currentId={nav.detail}
        onGo={(id) => {
          actions.onViewImage(id);
          setNav({ app: app.id, detail: id });
        }}
      />
    ) : (
      <GalleryGrid
        items={items}
        onOpen={(id) => {
          actions.onViewImage(id);
          openDetail(id);
        }}
      />
    );
  } else if (app?.layout === 'contacts') {
    const person = data.contacts.people.find((p) => p.name === nav.detail);
    body = person ? <ContactCard person={person} onZoom={onZoom} /> : <ContactList cast={data.contacts} onOpen={openDetail} />;
  } else if (app?.layout === 'finder') {
    body = <Finder devices={data.finder} onLocate={actions.onLocate} />;
  } else if (app?.layout === 'photofeed') {
    body = <PhotoFeed posts={data.photoFeeds[app.id] ?? []} onZoom={onZoom} onSeen={(ids) => actions.onSeeItems(app.id, ids)} />;
  } else if (app?.layout === 'feed') {
    body = <Feed posts={data.feed} />;
  } else if (app?.layout === 'calculator') {
    body = <Calculator />;
  } else if (app?.layout === 'clock') {
    body = <Clock clock={data.clock} />;
  } else if (app?.layout === 'calendar') {
    body = <Calendar data={data.calendar} />;
  } else if (app?.layout === 'settings') {
    body = <Settings wifiName={data.wifiName} battery={battery} prefs={prefs} onChange={setPrefs} onRestart={onRestart} />;
  } else if (app?.layout === 'camera') {
    body = <Camera />;
  } else if (app?.layout === 'music') {
    body = <Music tracks={data.music} />;
  } else if (app) {
    body = <div className="empty">{S.placeholderScreen}</div>;
  }

  // 大圖切換上下張時不重播轉場，所以 key 不含圖片 id
  const viewKey = app?.layout === 'gallery' ? `${nav.app}/${nav.detail ? 'viewer' : ''}` : `${nav.app}/${nav.detail ?? ''}`;

  return (
    <div
      className={`phone ${prefs.reduceMotion ? 'phone--calm' : ''} ${locked ? 'phone--locked' : ''}`}
      data-stage={tensionStage(tension)}
      style={{ '--tension': tensionVisual(tension).toFixed(3) } as CSSProperties}
    >
      <StatusBar wifiName={data.wifiName} battery={battery} showPercent={prefs.showPercent} />
      <div className="phone__stage" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
        {app?.layout === 'suru' ? (
          <div key="suru" className="suruwrap">
            <SuruApp
              title={app.name}
              data={data.suru}
              onClose={back}
              onAccuseAnswer={actions.onAccuseAnswer}
              onAccuseFill={actions.onAccuseFill}
              onAccuseSubmit={actions.onAccuseSubmit}
              onSpot={actions.onSpot}
              onThink={actions.onThink}
              onZoom={onZoom}
              onProbe={(card, target, threadId) => {
                actions.onProbe(card, target);
                // 送出之後直接跳到那個聊天室，看對方怎麼回
                const chat = data.apps.find((x) => x.layout === 'chat');
                if (chat && threadId) {
                  actions.onOpenThread(threadId);
                  go({ app: chat.id, detail: threadId }, 'open');
                }
              }}
            />
          </div>
        ) : app ? (
          <section key={viewKey} className={`appwin appwin--${motion}`} aria-label={title}>
            <div className="appwin__bar">
              <button className="appwin__back" onClick={back} aria-label={S.back} disabled={locked}>
                <BackGlyph />
                <span aria-hidden="true">{S.back}</span>
              </button>
              {titleAction ? (
                <h1 className="appwin__title">
                  <button className="appwin__titlebtn" onClick={titleAction} aria-label={S.profileOpen + '：' + title}>{title}</button>
                </h1>
              ) : (
                <h1 className="appwin__title">{title}</h1>
              )}
              <span />
            </div>
            <div className="appwin__body">{body}</div>
          </section>
        ) : (
          <div key="home" className={`homewrap homewrap--${motion}`}>
            <HomeScreen apps={data.apps} folders={data.folders} threads={data.threads} onOpen={openApp} />
          </div>
        )}
        {zoom && (
          <button className="zoom" onClick={() => setZoom(null)} aria-label={S.zoomClose}>
            {zoom.src ? <img src={zoom.src} alt={zoom.alt} draggable={false} /> : zoom.image ? <ImageBlock image={zoom.image} className="zoom__placeholder" full /> : null}
          </button>
        )}
        <div className="phone__veil" aria-hidden="true" />
        {data.prompt &&
          !data.call &&
          (data.prompt.waiting ? <div className="call-wait" aria-hidden="true" /> : <PromptDialog prompt={data.prompt} onAnswer={actions.onAnswerPrompt} />)}
        {data.call &&
          (data.call.waiting ? (
            <div className="call-wait" aria-hidden="true" />
          ) : (
            <CallScreen key={data.call.id} call={data.call} onDecline={actions.onDeclineCall} onRing={actions.onLetRing} />
          ))}
        {data.notice && (
          <SuruBanner
            key={data.notice.id}
            text={data.notice.text}
            onDismiss={actions.onDismissNotice}
            app={data.notice.message ? { name: data.notice.message.appName, icon: data.notice.message.icon, title: data.notice.message.title } : undefined}
            onOpen={
              data.notice.message
                ? () => {
                    // 點新訊息的通知：直接進那個聊天室
                    const m = data.notice?.message;
                    if (!m || locked) return;
                    setZoom(null);
                    actions.onOpenThread(m.threadId);
                    go({ app: m.appId, detail: m.threadId }, 'open');
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
