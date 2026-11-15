import { useEffect, useRef, useState } from 'react';
import { avatarUrl, photoUrl } from '../assets';
import { groupByDay, lastLine, unreadLabel } from '../format';
import { S } from '../strings';
import type { ChatThread, ImagePlaceholder } from '../types';

/** 要放大看的東西：有圖檔就給網址；沒有圖檔的佔位圖給 image，放大後顯示完整描述 */
export interface ZoomTarget {
  src?: string;
  alt: string;
  image?: ImagePlaceholder;
}
export type ZoomFn = (target: ZoomTarget) => void;

interface ImageProps {
  image: ImagePlaceholder;
  className?: string;
  /** 顯示完整描述（大圖），否則顯示短標示（縮圖） */
  full?: boolean;
  onZoom?: ZoomFn;
}

export function ImageBlock({ image, className = '', full = false, onZoom }: ImageProps) {
  const src = photoUrl(image.src);
  if (src) {
    const img = <img className="img__photo" src={src} alt={image.description} draggable={false} />;
    return onZoom ? (
      <button className={`img img--photo ${className}`} onClick={() => onZoom({ src, alt: image.description, image })} aria-label={`${S.zoomOpen}：${image.description}`}>
        {img}
      </button>
    ) : (
      <div className={`img img--photo ${className}`}>{img}</div>
    );
  }
  const text = <span className="img__text">{full ? image.description : (image.label ?? image.description)}</span>;
  if (onZoom && !full) {
    return (
      <button className={`img img--tone${image.tone % 6} ${className}`} onClick={() => onZoom({ alt: image.description, image })} aria-label={`${S.zoomOpen}：${image.label ?? image.description}`}>
        {text}
      </button>
    );
  }
  return (
    <div className={`img img--tone${image.tone % 6} ${className}`} role="img" aria-label={image.description}>
      {text}
    </div>
  );
}

interface AvatarProps {
  name: string;
  avatar?: string;
  onZoom?: ZoomFn;
  /** 點頭像要做別的事（例如開個人頁面）。有給這個就不放大 */
  onOpen?(): void;
}

/** 頭像：有圖用圖，沒有就用名字最後一個字。給了 onZoom 就能點開看大圖 */
export function Avatar({ name, avatar, onZoom, onOpen }: AvatarProps) {
  const src = avatarUrl(avatar);
  if (onOpen) {
    return (
      <button className={'avatar' + (src ? ' avatar--img' : '')} onClick={onOpen} aria-label={S.profileOpen + '：' + name}>
        {src ? <img src={src} alt="" draggable={false} /> : name.slice(-1)}
      </button>
    );
  }
  if (!src) return <span className="avatar" aria-hidden="true">{name.slice(-1)}</span>;
  const img = <img src={src} alt="" draggable={false} />;
  return onZoom ? (
    <button className="avatar avatar--img" onClick={() => onZoom({ src, alt: name })} aria-label={`${S.zoomOpen}：${name}`}>
      {img}
    </button>
  ) : (
    <span className="avatar avatar--img" aria-hidden="true">{img}</span>
  );
}

