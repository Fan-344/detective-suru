import { useState } from 'react';
import { ContactList } from '../layouts/Contacts';
import { S } from '../strings';
import type { CastData, ListGroup, ListRow } from '../types';

// 簡訊和電話：兩個看起來像真的 App 的畫面。內容全部來自資料（清單的每一列），
// 這裡只決定怎麼排：簡訊照寄件者併成一串，電話分成最近通話、聯絡人、鍵盤。

/** 寄件者的圓形頭像：取名字第一個字，顏色由名字算出來，每次都一樣 */
function Badge({ name }: { name: string }) {
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="comm-badge" style={{ background: `hsl(${hue} 34% 58%)` }} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

const rowsOf = (groups: ListGroup[]) => groups.flatMap((g) => g.rows);

// ───────── 簡訊 ─────────

interface SmsProps {
  groups: ListGroup[];
  /** 正開著哪個寄件者的那一串；null 是清單 */
  sender: string | null;
  onOpen(sender: string): void;
}

/** 簡訊：清單一列一個寄件者（同一個寄件者的併成一串），點進去是一則一則的泡泡 */
export function Sms({ groups, sender, onOpen }: SmsProps) {
  const [query, setQuery] = useState('');
  const rows = rowsOf(groups);
  // 照出現的先後併成一串一串，最新有動靜的排最上面
  const threads: { sender: string; rows: ListRow[] }[] = [];
  for (const r of rows) {
    const t = threads.find((x) => x.sender === r.title);
    if (t) t.rows.push(r);
    else threads.push({ sender: r.title, rows: [r] });
  }
  threads.sort((a, b) => rows.indexOf(b.rows[b.rows.length - 1]) - rows.indexOf(a.rows[a.rows.length - 1]));

  const open = threads.find((t) => t.sender === sender);
  if (open) {
    return (
      <div className="sms-thread">
        {open.rows.map((r) => (
          <div key={r.id} className="sms-msg">
            <div className="sms-msg__when">{r.detail.when}</div>
            <div className="sms-msg__bubble">
              {(r.detail.lines ?? []).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {r.detail.fields && r.detail.fields.length > 0 && (
                <dl className="sms-msg__fields">
                  {r.detail.fields.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        ))}
        <div className="sms-thread__end">{S.smsNoReply}</div>
      </div>
    );
  }

  const q = query.trim();
  const shown = q ? threads.filter((t) => t.sender.includes(q) || t.rows.some((r) => (r.detail.lines ?? []).some((l) => l.includes(q)))) : threads;
  return (
    <div className="list comm-list">
      <label className="comm-search">
        <Glyph d={ICON.search} size={16} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={S.search} aria-label={S.search} />
      </label>
      {shown.length === 0 && <div className="empty">{S.emptyList}</div>}
      {shown.map((t) => {
        const last = t.rows[t.rows.length - 1];
        return (
          <button key={t.sender} className="comm-row" onClick={() => onOpen(t.sender)} aria-label={t.sender}>
            <Badge name={t.sender} />
            <span className="comm-row__main">
              <span className="comm-row__top">
                <span className="comm-row__name">{t.sender}</span>
                <span className="comm-row__when">{last.detail.when}</span>
              </span>
              <span className="comm-row__preview">{(last.detail.lines ?? []).join(' ')}</span>
            </span>
            {t.rows.length > 1 && <span className="comm-row__count">{t.rows.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ───────── 電話 ─────────

type Direction = 'out' | 'in' | 'missed';

/** 這一筆是撥出、撥入還是未接：看資料裡「方向」那一欄；沒寫的話，內文寫未接就是未接 */
function directionOf(row: ListRow): Direction {
  const value = row.detail.fields?.find((f) => f.label === S.callDirectionField)?.value ?? '';
  const text = value || [row.subtitle ?? '', ...(row.detail.lines ?? [])].join(' ');
  if (text.includes(S.callMissed.slice(0, 2))) return 'missed';
  return text.includes(S.callOutWord) ? 'out' : 'in';
}

/** 自己畫的線條小圖示，不用字元（有些字元在手機上會變成彩色表情符號） */
function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  out: 'M7 17L17 7M9 7h8v8',
  in: 'M17 7L7 17M15 17H7V9',
  missed: 'M6 6l12 12M18 6L6 18',
  recent: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  contacts: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  keypad: 'M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01',
  delete: 'M9 6h11v12H9l-6-6zM13 10l4 4M17 10l-4 4',
} as const;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '＊', '0', '＃'];

interface DialerProps {
  groups: ListGroup[];
  cast: CastData;
  onOpenRow(id: string): void;
  onOpenContact(id: string): void;
  /** 按了撥號：Suru 不能講話，所以打不出去，只會跳一句提示 */
  onCall(): void;
}

/** 電話：底部三個分頁——最近通話（可只看未接）、聯絡人、鍵盤 */
export function Dialer({ groups, cast, onOpenRow, onOpenContact, onCall }: DialerProps) {
  const [tab, setTab] = useState<'recent' | 'contacts' | 'keypad'>('recent');
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [digits, setDigits] = useState('');
  // 最新的在最上面
  const rows = [...rowsOf(groups)].reverse();
  const recent = onlyMissed ? rows.filter((r) => directionOf(r) === 'missed') : rows;

  return (
    <div className="dialer">
      <div className="dialer__body">
        {tab === 'recent' && (
          <div className="list comm-list">
            <div className="segment" role="tablist" aria-label={S.callFilter}>
              <button role="tab" aria-selected={!onlyMissed} className={!onlyMissed ? 'on' : ''} onClick={() => setOnlyMissed(false)}>{S.callAll}</button>
              <button role="tab" aria-selected={onlyMissed} className={onlyMissed ? 'on' : ''} onClick={() => setOnlyMissed(true)}>{S.callMissedOnly}</button>
            </div>
            {recent.length === 0 && <div className="empty">{S.emptyList}</div>}
            {recent.map((r) => {
              const dir = directionOf(r);
              return (
                <button key={r.id} className={'comm-row comm-row--call comm-row--' + dir} onClick={() => onOpenRow(r.id)} aria-label={r.title}>
                  <span className="comm-row__dir"><Glyph d={ICON[dir]} size={16} /></span>
                  <span className="comm-row__main">
                    <span className="comm-row__name">{r.title}</span>
                    <span className="comm-row__preview">{r.subtitle ?? (r.detail.lines ?? []).join(' ')}</span>
                  </span>
                  <span className="comm-row__when">{r.detail.when ?? r.meta}</span>
                </button>
              );
            })}
          </div>
        )}
        {tab === 'contacts' && <ContactList cast={cast} onOpen={onOpenContact} />}
        {tab === 'keypad' && (
          <div className="keypad">
            <div className="keypad__digits" data-testid="keypad-digits">{digits || ' '}</div>
            <div className="keypad__keys">
              {KEYS.map((k) => (
                <button key={k} className="keypad__key" onClick={() => setDigits((d) => (d + k).slice(0, 16))} aria-label={k}>{k}</button>
              ))}
            </div>
            <div className="keypad__bottom">
              <span />
              <button className="keypad__call" onClick={onCall} aria-label={S.callDial}>
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                  <path d="M6.6 3.200c.5-.5 1.200-.5 1.700 0l2.300 2.900c.4.5.4 1.200 0 1.700l-1.300 1.500c1.100 2.100 2.800 3.800 4.900 4.900l1.500-1.300c.5-.4 1.200-.4 1.700 0l2.900 2.300c.5.5.5 1.200 0 1.700l-1.400 1.600c-.8.900-2.100 1.200-3.300.800C10.300 17.600 6.400 13.700 4.700 8.400c-.4-1.200-.1-2.500.8-3.300l1.100-1.900z" fill="#fff" />
                </svg>
              </button>
              <button className="keypad__del" onClick={() => setDigits((d) => d.slice(0, -1))} disabled={!digits} aria-label={S.callDelete}><Glyph d={ICON.delete} size={24} /></button>
            </div>
          </div>
        )}
      </div>
      <div className="dialer__tabs" role="tablist" aria-label={S.callTabs}>
        {(
          [
            ['recent', S.callRecent, ICON.recent],
            ['contacts', S.callContacts, ICON.contacts],
            ['keypad', S.callKeypad, ICON.keypad],
          ] as const
        ).map(([id, label, glyph]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Glyph d={glyph} size={22} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
