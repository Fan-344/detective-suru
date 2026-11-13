import { S } from '../strings';
import type { ListDetail, ListGroup } from '../types';

/** 清單：依日期分組，點一列看詳情 */
export function ListView({ groups, onOpen }: { groups: ListGroup[]; onOpen(rowId: string): void }) {
  if (groups.length === 0) return <div className="empty">{S.emptyList}</div>;
  return (
    <div className="list">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="list__label">{g.label}</h2>
          <ul className="rows rows--card">
            {g.rows.map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => onOpen(r.id)}>
                  <span className={`row__dot ${r.unread ? 'row__dot--on' : ''}`} aria-hidden="true" />
                  <span className="row__main">
                    <span className="row__title">{r.title}</span>
                    {r.subtitle && <span className="row__sub">{r.subtitle}</span>}
                  </span>
                  {r.meta && <span className="row__meta">{r.meta}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DetailView({ detail }: { detail: ListDetail }) {
  return (
    <article className="detail">
      <h2 className="detail__title">{detail.title}</h2>
      {detail.when && <div className="detail__when">{detail.when}</div>}
      {detail.lines && (
        <div className="detail__body">
          {detail.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      {detail.fields && (
        <dl className="detail__fields">
          {detail.fields.map((f, i) => (
            <div key={i} className="detail__field">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
