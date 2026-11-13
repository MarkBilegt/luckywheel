import confetti from 'canvas-confetti';
import { useEffect, useMemo, type CSSProperties } from 'react';
import type { BgEffect, Design, WinEffect } from '../types';

/** Every font here covers Mongolian Cyrillic, including Ө and Ү. */
export const FONTS: Record<string, string> = {
  system: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  Montserrat: "'Montserrat', sans-serif",
  Roboto: "'Roboto', sans-serif",
  Nunito: "'Nunito', sans-serif",
  Rubik: "'Rubik', sans-serif",
  Comfortaa: "'Comfortaa', cursive",
  Lobster: "'Lobster', cursive",
};

/** Loads a Google Font once, when it's first chosen. */
export function useGoogleFont(name: string) {
  useEffect(() => {
    if (!name || name === 'system' || !FONTS[name]) return;
    const id = `lw-font-${name}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;600;800&display=swap`;
    document.head.appendChild(link);
  }, [name]);
}

/** Admin-supplied CSS, injected while the wheel is on screen. */
export function CustomCss({ css }: { css: string }) {
  if (!css.trim()) return null;
  return <style>{css}</style>;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function playWinEffect(effect: WinEffect) {
  if (effect === 'none' || prefersReducedMotion()) return;
  const z = 10001;
  if (effect === 'confetti') {
    const burst = (x: number) => confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x, y: 0.6 }, zIndex: z });
    burst(0.3);
    setTimeout(() => burst(0.7), 200);
  } else if (effect === 'stars') {
    const opts = { spread: 360, ticks: 70, gravity: 0, decay: 0.94, startVelocity: 25, shapes: ['star' as const], colors: ['#ffe400', '#ffbd00', '#e89400', '#ffca6c', '#fdffb8'], zIndex: z };
    [0, 120, 240].forEach((d) =>
      setTimeout(() => {
        confetti({ ...opts, particleCount: 40, scalar: 1.2, origin: { x: 0.5, y: 0.45 } });
        confetti({ ...opts, particleCount: 15, scalar: 0.75, origin: { x: 0.5, y: 0.45 } });
      }, d),
    );
  } else if (effect === 'fireworks') {
    const end = Date.now() + 2500;
    const timer = setInterval(() => {
      if (Date.now() > end) return clearInterval(timer);
      confetti({
        particleCount: 45, startVelocity: 30, spread: 360, ticks: 60, zIndex: z,
        origin: { x: 0.1 + Math.random() * 0.8, y: Math.random() * 0.5 },
      });
    }, 250);
  }
}

const GLYPH: Record<Exclude<BgEffect, 'none'>, string> = { snow: '❄', stars: '✦', bubbles: '', hearts: '❤' };

/** Full-screen ambient animation behind the popup. */
export function BackgroundEffect({ effect }: { effect: BgEffect }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 8 + Math.random() * 18,
        delay: -Math.random() * 12,
        duration: 7 + Math.random() * 9,
      })),
    [],
  );
  if (effect === 'none' || prefersReducedMotion()) return null;
  return (
    <div className={`lw-bg-effect lw-bg-effect--${effect}`} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            top: effect === 'stars' ? `${p.top}%` : undefined,
            fontSize: p.size,
            width: effect === 'bubbles' ? p.size * 1.4 : undefined,
            height: effect === 'bubbles' ? p.size * 1.4 : undefined,
            animationDelay: `${p.delay}s`,
            animationDuration: `${effect === 'stars' ? p.duration / 3 : p.duration}s`,
          }}
        >
          {GLYPH[effect]}
        </span>
      ))}
    </div>
  );
}

/** CSS custom properties that theme the popup from the design settings. */
export function themeVars(d: Design): CSSProperties {
  const bg = d.bgImageUrl
    ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${d.bgImageUrl.replace(/"/g, '%22')}") center / cover, ${d.bgColor}`
    : `radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 60%), ${d.bgColor}`;
  return {
    '--lw-bg': bg,
    '--lw-text': d.textColor,
    '--lw-title': d.titleColor,
    '--lw-btn': d.buttonColor,
    '--lw-btn-text': d.buttonTextColor,
    '--lw-accent': d.pointerColor,
    '--lw-size': `${Math.max(240, Math.min(560, d.wheelSize))}px`,
    fontFamily: FONTS[d.fontFamily] ?? FONTS.system,
  } as CSSProperties;
}
