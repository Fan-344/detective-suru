import { S } from '../strings';
import type { ListDetail, ListGroup } from '../types';
import { ImageBlock } from './Chat';
import type { ZoomFn } from './Chat';

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
                  {r.glyph ? <WeatherGlyph kind={r.glyph} /> : <span className={`row__dot ${r.unread ? 'row__dot--on' : ''}`} aria-hidden="true" />}
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

function WeatherGlyph({ kind }: { kind: 'rain' | 'clear' }) {
  return (
    <svg className={'wx wx--' + kind} viewBox="0 0 32 32" aria-hidden="true">
      {kind === 'rain' ? (
        <>
          <path d="M9.500 19a5 5 0 0 1-.500-9.900 6.500 6.500 0 0 1 12.600 1.500 4.200 4.200 0 0 1 .400 8.400z" fill="#9fb4c8" />
          <path d="M11 22.500l-1.500 4M16 22.500l-1.500 4M21 22.500l-1.500 4" stroke="#4d8fd6" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M21 6.500a9 9 0 1 0 5 15.500 8 8 0 0 1-5-15.500z" fill="#f2c64d" />
          <circle cx="9" cy="9" r="1" fill="#c9cdd6" />
          <circle cx="13" cy="24" r="1" fill="#c9cdd6" />
        </>
      )}
    </svg>
  );
}

/** 發票：畫成一張有鋸齒邊的單據。有什麼欄位就列什麼，內容都來自資料 */
function Receipt({ detail }: { detail: ListDetail }) {
  return (
    <article className="receipt">
      <div className="receipt__paper">
        <div className="receipt__head">{S.receiptHeader}</div>
        <h2 className="receipt__store">{detail.title}</h2>
        {detail.when && <div className="receipt__when">{detail.when}</div>}
        <div className="receipt__label">{S.receiptItems}</div>
        <ul className="receipt__items">
          {(detail.lines ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {detail.fields && (
          <dl className="receipt__fields">
            {detail.fields.map((f, i) => (
              <div key={i}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="receipt__barcode" aria-hidden="true" />
      </div>
    </article>
  );
}

export function DetailView({ detail, onZoom }: { detail: ListDetail; onZoom?: ZoomFn }) {
  if (detail.style === 'receipt') return <Receipt detail={detail} />;
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
      {detail.image && <ImageBlock image={detail.image} className="detail__img" onZoom={onZoom} />}
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