/** 聊天列表：群組和私訊，顯示最後一句與未讀數 */
export function ChatList({ threads, onOpen }: { threads: ChatThread[]; onOpen(id: string): void }) {
  return (
    <ul className="rows">
      {threads.map((t) => {
        const last = t.messages[t.messages.length - 1];
        const badge = unreadLabel(t.unread);
        return (
          <li key={t.id}>
            <button className="row" onClick={() => onOpen(t.id)}>
              <Avatar name={t.title} avatar={t.group ? undefined : t.members[0]?.avatar} />
              <span className="row__main">
                <span className="row__title">
                  {t.title}
                  {t.group && <span className="row__count">{t.members.length + 1}</span>}
                  {t.official && <span className="row__tag">{S.chatOfficial}</span>}
                  {t.muted && <span className="row__muted" aria-label={S.chatMuted} />}
                </span>
                <span className="row__sub">{t.typing ? `${S.typing}…` : lastLine(t)}</span>
              </span>
              <span className="row__side">
                <span className="row__meta">{last ? last.time : ''}</span>
                {badge && <span className="badge badge--inline">{badge}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface RoomProps {
  thread: ChatThread;
  selfId: string;
  onChoose(optionId: string): void;
  onSendPrefill(): void;
  onZoom?: ZoomFn;
  /** 點了某個人的頭像 */
  onProfile?(memberId: string): void;
  /** 這幾則是線索的舊訊息捲進畫面了 */
  onSeen?(itemIds: string[]): void;
}

/** 聊天室：舊訊息、已讀時間、輸入中提示，底部是回覆選項或預先填好的輸入框 */
export function ChatRoom({ thread, selfId, onChoose, onSendPrefill, onZoom, onProfile, onSeen }: RoomProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // 聊天室一打開停在最新的訊息。上面還有舊訊息時，頂端給一個提示，點一下往上翻一頁
  const [older, setOlder] = useState(false);
  const asks = thread.asks ?? [];
  // 「拿疑點來問」的上拉選單：平常收著，點把手或往上拉才打開
  const [asksOpen, setAsksOpen] = useState(false);
  const pullFrom = useRef<number | null>(null);
  const dragged = useRef(false);
  // 哪些是線索的舊訊息已經回報過「看到了」
  const reported = useRef(new Set<string>());
  const reportSeen = () => {
    const el = scroller.current;
    if (!el || !onSeen) return;
    const box = el.getBoundingClientRect();
    const fresh: string[] = [];
    el.querySelectorAll<HTMLElement>('[data-item]').forEach((node) => {
      const id = node.dataset.item as string;
      if (reported.current.has(id)) return;
      const r = node.getBoundingClientRect();
      // 量不到高度時（測試環境沒有排版）當作都看得到；否則要有一半以上在畫面裡才算
      const half = (r.top + r.bottom) / 2;
      if (box.height === 0 || (half >= box.top && half <= box.bottom)) fresh.push(id);
    });
    if (fresh.length === 0) return;
    fresh.forEach((id) => reported.current.add(id));
    onSeen(fresh);
  };
  const checkOlder = () => {
    const el = scroller.current;
    if (el) setOlder(el.scrollTop > 24);
    reportSeen();
  };
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    checkOlder();
  }, [thread.id, thread.messages.length, thread.typing]);
  const pageUp = () => {
    const el = scroller.current;
    if (!el) return;
    const top = Math.max(0, el.scrollTop - el.clientHeight * 0.8);
    if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'smooth' });
    else el.scrollTop = top;
  };

  const nameOf = (id: string) => thread.members.find((m) => m.id === id)?.name ?? '';
  const avatarOf = (id: string) => thread.members.find((m) => m.id === id)?.avatar;
  const lastId = thread.messages[thread.messages.length - 1]?.id;
  const typingName = thread.typing ? nameOf(thread.typing) : '';

  return (
    <div className="room">
      {older && (
        <button className="room__older" onClick={pageUp}>
          <span aria-hidden="true">↑ </span>
          {S.olderMessages}
        </button>
      )}
      <div className="room__scroll" ref={scroller} onScroll={checkOlder}>
        {groupByDay(thread.messages).map((group, gi) => (
          <div key={`${group.day}-${gi}`}>
            <div className="room__day"><span>{group.day}</span></div>
            {group.items.map((m, i) => {
              if (m.note) return <div key={m.id} className={'room__note' + (m.noteMine ? ' room__note--mine' : '')}>{m.note}</div>;
              const mine = m.from === selfId;
              const prev = group.items[i - 1]?.note ? undefined : group.items[i - 1];
              const next = group.items[i + 1]?.note ? undefined : group.items[i + 1];
              const first = !prev || prev.from !== m.from;
              const tail = !next || next.from !== m.from || next.time !== m.time;
              return (
                <div key={m.id} data-item={m.itemId} className={`msg ${mine ? 'msg--mine' : 'msg--theirs'} ${first ? 'msg--first' : ''}`}>
                  {!mine && (first ? <Avatar name={nameOf(m.from)} avatar={avatarOf(m.from)} onOpen={onProfile ? () => onProfile(m.from) : undefined} /> : <span className="avatar avatar--gap" />)}
                  <div className="msg__body">
                    {!mine && first && thread.group && <div className="msg__name">{nameOf(m.from)}</div>}
                    <div className="msg__line">
                      {m.image ? (
                        <ImageBlock image={m.image} className="msg__img" onZoom={onZoom} />
                      ) : (
                        <div className="bubble">{m.text}</div>
                      )}
                      {tail && (
                        <span className="msg__time">
                          {mine && m.id === lastId && thread.readAt && (
                            <span className="msg__read">{S.read} {thread.readAt}</span>
                          )}
                          {m.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {thread.typing && (
          <div className="msg msg--theirs msg--first" aria-label={`${typingName} ${S.typing}`}>
            <Avatar name={typingName} avatar={thread.typing ? avatarOf(thread.typing) : undefined} />
            <div className="bubble bubble--typing"><i /><i /><i /></div>
          </div>
        )}
      </div>

      {thread.prefill ? (
        <div className="composer">
          <div className="composer__field">{thread.prefill}</div>
          <button className="composer__send" onClick={onSendPrefill}>{S.send}</button>
        </div>
      ) : thread.options && thread.options.length > 0 ? (
        <div className="options">
          <div className="options__label">{S.chooseReply}</div>
          {thread.options.map((o) => (
            <button key={o.id} className="options__item" onClick={() => onChoose(o.id)}>{o.text}</button>
          ))}
        </div>
      ) : asks.length > 0 ? (
        // 等著回的訊息都回完了，手上的疑點才出現：一張從底部往上拉的選單，平常收成一條
        <div className="asksheet-slot">
        <div className={'asksheet' + (asksOpen ? ' asksheet--open' : '')}>
          <button
            className="asksheet__handle"
            aria-expanded={asksOpen}
            onClick={() => {
              // 剛剛是用拖的，就不要再當成點一下
              if (dragged.current) dragged.current = false;
              else setAsksOpen(!asksOpen);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              pullFrom.current = e.touches[0]?.clientY ?? null;
              dragged.current = false;
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              const from = pullFrom.current;
              pullFrom.current = null;
              const to = e.changedTouches[0]?.clientY;
              if (from === null || to === undefined || Math.abs(to - from) < 24) return;
              // 往上拉打開，往下拉收起來
              dragged.current = true;
              setAsksOpen(to < from);
            }}
          >
            <span className="asksheet__grab" aria-hidden="true" />
            <span className="asksheet__title">{S.askHere}（{asks.length}）</span>
          </button>
          {asksOpen && (
            <div className="asksheet__list">
              {asks.map((a) => (
                <button
                  key={a.id}
                  className="options__item options__item--ask"
                  onClick={() => {
                    setAsksOpen(false);
                    onChoose(a.id);
                  }}
                  aria-label={a.text}
                >
                  <span className="options__ask-text">{a.text}</span>
                  <span className="options__ask-meta">
                    {a.to ? S.askTo.replace('{name}', a.to) + '・' : ''}
                    {a.title}
                    {a.cost ? '・－' + a.cost + '%' : ''}
                    {a.silent ? '・' + S.silentTag : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}
