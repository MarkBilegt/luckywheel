import { PALETTES, probabilities, readableText } from '../../lib/wheel';
import type { Config, PrizeType, Segment } from '../../types';

export const MAX_SLICES = 20;

const PRIZE_TYPES: { value: PrizeType; label: string }[] = [
  { value: 'percent', label: '% хямдрал' },
  { value: 'fixed', label: 'Тогтмол дүнгийн хямдрал' },
  { value: 'free_shipping', label: 'Үнэгүй хүргэлт' },
  { value: 'cash', label: 'Мөнгөн шагнал' },
  { value: 'none', label: 'Юу ч үгүй (хожихгүй)' },
];

function newSegment(index: number): Segment {
  const base = Object.values(PALETTES)[0];
  const color = base[index % base.length];
  return { id: crypto.randomUUID(), label: 'Шинэ шагнал', type: 'percent', value: 5, color, textColor: readableText(color), weight: 10 };
}

export function PrizesTab({ draft, setDraft }: { draft: Config; setDraft: (fn: (d: Config) => Config) => void }) {
  const probs = probabilities(draft.segments);
  const { currency, currencyPosition } = draft.settings;

  const updateSeg = (id: string, patch: Partial<Segment>) =>
    setDraft((d) => ({ ...d, segments: d.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const moveSeg = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const segs = [...d.segments];
      const j = index + dir;
      if (j < 0 || j >= segs.length) return d;
      [segs[index], segs[j]] = [segs[j], segs[index]];
      return { ...d, segments: segs };
    });

  const removeSeg = (id: string) =>
    setDraft((d) => (d.segments.length <= 2 ? d : { ...d, segments: d.segments.filter((s) => s.id !== id) }));

  const addSeg = () =>
    setDraft((d) => (d.segments.length >= MAX_SLICES ? d : { ...d, segments: [...d.segments, newSegment(d.segments.length)] }));

  const autoColor = (name: string) =>
    setDraft((d) => {
      const pal = PALETTES[name];
      const n = d.segments.length;
      return {
        ...d,
        segments: d.segments.map((s, i) => {
          // The last slice touches the first, so skip a color that would match its neighbour.
          let c = pal[i % pal.length];
          if (i === n - 1 && i > 0 && c === pal[0]) c = pal[(i + 1) % pal.length];
          return { ...s, color: c, textColor: readableText(c) };
        }),
      };
    });

  return (
    <div>
      <div className="lw-palettes">
        <span className="lw-field-label">Автомат өнгө:</span>
        {Object.entries(PALETTES).map(([name, colors]) => (
          <button key={name} type="button" className="lw-palette" onClick={() => autoColor(name)} title={`«${name}» өнгөний багцыг хэрэглэх`}>
            <span className="swatches">{colors.slice(0, 5).map((c) => <i key={c} style={{ background: c }} />)}</span>
            {name}
          </button>
        ))}
      </div>
      <div className="lw-seg-table-wrap">
        <table className="lw-seg-table">
          <thead>
            <tr>
              <th>Дараалал</th>
              <th>Хүрдэн дээрх нэр</th>
              <th>Шагналын төрөл</th>
              <th>Утга</th>
              <th>Өнгө</th>
              <th>Жин</th>
              <th>Магадлал</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.segments.map((seg, i) => (
              <tr key={seg.id}>
                <td className="nowrap">
                  <button className="icon" onClick={() => moveSeg(i, -1)} disabled={i === 0} aria-label="Дээш зөөх">↑</button>
                  <button className="icon" onClick={() => moveSeg(i, 1)} disabled={i === draft.segments.length - 1} aria-label="Доош зөөх">↓</button>
                </td>
                <td>
                  <input value={seg.label} maxLength={22} onChange={(e) => updateSeg(seg.id, { label: e.target.value })} aria-label="Нэр" />
                </td>
                <td>
                  <select value={seg.type} onChange={(e) => updateSeg(seg.id, { type: e.target.value as PrizeType })} aria-label="Шагналын төрөл">
                    {PRIZE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td>
                  {seg.type === 'none' || seg.type === 'free_shipping' ? (
                    <span className="muted">—</span>
                  ) : (
                    <div className="with-unit">
                      {seg.type !== 'percent' && currencyPosition === 'before' && <span>{currency}</span>}
                      <input
                        type="number"
                        min={0}
                        max={seg.type === 'percent' ? 100 : undefined}
                        value={seg.value}
                        onChange={(e) => updateSeg(seg.id, { value: Number(e.target.value) })}
                        aria-label="Утга"
                      />
                      {seg.type === 'percent' ? <span>%</span> : currencyPosition === 'after' && <span>{currency}</span>}
                    </div>
                  )}
                </td>
                <td className="nowrap">
                  <input type="color" value={seg.color} onChange={(e) => updateSeg(seg.id, { color: e.target.value })} aria-label="Хэсгийн өнгө" />
                  <input type="color" value={seg.textColor} onChange={(e) => updateSeg(seg.id, { textColor: e.target.value })} aria-label="Текстийн өнгө" />
                </td>
                <td>
                  <input type="number" min={0} className="narrow" value={seg.weight} onChange={(e) => updateSeg(seg.id, { weight: Number(e.target.value) })} aria-label="Жин" />
                </td>
                <td className="nowrap">
                  <div className="lw-bar"><span style={{ width: `${probs[i] * 100}%`, background: seg.color }} /></div>
                  {(probs[i] * 100).toFixed(1)}%
                </td>
                <td>
                  <button className="icon danger" onClick={() => removeSeg(seg.id)} disabled={draft.segments.length <= 2} aria-label="Хэсэг устгах">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lw-seg-footer">
        <button className="btn ghost" onClick={addSeg} disabled={draft.segments.length >= MAX_SLICES}>
          + Хэсэг нэмэх ({draft.segments.length}/{MAX_SLICES})
        </button>
        <p className="muted">
          Жин нь харьцангуй: 20 жинтэй хэсэг 10 жинтэйгээс хоёр дахин их таарна. 0 гэвэл хүрдэн дээр харагдах ч хэзээ ч таарахгүй.
        </p>
      </div>
    </div>
  );
}
