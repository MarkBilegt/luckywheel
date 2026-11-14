import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { validateInput } from '../lib/api';
import { describePrize, fillTemplate, formatDate, pointerAngle, targetRotation, tickTimes } from '../lib/wheel';
import type { PublicConfig, SpinInput, SpinRecord, SpinResult } from '../types';
import { playWin, scheduleTicks, unlockAudio } from '../lib/sound';
import { CustomCss, playWinEffect, prefersReducedMotion, useGoogleFont } from './effects';
import { Wheel } from './Wheel';

/**
 * form -> spinning (wheel flies to the centre of the screen and grows) -> landed (winner glows, badge pops)
 * -> result (wheel glides back, result card appears).
 */
type Phase = 'form' | 'spinning' | 'landed' | 'result';

/** How long each stage lasts (ms). */
const ZOOM_MS = 800; // fly in / fly back (matches the CSS transition)
const SPIN_DELAY_MS = 350; // let the wheel start flying before it starts turning
const HOLD_WIN_MS = 1900; // admire the winning slice up close
const HOLD_LOSE_MS = 1300;

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
  const rotationRef = useRef(0);
  const cancelTicks = useRef<() => void>(() => {});
  const [result, setResult] = useState<SpinRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  /** Transform that brings the wheel to the middle of the screen, or null when it sits in its normal place. */
  const [zoom, setZoom] = useState<{ transform: string; origin: string } | null>(null);
  /** True from the start of the fly-in until the fly-back has finished (lifts the wheel above everything). */
  const [lifted, setLifted] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const wheelBoxRef = useRef<HTMLDivElement>(null);
  const landingIndex = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      cancelTicks.current();
    },
    [],
  );

  // Freeze segments while spinning so an admin edit in another tab can't shift the landing slice.
  const [frozen, setFrozen] = useState(segments);
  const wheelSegments = phase === 'form' ? segments : frozen;

  const half = design.wheelStyle === 'half';
  const pointer = half ? 'right' : design.pointerPosition;
  const reduced = prefersReducedMotion();
  const duration = reduced ? 1.2 : settings.spinDurationSec;
  const wheelBusy = phase === 'spinning' || phase === 'landed';

  // No scrolling while the wheel is up close (its position is worked out for the current scroll).
  useEffect(() => {
    if (!lifted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lifted]);

  /**
   * Waits until the browser has really started the spin animation (it begins a frame or two after
   * we set the new rotation), then schedules every tick relative to that start time.
   */
  function syncTicksToSpin(times: number[], attempt = 0) {
    const rotor = wheelBoxRef.current?.querySelector<HTMLElement>('.lw-wheel-rotor');
    const anim = rotor
      ?.getAnimations()
      .find((a) => (a as CSSTransition).transitionProperty === 'transform');
    const start = anim?.startTime;
    if (start == null) {
      // Not started yet: check again next frame (give up after ~1s and use "now").
      if (attempt < 60) requestAnimationFrame(() => syncTicksToSpin(times, attempt + 1));
      else scheduleAll(times, performance.now());
      return;
    }
    scheduleAll(times, typeof start === 'number' ? start : performance.now());
  }

  /** Sound on the audio clock + a little pointer kick on screen, both at startMs + t. */
  function scheduleAll(times: number[], startMs: number) {
    cancelTicks.current();
    const stopSound = settings.soundEnabled ? scheduleTicks(times, startMs) : () => {};

    const flap = wheelBoxRef.current?.querySelector<SVGElement>('.lw-pointer svg');
    const kickTimers: number[] = [];
    if (flap && !reduced) {
      times.forEach((t, i) => {
        const gapMs = ((times[i + 1] ?? t + 0.3) - t) * 1000;
        const delay = startMs + t * 1000 - performance.now();
        if (delay < 0) return;
        kickTimers.push(
          window.setTimeout(() => {
            flap.animate(
              [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-18deg)', offset: 0.25 }, { transform: 'rotate(0deg)' }],
              { duration: Math.max(60, Math.min(220, gapMs * 0.85)), easing: 'ease-out' },
            );
          }, delay),
        );
      });
    }
    cancelTicks.current = () => {
      stopSound();
      kickTimers.forEach(clearTimeout);
    };
  }

  /** Works out the move + scale that puts the wheel's centre in the middle of the screen, big. */
  function flyIn() {
    if (reduced) return;
    const box = wheelBoxRef.current;
    const wheel = box?.querySelector<HTMLElement>('.lw-wheel');
    if (!box || !wheel) return;
    const b = box.getBoundingClientRect();
    const w = wheel.getBoundingClientRect();
    const cx = w.left + w.width / 2;
    const cy = w.top + w.height / 2;
    // Leave room for the pointer, which sticks out past the rim.
    const target = Math.min(window.innerWidth * 0.88, window.innerHeight * 0.76);
    const scale = Math.max(1.05, Math.min(2.4, target / w.width));
    setLifted(true);
    setZoom({
      origin: `${cx - b.left}px ${cy - b.top}px`,
      transform: `translate(${window.innerWidth / 2 - cx}px, ${window.innerHeight / 2 - cy}px) scale(${scale})`,
    });
  }

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'spinning' && phase !== 'landed') onClose();
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
    // Must happen inside the click itself, or browsers block the sound.
    if (settings.soundEnabled) unlockAudio(settings.soundVolume / 100);

    try {
      // The server returns the wheel it picked from, so we always land on the right slice
      // even if the admin changed the prizes after this page loaded.
      const { segments: used, segmentIndex, record } = await onSpin(input, agreed);
      setFrozen(used);
      setResult(record);
      setWinnerIndex(null);
      landingIndex.current = segmentIndex;
      setPhase('spinning');
      flyIn();
      const turns = Math.max(3, Math.round(duration * 1.2));
      // Start turning once the spin transition is applied and the wheel is on its way to the centre.
      requestAnimationFrame(() =>
        later(
          () => {
            const from = rotationRef.current;
            const to = targetRotation(from, segmentIndex, used.length, turns, pointerAngle(pointer));
            rotationRef.current = to;
            setRotation(to);
            // A tick (sound + pointer kick) each time a slice divider passes the pointer. The times
            // come from the same speed curve as the animation and are anchored to the moment the
            // browser actually started it, so they line up with what's on screen.
            const times = tickTimes(from, to, used.length, pointerAngle(pointer), duration);
            syncTicksToSpin(times);
          },
          reduced ? 0 : SPIN_DELAY_MS,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  function handleSpinEnd() {
    if (phase !== 'spinning') return;
    // Landed: light up the winning slice while the wheel is still big.
    setPhase('landed');
    setWinnerIndex(landingIndex.current);
    if (result?.code) {
      playWinEffect(design.winEffect);
      if (settings.soundEnabled) playWin();
    }

    const hold = reduced ? 400 : result?.code ? HOLD_WIN_MS : HOLD_LOSE_MS;
    later(() => {
      setZoom(null); // glide back to its place
      // Show the result once the wheel is home, so the layout doesn't shift under it mid-flight.
      later(
        () => {
          setLifted(false);
          setPhase('result');
        },
        reduced ? 0 : ZOOM_MS - 150,
      );
    }, hold);
  }

  function reset() {
    setPhase('form');
    setResult(null);
    setWinnerIndex(null);
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
      className={`lw-panel ${onClose ? 'lw-panel--modal' : 'lw-panel--page'} ${half ? 'is-half' : ''} ${lifted ? 'is-lifted' : ''}`}
      role={onClose ? 'dialog' : 'region'}
      aria-modal={onClose ? true : undefined}
      aria-labelledby="lw-title"
    >
      <CustomCss css={design.customCss} />
      {preview && <span className="lw-preview-badge">Туршилт — эргүүлэлт хадгалагдахгүй</span>}

      {onClose && (
        <button type="button" className="lw-close" onClick={onClose} disabled={wheelBusy} aria-label="Хаах">
          ×
        </button>
      )}

      {/* Dims the page and shows slow light rays while the wheel is up close. */}
      <div className={`lw-stage ${zoom ? 'is-on' : ''}`} aria-hidden="true">
        <div className="lw-stage-rays" />
      </div>

      <div
        ref={wheelBoxRef}
        className={`lw-panel-wheel ${lifted ? 'is-lifted' : ''} ${zoom ? 'is-zoomed' : ''}`}
        style={zoom ? { transform: zoom.transform, transformOrigin: zoom.origin } : undefined}
      >
        <Wheel
          segments={wheelSegments}
          rotation={rotation}
          durationSec={duration}
          spinning={phase === 'spinning'}
          onSpinEnd={handleSpinEnd}
          look={design}
          pointer={pointer}
          winnerIndex={winnerIndex}
          badge={
            // Only while it's up close (gone as soon as it starts flying back).
            phase === 'landed' && result && (zoom || reduced) ? (
              <span className={`lw-landed-badge ${result.code ? 'is-win' : 'is-lose'}`}>{result.label}</span>
            ) : null
          }
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
                {wheelBusy ? 'Эргэж байна…' : busy ? 'Түр хүлээнэ үү…' : settings.buttonText}
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
