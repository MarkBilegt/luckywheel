import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import * as api from '../../lib/api';
import { probabilities } from '../../lib/wheel';
import type { Config, Design, Settings, SpinRecord } from '../../types';
import { useGoogleFont } from '../effects';
import { PreviewModal } from '../LuckyWheel';
import { Wheel } from '../Wheel';
import { CouponsTab } from './CouponsTab';
import { DesignTab } from './DesignTab';
import { PrizesTab } from './PrizesTab';
import { ReportTab } from './ReportTab';
import { SettingsTab } from './SettingsTab';
import { SubscribersTab } from './SubscribersTab';

type Tab = 'prizes' | 'settings' | 'design' | 'coupons' | 'subscribers' | 'report';

/** Checks the login session, then shows either the login form or the dashboard. */
export function AdminPanel() {
  const [session, setSession] = useState<api.Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Удирдлага — Азын хүрд';
    api.getSession().then(setSession, (err) => setError(err.message));
    const onUnauthorized = () => setSession({ authenticated: false });
    window.addEventListener('lw:unauthorized', onUnauthorized);
    return () => window.removeEventListener('lw:unauthorized', onUnauthorized);
  }, []);

  if (error) return <CenteredMessage title="Холбогдож чадсангүй" text={error} />;
  if (!session) return <CenteredMessage text="Ачаалж байна…" />;
  if (!session.authenticated) return <LoginScreen onLogin={setSession} />;
  return (
    <Dashboard
      onLogout={async () => {
        await api.logout().catch(() => undefined);
        setSession({ authenticated: false });
      }}
    />
  );
}

