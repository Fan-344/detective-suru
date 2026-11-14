import { useEffect, useRef } from 'react';
import { S } from '../strings';
import { avatarUrl } from '../assets';
import type { FeedPost, PhotoPost } from '../types';
import { ImageBlock } from './Chat';
import type { ZoomFn } from './Chat';

/** 社群動態牆：頭像、帳號、時間、內文、回覆和按讚的數字。跟案情無關，只是讓手機像有人在用 */
export function Feed({ posts }: { posts: FeedPost[] }) {
  return (
    <div className="feed">
      <div className="feed__compose">
        <span className="feed__avatar feed__avatar--me" />
        <span>{S.feedCompose}</span>
      </div>
      <ul>
        {posts.map((p) => (
          <li key={p.id} className="feed__post">
            <span className="feed__avatar" style={{ background: 'hsl(' + ((p.author.length * 67 + p.likes * 13) % 360) + ' 45% 62%)' }}>{p.author.slice(0, 1)}</span>
            <div className="feed__main">
              <div className="feed__head">
                <span className="feed__author">
                  {p.author}
                  {p.handle && <small>@{p.handle}</small>}
                </span>
                <span className="feed__when">{p.when}</span>
              </div>
              <p className="feed__text">{p.text}</p>
              <div className="feed__actions" aria-hidden="true">
                <span>♡ {p.likes}</span>
                <span>◌ {p.replies}</span>
                <span>⇄</span>
                <span>➤</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const compact = (n: number) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 萬' : String(n));

/** 照片社群的動態牆：頭像、帳號、一張圖、一段話、按讚和留言數。點圖片放大看 */
export function PhotoFeed({ posts, onZoom, onSeen }: { posts: PhotoPost[]; onZoom?: ZoomFn; onSeen?(itemIds: string[]): void }) {
  const root = useRef<HTMLDivElement>(null);
  // 哪些動態已經回報過「看到了」
  const reported = useRef(new Set<string>());
  const seenRef = useRef(onSeen);
  seenRef.current = onSeen;

  // 動態滑到畫面上就算看過，不用點開。找到外層真正在捲動的那一塊，捲動時檢查哪幾則的圖在畫面裡
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let box: HTMLElement | null = el.parentElement;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const check = () => {
      const view = box?.getBoundingClientRect();
      const fresh: string[] = [];
      el.querySelectorAll<HTMLElement>('[data-item]').forEach((node) => {
        const id = node.dataset.item as string;
        if (reported.current.has(id)) return;
        const r = (node.querySelector('.pfeed__img') ?? node).getBoundingClientRect();
        // 量不到高度時（測試環境沒有排版）當作都看得到；否則圖的中間要在畫面裡才算
        const half = (r.top + r.bottom) / 2;
        if (!view || view.height === 0 || (half >= view.top && half <= view.bottom)) fresh.push(id);
      });
      if (fresh.length === 0) return;
      fresh.forEach((id) => reported.current.add(id));
      seenRef.current?.(fresh);
    };
    check();
    const target: HTMLElement | Window = box ?? window;
    target.addEventListener('scroll', check, { passive: true });
    return () => target.removeEventListener('scroll', check);
  }, [posts.length]);

  if (posts.length === 0) return <div className="empty" ref={root}>{S.emptyList}</div>;
  return (
    <div className="pfeed" ref={root}>
      {posts.map((p) => {
        const src = avatarUrl(p.avatar);
        return (
          <article key={p.id} className="pfeed__post" data-item={p.itemId}>
            <header className="pfeed__head">
              <span className="pfeed__avatar" style={src ? undefined : { background: 'hsl(' + ((p.author.length * 71 + p.likes) % 360) + ' 42% 60%)' }}>
                {src ? <img src={src} alt="" draggable={false} /> : p.author.slice(0, 1)}
              </span>
              <span className="pfeed__who">
                <span className="pfeed__author">{p.handle ?? p.author}</span>
                <span className="pfeed__when">{p.sponsored ? S.sponsored : p.when}</span>
              </span>
              <span className="pfeed__more" aria-hidden="true">···</span>
            </header>
            <ImageBlock image={p.image} className="pfeed__img" onZoom={onZoom} />
            <div className="pfeed__actions" aria-hidden="true">
              <span>♡</span>
              <span>◌</span>
              <span>➤</span>
            </div>
            <div className="pfeed__likes">{compact(p.likes)} {S.feedLikes}</div>
            <p className="pfeed__text">
              <b>{p.handle ?? p.author}</b>
              {p.text}
            </p>
            <div className="pfeed__comments">{compact(p.comments)} {S.feedComments}</div>
          </article>
        );
      })}
    </div>
  );
}
