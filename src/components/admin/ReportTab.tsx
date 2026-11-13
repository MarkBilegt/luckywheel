import { useMemo, useState } from 'react';
import { inRange } from '../../lib/api';
import type { Segment, SpinRecord } from '../../types';
import { DateRange } from './SubscribersTab';

export function ReportTab({ spins, segments }: { spins: SpinRecord[]; segments: Segment[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const ranged = useMemo(() => spins.filter((s) => inRange(s.at, from, to)), [spins, from, to]);

  const stats = useMemo(() => {
    // A subscriber counts in this range if their first-ever spin falls inside it.
    const firstSeen = new Map<string, string>();
    for (const s of spins) {
      const prev = firstSeen.get(s.phone);
      if (!prev || s.at < prev) firstSeen.set(s.phone, s.at);
    }
    const newSubs = [...firstSeen.values()].filter((at) => inRange(at, from, to)).length;
    const coupons = ranged.filter((s) => s.code).length;

    const byPrize = new Map<string, { label: string; color: string; count: number; coupons: number }>();
    for (const s of ranged) {
      const seg = segments.find((g) => g.id === s.segmentId);
      const key = seg ? seg.id : `old:${s.label}`;
      const row = byPrize.get(key) ?? { label: s.label, color: seg?.color ?? '#999999', count: 0, coupons: 0 };
      row.count++;
      if (s.code) row.coupons++;
      byPrize.set(key, row);
    }
    const prizes = [...byPrize.values()].sort((a, b) => b.count - a.count);
    return { newSubs, spins: ranged.length, coupons, winRate: ranged.length ? coupons / ranged.length : 0, prizes };
  }, [spins, ranged, segments, from, to]);

  const max = Math.max(1, ...stats.prizes.map((p) => p.count));

  return (
    <div className="lw-report">
      <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <div className="lw-kpis">
        <div><span>Шинэ дугаар</span><strong>{stats.newSubs}</strong></div>
        <div><span>Эргүүлэлт</span><strong>{stats.spins}</strong></div>
        <div><span>Олгосон купон</span><strong>{stats.coupons}</strong></div>
        <div><span>Хожсон хувь</span><strong>{(stats.winRate * 100).toFixed(0)}%</strong></div>
      </div>
      <h4 className="lw-report-h">Шагнал тус бүрээр</h4>
      {stats.prizes.length === 0 ? (
        <p className="muted empty">Энэ хугацаанд эргүүлэлт алга.</p>
      ) : (
        <table className="lw-seg-table">
          <thead>
            <tr><th>Шагнал</th><th>Таарсан тоо</th><th>Эзлэх хувь</th><th /></tr>
          </thead>
          <tbody>
            {stats.prizes.map((p) => (
              <tr key={p.label + p.color}>
                <td><span className="lw-dot" style={{ background: p.color }} />{p.label}</td>
                <td>{p.count}</td>
                <td>{((p.count / stats.spins) * 100).toFixed(1)}%</td>
                <td className="lw-report-bar"><span style={{ width: `${(p.count / max) * 100}%` }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
