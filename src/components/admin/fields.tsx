import type { ReactNode } from 'react';

export function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`lw-field ${wide ? 'wide' : ''}`}>
      <span className="lw-field-label">{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function NumberField({
  label, hint, value, onChange, min = 0, max, step,
}: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        className="narrow"
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(min, max != null ? Math.min(max, n) : n) : min);
        }}
      />
    </Field>
  );
}

export function TextField({
  label, hint, value, onChange, wide, multiline, placeholder,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; wide?: boolean; multiline?: boolean; placeholder?: string }) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      {multiline ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function CheckField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label} hint={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Field>
  );
}

export function SelectField<T extends string>({
  label, hint, value, options, onChange,
}: { label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <span className="lw-color-field">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <code>{value}</code>
      </span>
    </Field>
  );
}
