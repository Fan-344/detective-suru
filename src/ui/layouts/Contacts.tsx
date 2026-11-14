import type { CastData } from '../types';
import { Avatar } from './Chat';
import type { ZoomFn } from './Chat';

/** 聯絡人：最上面幾行背景，接著每個人一筆，點開看簡介 */
export function ContactList({ cast, onOpen }: { cast: CastData; onOpen(name: string): void }) {
  return (
    <div className="list">
      {cast.intro.length > 0 && (
        <div className="contacts__intro">
          {cast.intro.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      <ul className="rows rows--card">
        {cast.people.map((p) => (
          <li key={p.name}>
            <button className="row" onClick={() => onOpen(p.name)}>
              <Avatar name={p.name} avatar={p.avatar} />
              <span className="row__main">
                <span className="row__title">{p.name}</span>
              </span>
              <span className="row__chev" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContactCard({ person, onZoom }: { person: CastData['people'][number]; onZoom?: ZoomFn }) {
  return (
    <article className="contact">
      <span className="contact__avatar"><Avatar name={person.name} avatar={person.avatar} onZoom={onZoom} /></span>
      <h2 className="contact__name">{person.name}</h2>
      <p className="contact__brief">{person.brief}</p>
    </article>
  );
}
