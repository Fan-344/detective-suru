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

/** 大圖：圖片、時間、說明，可以切上一張和下一張 */
export function GalleryViewer({ items, currentId, onGo }: ViewerProps) {
  const index = items.findIndex((it) => it.id === currentId);
  const item = items[index];
  if (!item) return <div className="empty">{S.emptyList}</div>;
  const prev = items[index - 1];
  const next = items[index + 1];
  return (
    <div className="viewer">
      <ImageBlock image={item.image} className="viewer__img" full />
      <div className="viewer__info">
        <div className="viewer__when">{item.when}</div>
        {item.caption && <div className="viewer__caption">{item.caption}</div>}
      </div>
      <div className="viewer__nav">
        <button disabled={!prev} onClick={() => prev && onGo(prev.id)}>{S.prev}</button>
        <span>{index + 1} / {items.length}</span>
        <button disabled={!next} onClick={() => next && onGo(next.id)}>{S.next}</button>
      </div>
    </div>
  );
}
