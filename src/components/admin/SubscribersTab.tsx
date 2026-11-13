import { useEffect, useMemo, useState } from 'react';
import * as api from '../../lib/api';
import { formatPhone } from '../../lib/rules';
import { formatDate, formatDateTime } from '../../lib/wheel';
import type { Contact, SpinRecord } from '../../types';

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const preset = (days: number | null) => {
    if (days === null) return onChange('', '');
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(fmt(start), fmt(end));
  };
  return (
    <div className="lw-range">
      <label>Эхлэх <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} /></label>
      <label>Дуусах <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} /></label>
      <span className="lw-range-presets">
        <button type="button" onClick={() => preset(1)}>Өнөөдөр</button>
        <button type="button" onClick={() => preset(7)}>7 хоног</button>
        <button type="button" onClick={() => preset(30)}>30 хоног</button>
        <button type="button" onClick={() => preset(null)}>Бүх хугацаа</button>
      </span>
    </div>
  );
}

type CallFilter = 'all' | 'todo' | 'done';

/** Everyone who spun, as a call list: tap to call, tick when contacted, keep a short note. */
export function SubscribersTab({ spins, onChanged }: { spins: SpinRecord[]; onChanged: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<'people' | 'spins'>('people');
  const [callFilter, setCallFilter] = useState<CallFilter>('all');
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getContacts().then(
      (list) => setContacts(new Map(list.map((c) => [c.phone, c]))),
      (err) => setError(err.message),
    );
  }, [spins]);

  async function updateContact(phone: string, patch: Partial<Pick<Contact, 'contacted' | 'note'>>) {
    const before = contacts.get(phone) ?? { phone, contacted: false, note: '', updatedAt: null };
    const next = { ...before, ...patch };
    setContacts((m) => new Map(m).set(phone, next)); // show it straight away
    try {
      const saved = await api.saveContact(phone, next.contacted, next.note);
      setContacts((m) => new Map(m).set(phone, saved));
      setError(null);
    } catch (err) {
      setContacts((m) => new Map(m).set(phone, before));
      setError(err instanceof Error ? err.message : 'Хадгалж чадсангүй.');
    }
  }

  const ranged = useMemo(() => spins.filter((s) => api.inRange(s.at, from, to)), [spins, from, to]);
  const people = useMemo(() => api.subscribersFrom(ranged), [ranged]);

  const q = query.trim().toLowerCase().replace(/[\s-]/g, '');
  const matches = (name: string, phone: string, extra = '') =>
    !q || `${name.toLowerCase()} ${phone} ${extra.toLowerCase()}`.replace(/[\s-]/g, '').includes(q);

  const shownPeople = people.filter((p) => {
    const done = !!contacts.get(p.phone)?.contacted;
    if (callFilter === 'todo' && done) return false;
    if (callFilter === 'done' && !done) return false;
    return matches(p.name, p.phone, contacts.get(p.phone)?.note ?? '');
  });
  const shownSpins = ranged.filter((s) => matches(s.name, s.phone, s.code ?? ''));
  const todoCount = people.filter((p) => !contacts.get(p.phone)?.contacted).length;
  const stamp = `${from || 'ehlel'}_${to || 'odoo'}`;

  return (
    <div className="lw-log">
      <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="lw-log-actions">
        <div className="lw-seg-switch" role="group" aria-label="Харагдац">
          <button className={view === 'people' ? 'active' : ''} onClick={() => setView('people')}>Хүмүүс ({people.length})</button>
          <button className={view === 'spins' ? 'active' : ''} onClick={() => setView('spins')}>Бүх эргүүлэлт ({ranged.length})</button>
        </div>
        {view === 'people' && (
          <select className="lw-call-filter" value={callFilter} onChange={(e) => setCallFilter(e.target.value as CallFilter)} aria-label="Холбогдсон эсэх">
            <option value="all">Бүгд</option>
            <option value="todo">Холбогдоогүй ({todoCount})</option>
            <option value="done">Холбогдсон ({people.length - todoCount})</option>
          </select>
        )}
        <input className="lw-search" type="search" placeholder="Нэр, утас, код, тэмдэглэлээр хайх" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button
          className="btn ghost"
          disabled={!ranged.length}
          onClick={() =>
            view === 'people'
              ? api.downloadText(`utasnii_jagsaalt_${stamp}.csv`, api.subscribersToCSV(shownPeople, contacts))
              : api.downloadText(`ergeltuud_${stamp}.csv`, api.spinsToCSV(shownSpins))
          }
        >
          CSV татах
        </button>
        <button
          className="btn ghost danger"
          disabled={!spins.length}
          onClick={async () => {
            if (!confirm('Бүх хүн, эргүүлэлт, тэмдэглэлийг серверээс устгах уу? Дугаар бүрийн эргүүлэх эрх мөн шинэчлэгдэнэ. Буцаах боломжгүй.')) return;
            try {
              await api.clearSpins();
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Алдаа гарлаа.');
            }
            onChanged();
          }}
        >
          Бүгдийг устгах
        </button>
      </div>

      {error && <p className="lw-login-error" role="alert">{error}</p>}

      {ranged.length === 0 ? (
        <p className="muted empty">{spins.length ? 'Энэ хугацаанд эргүүлэлт алга.' : 'Одоогоор хэн ч эргүүлээгүй байна.'}</p>
      ) : (
        <div className="lw-seg-table-wrap">
          {view === 'people' ? (
            <table className="lw-seg-table lw-call-table">
              <thead>
                <tr><th>Холбогдсон</th><th>Нэр</th><th>Утас</th><th>Шагнал</th><th>Код</th><th>Эргүүлсэн</th><th>Тэмдэглэл</th></tr>
              </thead>
              <tbody>
                {shownPeople.map((p) => {
                  const c = contacts.get(p.phone);
                  return (
                    <tr key={p.phone} className={c?.contacted ? 'is-done' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          className="lw-call-check"
                          checked={!!c?.contacted}
                          onChange={(e) => updateContact(p.phone, { contacted: e.target.checked })}
                          aria-label={`${formatPhone(p.phone)} руу холбогдсон`}
                        />
                      </td>
                      <td>{p.name || <span className="muted">—</span>}</td>
                      <td className="nowrap"><a className="lw-tel" href={`tel:+976${p.phone}`}>{formatPhone(p.phone)}</a></td>
                      <td><span className={`pill ${p.lastCode ? 'win' : 'lose'}`}>{p.lastLabel}</span></td>
                      <td>{p.lastCode ? <code>{p.lastCode}</code> : <span className="muted">—</span>}</td>
                      <td className="nowrap">{formatDateTime(p.lastSpin)}{p.spins > 1 && <span className="muted"> ({p.spins} удаа)</span>}</td>
                      <td>
                        <NoteInput value={c?.note ?? ''} onSave={(note) => updateContact(p.phone, { note })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="lw-seg-table">
              <thead>
                <tr><th>Огноо</th><th>Нэр</th><th>Утас</th><th>Үр дүн</th><th>Код</th><th>Дуусах хугацаа</th><th>Төлөв</th></tr>
              </thead>
              <tbody>
                {shownSpins.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{formatDateTime(r.at)}</td>
                    <td>{r.name || <span className="muted">—</span>}</td>
                    <td className="nowrap"><a className="lw-tel" href={`tel:+976${r.phone}`}>{formatPhone(r.phone)}</a></td>
                    <td><span className={`pill ${r.code ? 'win' : 'lose'}`}>{r.label}</span></td>
                    <td>{r.code ? <code>{r.code}</code> : <span className="muted">—</span>}</td>
                    <td className="nowrap">{r.expiresAt ? formatDate(r.expiresAt) : '—'}</td>
                    <td className="nowrap">
                      {!r.code ? '—' : r.redeemedAt ? <span className="pill used">Ашигласан</span> : r.expiresAt && Date.parse(r.expiresAt) < Date.now() ? <span className="pill lose">Дууссан</span> : <span className="pill win">Хүчинтэй</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/** Saves when the field loses focus or Enter is pressed. */
function NoteInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="lw-note"
      value={text}
      maxLength={1000}
      placeholder="Тэмдэглэл нэмэх…"
      aria-label="Тэмдэглэл"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
