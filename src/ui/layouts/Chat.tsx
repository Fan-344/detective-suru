import { useEffect, useRef } from 'react';
import { groupByDay, lastLine, unreadLabel } from '../format';
import { S } from '../strings';
import type { ChatThread, ImagePlaceholder } from '../types';

export function ImageBlock({ image, className = '', full = false }: { image: ImagePlaceholder; className?: string; full?: boolean }) {
  return (
    <div className={`img img--tone${image.tone % 6} ${className}`} role="img" aria-label={image.description}>
      <span className="img__text">{full ? image.description : (image.label ?? image.description)}</span>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  // 還沒有頭像圖，先用名字最後一個字
  return <span className="avatar" aria-hidden="true">{name.slice(-1)}</span>;
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
              <Avatar name={t.title} />
              <span className="row__main">
                <span className="row__title">
                  {t.title}
                  {t.group && <span className="row__count">{t.members.length + 1}</span>}
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
}

/** 聊天室：舊訊息、已讀時間、輸入中提示，底部是回覆選項或預先填好的輸入框 */
export function ChatRoom({ thread, selfId, onChoose, onSendPrefill }: RoomProps) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.id, thread.messages.length, thread.typing]);

  const nameOf = (id: string) => thread.members.find((m) => m.id === id)?.name ?? '';
  const lastId = thread.messages[thread.messages.length - 1]?.id;
  const typingName = thread.typing ? nameOf(thread.typing) : '';

  return (
    <div className="room">
      <div className="room__scroll" ref={scroller}>
        {groupByDay(thread.messages).map((group, gi) => (
          <div key={`${group.day}-${gi}`}>
            <div className="room__day"><span>{group.day}</span></div>
            {group.items.map((m, i) => {
              const mine = m.from === selfId;
              const prev = group.items[i - 1];
              const next = group.items[i + 1];
              const first = !prev || prev.from !== m.from;
              const tail = !next || next.from !== m.from || next.time !== m.time;
              return (
                <div key={m.id} className={`msg ${mine ? 'msg--mine' : 'msg--theirs'} ${first ? 'msg--first' : ''}`}>
                  {!mine && (first ? <Avatar name={nameOf(m.from)} /> : <span className="avatar avatar--gap" />)}
                  <div className="msg__body">
                    {!mine && first && thread.group && <div className="msg__name">{nameOf(m.from)}</div>}
                    <div className="msg__line">
                      {m.image ? (
                        <ImageBlock image={m.image} className="msg__img" />
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
            <Avatar name={typingName} />
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
      ) : null}
    </div>
  );
}