function CenteredMessage({ title, text }: { title?: string; text: string }) {
  return (
    <div className="lw-login">
      <div className="lw-login-card">
        {title && <h1>{title}</h1>}
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (s: api.Session) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Алдаа гарлаа.');
      setBusy(false);
    }
  }

  return (
    <div className="lw-login">
      <form className="lw-login-card" onSubmit={submit}>
        <h1>Удирдлага</h1>
        <p className="muted">Азын хүрдний тохиргоо руу нэвтрэх</p>
        <label className="lw-field">
          <span className="lw-field-label">Нууц үг</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {error && <p className="lw-login-error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy || !password}>{busy ? 'Түр хүлээнэ үү…' : 'Нэвтрэх'}</button>
        <a href="#/" className="lw-back-link">← Хүрд рүү очих</a>
      </form>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [saved, setSaved] = useState<Config | null>(null);
  const [draft, setDraftState] = useState<Config | null>(null);
  const [spins, setSpins] = useState<SpinRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('prizes');
  const [previewRot, setPreviewRot] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  useGoogleFont(draft?.design.fontFamily ?? 'system');

  const notify = useCallback((text: string, error = false) => {
    setFlash({ text, error });
    setTimeout(() => setFlash(null), error ? 5000 : 2200);
  }, []);

  const refreshSpins = useCallback(async () => {
    try {
      setSpins(await api.getSpins());
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Алдаа гарлаа.', true);
    }
  }, [notify]);

  useEffect(() => {
    Promise.all([api.getConfig(), api.getSpins()]).then(
      ([config, list]) => {
        setSaved(config);
        setDraftState(config);
        setSpins(list);
      },
      (err) => setLoadError(err.message),
    );
  }, []);

  // Fresh numbers whenever a data tab is opened.
  useEffect(() => {
    if (tab === 'subscribers' || tab === 'report') refreshSpins();
  }, [tab, refreshSpins]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const subscribers = useMemo(() => new Set(spins.map((s) => s.phone)).size, [spins]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (loadError) return <CenteredMessage title="Ачаалж чадсангүй" text={loadError} />;
  if (!draft || !saved) return <CenteredMessage text="Ачаалж байна…" />;

  const probs = probabilities(draft.segments);
  const winChance = draft.segments.reduce((sum, s, i) => (s.type !== 'none' ? sum + probs[i] : sum), 0);

  const setDraft = (fn: (d: Config) => Config) => setDraftState((d) => (d ? fn(d) : d));
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const setDesign = <K extends keyof Design>(key: K, value: Design[K]) =>
    setDraft((d) => ({ ...d, design: { ...d.design, [key]: value } }));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const stored = await api.saveConfig(draft);
      setSaved(stored);
      setDraftState(stored);
      notify('Хадгаллаа');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Хадгалж чадсангүй.', true);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm('Бүх шагнал, тохиргоо, загварыг анхны байдалд нь буцаах уу? Бүртгүүлэгчид устахгүй.')) return;
    try {
      const fresh = await api.resetConfig();
      setSaved(fresh);
      setDraftState(fresh);
      notify('Анхны тохиргоонд буцаалаа');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Алдаа гарлаа.', true);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prizes', label: 'Шагнал ба магадлал' },
    { id: 'settings', label: 'Дүрэм ба маягт' },
    { id: 'design', label: 'Загвар' },
    { id: 'coupons', label: 'Купон шалгах' },
    { id: 'subscribers', label: `Утасны жагсаалт (${subscribers})` },
    { id: 'report', label: 'Тайлан' },
  ];

  return (
    <div className="lw-admin">
      <header className="lw-admin-header">
        <div>
          <a href="#/" className="lw-back-link">← Хүрд рүү очих</a>
          <h1>Азын хүрдний тохиргоо</h1>
          <p>Шагнал, магадлал, дүрэм, загвараа тохируулна уу. Хадгалмагц хүрдний хуудас шинэчлэгдэнэ.</p>
        </div>
        <div className="lw-admin-actions">
          {flash && (
            <span className={`lw-flash ${flash.error ? 'is-error' : ''}`} role={flash.error ? 'alert' : 'status'}>
              {flash.text}
            </span>
          )}
          <button className="btn ghost" onClick={reset}>Анхны тохиргоо</button>
          <button className="btn ghost" disabled={!dirty || saving} onClick={() => setDraftState(saved)}>Цуцлах</button>
          <button className="btn primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Хадгалж байна…' : dirty ? 'Хадгалах' : 'Хадгалсан'}
          </button>
          <button className="btn ghost" onClick={onLogout}>Гарах</button>
        </div>
      </header>

      <div className="lw-admin-grid">
        <section className="lw-admin-preview card">
          <h3>Урьдчилан харах</h3>
          <Wheel
            segments={draft.segments}
            rotation={previewRot}
            durationSec={2.5}
            spinning
            look={draft.design}
            pointer={draft.design.pointerPosition}
          />
          <div className="lw-preview-actions">
            <button className="btn ghost" onClick={() => setPreviewRot((r) => r + 1440 + Math.random() * 360)}>Эргүүлэх</button>
            <button className="btn ghost" onClick={() => setPreviewOpen(true)}>Туршиж үзэх</button>
          </div>
          <dl className="lw-stats">
            <div><dt>Хэсэг</dt><dd>{draft.segments.length}</dd></div>
            <div><dt>Хожих магадлал</dt><dd>{(winChance * 100).toFixed(1)}%</dd></div>
            <div><dt>Нийт эргүүлэлт</dt><dd>{spins.length}</dd></div>
          </dl>
        </section>

        <section className="lw-admin-main card">
          <nav className="lw-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'prizes' && <PrizesTab draft={draft} setDraft={setDraft} />}
          {tab === 'settings' && <SettingsTab s={draft.settings} set={setSetting} />}
          {tab === 'design' && <DesignTab d={draft.design} set={setDesign} />}
          {tab === 'coupons' && <CouponsTab settings={saved.settings} onChanged={refreshSpins} />}
          {tab === 'subscribers' && <SubscribersTab spins={spins} onChanged={refreshSpins} />}
          {tab === 'report' && <ReportTab spins={spins} segments={saved.segments} />}
        </section>
      </div>

      {previewOpen && <PreviewModal config={draft} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
