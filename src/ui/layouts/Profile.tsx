import { avatarUrl } from '../assets';
import { S } from '../strings';
import type { ChatProfile } from '../types';
import type { ZoomFn } from './Chat';

interface Props {
  profile: ChatProfile;
  onMessage(): void;
  onCall(): void;
  onZoom?: ZoomFn;
}

/** Link 的個人頁面：完整的頭貼照片、私訊、通話、自介 */
export function Profile({ profile, onMessage, onCall, onZoom }: Props) {
  const src = avatarUrl(profile.avatar);
  return (
    <article className="profile">
      {src ? (
        <button className="profile__photo" onClick={() => onZoom?.({ src, alt: profile.name })} aria-label={S.zoomOpen + '：' + profile.name}>
          <img src={src} alt="" draggable={false} />
        </button>
      ) : (
        <div className="profile__photo profile__photo--empty" aria-hidden="true">{profile.name.slice(0, 1)}</div>
      )}
      <h2 className="profile__name">{profile.name}</h2>
      <div className="profile__actions">
        <button onClick={onMessage} disabled={!profile.threadId}>
          <span className="profile__glyph profile__glyph--msg" aria-hidden="true" />
          {S.profileMessage}
        </button>
        <button onClick={onCall}>
          <span className="profile__glyph profile__glyph--call" aria-hidden="true" />
          {S.profileCall}
        </button>
      </div>
      {profile.bio && (
        <section className="profile__bio">
          <h3>{S.profileBio}</h3>
          {profile.bio.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </section>
      )}
    </article>
  );
}
