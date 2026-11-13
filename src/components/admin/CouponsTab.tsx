import { useRef, useState, type FormEvent } from 'react';
import * as api from '../../lib/api';
import { formatPhone } from '../../lib/rules';
import { describePrize, formatDate, formatDateTime } from '../../lib/wheel';
import type { CouponStatus, Settings } from '../../types';

const STATUS: Record<CouponStatus, { text: string; tone: 'ok' | 'warn' | 'bad' }> = {
  valid: { text: 'Хүчинтэй — ашиглаж болно', tone: 'ok' },
  redeemed: { text: 'Аль хэдийн ашигласан', tone: 'warn' },
  expired: { text: 'Хугацаа нь дууссан', tone: 'bad' },
  not_found: { text: 'Ийм код олдсонгүй', tone: 'bad' },
};

/** Staff type in a customer's code, see whether it's good, and mark it as used. */
export function CouponsTab({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<api.CouponLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(action: 'check' | 'redeem') {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = action === 'check' ? await api.findCoupon(code) : await api.redeemCoupon(code);
      setResult(res);
      if (action === 'redeem') onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа.');
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run('check');
  }

  const r = result?.record;
  const status = result ? STATUS[result.status] : null;

  return (
    <div className="lw-coupons">
      <form className="lw-coupon-form" onSubmit={submit}>
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setResult(null);
          }}
          placeholder={`${settings.couponPrefix || 'LUCKY'}-XXXXXXXX`}
          aria-label="Купон код"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button className="btn primary" type="submit" disabled={busy || !code.trim()}>Шалгах</button>
      </form>
      <p className="muted lw-form-note">Үйлчлүүлэгчийн кодыг оруулаад шалгана уу. Хүчинтэй бол «Ашигласан гэж тэмдэглэх» дарж нэг удаа ашиглагдсаныг баталгаажуулна.</p>

      {error && <p className="lw-login-error" role="alert">{error}</p>}

      {result && status && (
        <div className={`lw-coupon-card tone-${status.tone}`} aria-live="polite">
          <div className="lw-coupon-status">{status.text}</div>
          {r && (
            <dl className="lw-coupon-details">
              <div><dt>Код</dt><dd><code>{r.code}</code></dd></div>
              <div><dt>Шагнал</dt><dd>{r.label} ({describePrize(r, settings.currency, settings.currencyPosition)})</dd></div>
              {r.name && <div><dt>Нэр</dt><dd>{r.name}</dd></div>}
              <div><dt>Утас</dt><dd><a className="lw-tel" href={`tel:+976${r.phone}`}>{formatPhone(r.phone)}</a></dd></div>
              <div><dt>Хожсон</dt><dd>{formatDateTime(r.at)}</dd></div>
              <div><dt>Дуусах хугацаа</dt><dd>{r.expiresAt ? formatDate(r.expiresAt) : '—'}</dd></div>
              {r.redeemedAt && <div><dt>Ашигласан</dt><dd>{formatDateTime(r.redeemedAt)}</dd></div>}
            </dl>
          )}
          {result.status === 'valid' && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                if (confirm(`${r?.code} кодыг ашигласан гэж тэмдэглэх үү? Дахин ашиглах боломжгүй болно.`)) run('redeem');
              }}
            >
              Ашигласан гэж тэмдэглэх
            </button>
          )}
          {result.status !== 'valid' && (
            <button
              className="btn ghost"
              onClick={() => {
                setCode('');
                setResult(null);
                inputRef.current?.focus();
              }}
            >
              Өөр код шалгах
            </button>
          )}
        </div>
      )}
    </div>
  );
}
