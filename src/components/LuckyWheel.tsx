import { useEffect } from 'react';
import { previewSpin, spin } from '../lib/api';
import { toPublicConfig } from '../lib/rules';
import { usePublicWheel } from '../lib/useConfig';
import type { Config } from '../types';
import { BackgroundEffect, themeVars } from './effects';
import { SpinPanel } from './SpinPanel';

/** The public site: the wheel fills the whole page, themed from the admin's Design settings. */
export function WheelPage() {
  const { config, error, reload } = usePublicWheel();

  useEffect(() => {
    if (config) document.title = config.settings.title || 'Азын хүрд';
  }, [config]);

  if (!config) {
    return (
      <div className="lw-page lw-page--plain">
        <div className="lw-closed">
          {error ? (
            <>
              <h1 className="lw-title">Холбогдож чадсангүй</h1>
              <p className="lw-desc">{error}</p>
              <button type="button" className="lw-spin-btn" onClick={reload}>Дахин оролдох</button>
            </>
          ) : (
            <p className="lw-desc" aria-live="polite">Ачаалж байна…</p>
          )}
        </div>
      </div>
    );
  }

  const { settings, design, segments } = config;

  if (!settings.enabled || segments.length < 2) {
    return (
      <div className="lw-page" style={themeVars(design)}>
        <div className="lw-closed">
          <h1 className="lw-title">Удахгүй эргэн ирнэ</h1>
          <p className="lw-desc">Азын хүрд одоогоор идэвхгүй байна. Дараа дахин зочлоорой.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lw-page" style={themeVars(design)}>
      <BackgroundEffect effect={design.bgEffect} />
      <SpinPanel config={config} onSpin={spin} />
    </div>
  );
}

/** Admin preview of unsaved settings, in a window over the admin page. Spins are not recorded. */
export function PreviewModal({ config, onClose }: { config: Config; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="lw-overlay"
      style={themeVars(config.design)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !document.querySelector('.lw-wheel.is-spinning')) onClose();
      }}
    >
      <BackgroundEffect effect={config.design.bgEffect} />
      <SpinPanel config={toPublicConfig(config)} onSpin={(input) => previewSpin(config, input)} preview onClose={onClose} />
    </div>
  );
}
