import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { validateInput } from '../lib/api';
import { describePrize, fillTemplate, formatDate, pointerAngle, targetRotation } from '../lib/wheel';
import type { PublicConfig, SpinInput, SpinRecord, SpinResult } from '../types';
import { CustomCss, playWinEffect, prefersReducedMotion, useGoogleFont } from './effects';
import { Wheel } from './Wheel';

type Phase = 'form' | 'spinning' | 'result';

interface SpinPanelProps {
  config: PublicConfig;
  /** Asks the server for a prize (or runs a local test spin in the admin). */
  onSpin: (input: SpinInput, consent: boolean) => Promise<SpinResult>;
  /** Admin preview: shows a badge; spins are not recorded. */
  preview?: boolean;
  /** Shows a close button (used by the admin preview window). */
  onClose?: () => void;
}

/** Wheel + signup form + result. Used by the public page and the admin preview. */
export function SpinPanel({ config, onSpin, preview, onClose }: SpinPanelProps) {
  const { settings, design, segments } = config;
  useGoogleFont(design.fontFamily);

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Freeze segments while spinning so an admin edit in another tab can't shift the landing slice.
  const [frozen, setFrozen] = useState(segments);
  const wheelSegments = phase === 'form' ? segments : frozen;

  const half = design.wheelStyle === 'half';
  const pointer = half ? 'right' : design.pointerPosition;
  const duration = prefersReducedMotion() ? 1.2 : settings.spinDurationSec;

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'spinning') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (phase !== 'form' || busy) return;
    const input = { name, phone };
    // Quick check here for instant feedback; the server checks again (plus spin limits).
    const problem = validateInput(input, settings, agreed);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);

    try {
      // The server returns the wheel it picked from, so we always land on the right slice
      // even if the admin changed the prizes after this page loaded.
      const { segments: used, segmentIndex, record } = await onSpin(input, agreed);
      setFrozen(used);
      setResult(record);
      setPhase('spinning');
      const turns = Math.max(3, Math.round(duration * 1.2));
      // Next frame so the transition is applied before the rotation changes.
      requestAnimationFrame(() =>
        setRotation((r) => targetRotation(r, segmentIndex, used.length, turns, pointerAngle(pointer))),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  function handleSpinEnd() {
    if (phase !== 'spinning') return;
    setPhase('result');
    if (result?.code) playWinEffect(design.winEffect);
  }

  function reset() {
    setPhase('form');
    setResult(null);
    setAgreed(false);
    setName('');
    setPhone('');
    setTimeout(() => firstFieldRef.current?.focus(), 0);
  }

  async function copyCode() {
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = result.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const won = !!result?.code;

  return (
    <div
      className={`lw-panel ${onClose ? 'lw-panel--modal' : 'lw-panel--page'} ${half ? 'is-half' : ''}`}
      role={onClose ? 'dialog' : 'region'}
      aria-modal={onClose ? true : undefined}
      aria-labelledby="lw-title"
    >
      <CustomCss css={design.customCss} />
      {preview && <span className="lw-preview-badge">Туршилт — эргүүлэлт хадгалагдахгүй</span>}

      {onClose && (
        <button type="button" className="lw-close" onClick={onClose} disabled={phase === 'spinning'} aria-label="Хаах">
          ×
        </button>
      )}

      <div className="lw-panel-wheel">
        <Wheel
          segments={wheelSegments}
          rotation={rotation}
          durationSec={duration}
          spinning={phase === 'spinning'}
          onSpinEnd={handleSpinEnd}
          look={design}
          pointer={pointer}
        />
      </div>

      <div className="lw-panel-body" aria-live="polite">
        {phase !== 'result' || !result ? (
          <>
            <h1 id="lw-title" className="lw-title">{settings.title}</h1>
            <p className="lw-desc">{settings.description}</p>
            <form className="lw-form" onSubmit={handleSubmit} noValidate>
              {settings.nameField !== 'off' && (
                <input
                  ref={firstFieldRef}
                  type="text"
                  placeholder={settings.nameField === 'required' ? 'Таны нэр *' : 'Таны нэр'}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  disabled={phase !== 'form'}
                  autoComplete="name"
                  aria-label="Таны нэр"
                  required={settings.nameField === 'required'}
                />
              )}
              <input
                ref={settings.nameField === 'off' ? firstFieldRef : undefined}
                type="tel"
                inputMode="tel"
                placeholder="Утасны дугаар * (9911-2233)"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                disabled={phase !== 'form'}
                autoComplete="tel"
                aria-label="Утасны дугаар"
                aria-invalid={!!error}
                maxLength={20}
                required
              />
              {settings.gdprEnabled && (
                <label className="lw-gdpr">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      setError(null);
                    }}
                    disabled={phase !== 'form'}
                  />
                  <span>{gdprText(settings.gdprMessage, settings.gdprLinkText, settings.gdprLinkUrl)}</span>
                </label>
              )}
              {error && <p className="lw-error" role="alert">{error}</p>}
              <button type="submit" className="lw-spin-btn" disabled={phase !== 'form' || busy}>
                {phase === 'spinning' ? 'Эргэж байна…' : busy ? 'Түр хүлээнэ үү…' : settings.buttonText}
              </button>
            </form>
          </>
        ) : (
          <div className={`lw-result ${won ? 'is-win' : 'is-lose'}`}>
            <div className="lw-result-icon" aria-hidden="true">{won ? '🎉' : '🍀'}</div>
            <h1 id="lw-title" className="lw-title">{won ? settings.winTitle : settings.loseTitle}</h1>
            <p className="lw-desc">
              {won
                ? fillTemplate(settings.winMessage, {
                    prize: describePrize(result, settings.currency, settings.currencyPosition),
                    expiry: result.expiresAt ? formatDate(result.expiresAt) : '',
                    name: result.name || 'найз минь',
                  })
                : fillTemplate(settings.loseMessage, { name: result.name || 'найз минь' })}
            </p>
            {won && (
              <div className="lw-code">
                <code>{result.code}</code>
                <button type="button" onClick={copyCode}>{copied ? 'Хуулсан!' : 'Хуулах'}</button>
              </div>
            )}
            <button type="button" className="lw-spin-btn" onClick={reset}>
              {preview ? 'Дахин эргүүлэх' : 'Эхлэл рүү буцах'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders the consent text with {terms} turned into a link. Only http(s), relative or # links are allowed. */
function gdprText(message: string, linkText: string, url: string): ReactNode {
  const safeUrl = /^(https?:\/\/|\/|#)/i.test(url.trim()) ? url.trim() : '';
  const link = safeUrl ? (
    <a href={safeUrl} target={safeUrl.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">
      {linkText}
    </a>
  ) : (
    linkText
  );
  const parts = message.split('{terms}');
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={i}>{link}</span>, p]));
}
