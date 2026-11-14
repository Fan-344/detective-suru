import { S } from '../strings';
import type { FeedPost } from '../types';

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
