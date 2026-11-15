import { useEffect, useRef, useState } from 'react';
import { S } from '../strings';
import type { GalleryItem } from '../types';
import { ImageBlock } from './Chat';

/** 縮圖格子 */
export function GalleryGrid({ items, onOpen }: { items: GalleryItem[]; onOpen(id: string): void }) {
  if (items.length === 0) return <div className="empty">{S.emptyList}</div>;
  return (
    <div className="gallery">
      {items.map((it) => (
        <button key={it.id} className="gallery__cell" onClick={() => onOpen(it.id)} aria-label={it.image.description}>
          <ImageBlock image={it.image} className="gallery__thumb" />
        </button>
      ))}
    </div>
  );
}

interface ViewerProps {
  items: GalleryItem[];
  currentId: string;
  onGo(id: string): void;
}

/** 滑超過這麼多（像素）才算換一張 */
const SWIPE = 44;

/**
 * 大圖：圖片、時間、說明。左右滑換上一張、下一張（電腦上可以按兩側的箭頭），
 * 下方是一排縮圖，目前這張會亮起來並捲到中間，點縮圖直接跳過去。
 */
export function GalleryViewer({ items, currentId, onGo }: ViewerProps) {
  const index = items.findIndex((it) => it.id === currentId);
  const item = items[index];
  const prev = items[index - 1];
  const next = items[index + 1];
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  // 換了一張：把縮圖列捲到讓目前這張在中間。只捲這一列，不動外層
  useEffect(() => {
    const box = strip.current;
    const cell = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !cell) return;
    const left = cell.offsetLeft - (box.clientWidth - cell.offsetWidth) / 2;
    if (typeof box.scrollTo === 'function') box.scrollTo({ left, behavior: 'smooth' });
    else box.scrollLeft = left;
  }, [currentId]);

  if (!item) return <div className="empty">{S.emptyList}</div>;

  const move = (x: number, y: number) => {
    if (!start.current) return;
    const dx = x - start.current.x;
    // 主要是上下滑的話不理它
    if (Math.abs(dx) < Math.abs(y - start.current.y)) return;
    // 已經是第一張或最後一張，往外拉只會跟一點點
    setDrag((dx > 0 && !prev) || (dx < 0 && !next) ? dx / 4 : dx);
  };
  const end = (x: number, y: number) => {
    const from = start.current;
    start.current = null;
    setDrag(0);
    if (!from) return;
    const dx = x - from.x;
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(y - from.y)) return;
    if (dx < 0 && next) onGo(next.id);
    if (dx > 0 && prev) onGo(prev.id);
  };

  return (
    <div className="viewer">
      <div
        className="viewer__stage"
        // 這裡的左右滑是換照片，不要讓外層當成「往右滑返回」
        onTouchStart={(e) => {
          e.stopPropagation();
          const t = e.touches[0];
          if (t) start.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) move(t.clientX, t.clientY);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          const t = e.changedTouches[0];
          if (t) end(t.clientX, t.clientY);
        }}
      >
        <div className="viewer__slide" style={drag ? { transform: 'translateX(' + drag + 'px)', transition: 'none' } : undefined}>
          <ImageBlock key={item.id} image={item.image} className="viewer__img" full />
        </div>
        <button className="viewer__arrow viewer__arrow--prev" disabled={!prev} onClick={() => prev && onGo(prev.id)} aria-label={S.prev}>‹</button>
        <button className="viewer__arrow viewer__arrow--next" disabled={!next} onClick={() => next && onGo(next.id)} aria-label={S.next}>›</button>
      </div>
      <div className="viewer__info">
        <div className="viewer__when">
          {item.when}
          <span className="viewer__count">{index + 1} / {items.length}</span>
        </div>
        {item.caption && <div className="viewer__caption">{item.caption}</div>}
      </div>
      <div className="viewer__strip" ref={strip} role="tablist" aria-label={S.thumbs}>
        {items.map((it) => (
          <button
            key={it.id}
            role="tab"
            aria-selected={it.id === currentId}
            aria-current={it.id === currentId}
            aria-label={it.image.description}
            className={'viewer__thumb' + (it.id === currentId ? ' viewer__thumb--on' : '')}
            onClick={() => it.id !== currentId && onGo(it.id)}
          >
            <ImageBlock image={it.image} className="viewer__thumb-img" />
          </button>
        ))}
      </div>
    </div>
  );
}
