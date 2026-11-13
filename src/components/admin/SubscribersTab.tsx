import { useMemo, useState } from 'react';
import { clearSpins, downloadText, inRange, spinsToCSV, subscribersFrom, subscribersToCSV } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/wheel';
import type { SpinRecord } from '../../types';

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

export function SubscribersTab({ spins, onChanged }: { spins: SpinRecord[]; onChanged: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<'subscribers' | 'spins'>('subscribers');
  const [query, setQuery] = useState('');

  const ranged = useMemo(() => spins.filter((s) => inRange(s.at, from, to)), [spins, from, to]);
  const subs = useMemo(() => subscribersFrom(ranged), [ranged]);
  const q = query.trim().toLowerCase();
  const shownSubs = q ? subs.filter((s) => `${s.email} ${s.name} ${s.phone}`.toLowerCase().includes(q)) : subs;
  const shownSpins = q ? ranged.filter((s) => `${s.email} ${s.name} ${s.phone} ${s.code ?? ''}`.toLowerCase().includes(q)) : ranged;
  const stamp = `${from || 'start'}_to_${to || 'today'}`;

  return (
    <div className="lw-log">
      <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="lw-log-actions">
        <div className="lw-seg-switch" role="group" aria-label="Харагдац">
          <button className={view === 'subscribers' ? 'active' : ''} onClick={() => setView('subscribers')}>Бүртгүүлэгчид ({subs.length})</button>
          <button className={view === 'spins' ? 'active' : ''} onClick={() => setView('spins')}>Бүх эргүүлэлт ({ranged.length})</button>
        </div>
        <input className="lw-search" type="search" placeholder="Имэйл, нэр, утас, кодоор хайх" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button
          className="btn ghost"
          disabled={!ranged.length}
          onClick={() =>
            view === 'subscribers'
              ? downloadText(`burtguulegchid_${stamp}.csv`, subscribersToCSV(subs))
              : downloadText(`ergeltuud_${stamp}.csv`, spinsToCSV(ranged))
          }
        >
          CSV татах
        </button>
        <button
          className="btn ghost danger"
          disabled={!spins.length}
          onClick={async () => {
            if (!confirm('Бүх бүртгүүлэгч, эргүүлэлтийг серверээс устгах уу? Имэйл бүрийн эргүүлэх эрх мөн шинэчлэгдэнэ. Буцаах боломжгүй.')) return;
            try {
              await clearSpins();
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Алдаа гарлаа.');
            }
            onChanged();
          }}
        >
          Бүгдийг устгах
        </button>
      </div>

      {ranged.length === 0 ? (
        <p className="muted empty">{spins.length ? 'Энэ хугацаанд эргүүлэлт алга.' : 'Одоогоор бүртгүүлэгч алга.'}</p>
      ) : (
        <div className="lw-seg-table-wrap">
          {view === 'subscribers' ? (
            <table className="lw-seg-table">
              <thead>
                <tr><th>Имэйл</th><th>Нэр</th><th>Утас</th><th>Бүртгүүлсэн</th><th>Эргүүлэлт</th><th>Сүүлийн үр дүн</th><th>Сүүлийн код</th></tr>
              </thead>
              <tbody>
                {shownSubs.map((s) => (
                  <tr key={s.email}>
                    <td>{s.email}</td>
                    <td>{s.name || <span className="muted">—</span>}</td>
                    <td className="nowrap">{s.phone || <span className="muted">—</span>}</td>
                    <td className="nowrap">{formatDateTime(s.firstSeen)}</td>
                    <td>{s.spins}</td>
                    <td><span className={`pill ${s.lastCode ? 'win' : 'lose'}`}>{s.lastLabel}</span></td>
                    <td>{s.lastCode ? <code>{s.lastCode}</code> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="lw-seg-table">
              <thead>
                <tr><th>Огноо</th><th>Имэйл</th><th>Үр дүн</th><th>Код</th><th>Дуусах хугацаа</th><th>Төлөв</th></tr>
              </thead>
              <tbody>
                {shownSpins.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{formatDateTime(r.at)}</td>
                    <td>{r.email}</td>
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
