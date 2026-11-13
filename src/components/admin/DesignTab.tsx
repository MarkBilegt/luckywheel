import type { BgEffect, Design, PointerPosition, WinEffect } from '../../types';
import { FONTS } from '../effects';
import { CheckField, ColorField, Field, NumberField, SelectField, TextField } from './fields';

type Set = <K extends keyof Design>(key: K, value: Design[K]) => void;

const POINTERS: { value: PointerPosition; label: string }[] = [
  { value: 'top', label: 'Дээр' },
  { value: 'right', label: 'Баруун талд' },
  { value: 'bottom', label: 'Доор' },
  { value: 'center', label: 'Голд' },
];
const BG_EFFECTS: { value: BgEffect; label: string }[] = [
  { value: 'none', label: 'Байхгүй' },
  { value: 'snow', label: 'Цас' },
  { value: 'stars', label: 'Анивчих од' },
  { value: 'bubbles', label: 'Бөмбөлөг' },
  { value: 'hearts', label: 'Зүрх' },
];
const WIN_EFFECTS: { value: WinEffect; label: string }[] = [
  { value: 'confetti', label: 'Конфетти' },
  { value: 'fireworks', label: 'Салют' },
  { value: 'stars', label: 'Одны цацраг' },
  { value: 'none', label: 'Байхгүй' },
];

export function DesignTab({ d, set }: { d: Design; set: Set }) {
  return (
    <div className="lw-form-grid">
      <h4 className="first">Хүрд</h4>
      <CheckField
        label="Хагас хүрд"
        hint="Хүрдний баруун хагасыг дэлгэцийн ирмэгт харуулж, заагчийг баруун талд байрлуулна. Утсан дээр бүтэн хүрд харагдана."
        checked={d.wheelStyle === 'half'}
        onChange={(v) => set('wheelStyle', v ? 'half' : 'full')}
      />
      <SelectField label="Заагчийн байрлал" hint={d.wheelStyle === 'half' ? 'Хагас хүрдэнд заагч үргэлж баруун талд байна' : undefined} value={d.pointerPosition} options={POINTERS} onChange={(v) => set('pointerPosition', v)} />
      <NumberField label="Хүрдний хэмжээ (px)" min={240} max={560} step={10} value={d.wheelSize} onChange={(v) => set('wheelSize', v)} />
      <NumberField label="Хэсгийн текстийн хэмжээ (%)" hint="100 = автомат" min={50} max={160} step={5} value={d.labelScale} onChange={(v) => set('labelScale', v)} />
      <ColorField label="Хүрээ" value={d.borderColor} onChange={(v) => set('borderColor', v)} />
      <ColorField label="Хүрээний гэрлүүд" value={d.dotColor} onChange={(v) => set('dotColor', v)} />
      <ColorField label="Заагч ба ирмэг" value={d.pointerColor} onChange={(v) => set('pointerColor', v)} />
      <ColorField label="Төв" value={d.centerColor} onChange={(v) => set('centerColor', v)} />
      <TextField label="Төвийн зургийн хаяг (URL)" hint="Таны лого хүрдний голд харагдана" wide placeholder="https://…/logo.png" value={d.centerImageUrl} onChange={(v) => set('centerImageUrl', v)} />

      <h4>Хуудас</h4>
      <ColorField label="Дэвсгэр өнгө" value={d.bgColor} onChange={(v) => set('bgColor', v)} />
      <TextField label="Дэвсгэр зургийн хаяг (URL)" placeholder="https://…/background.jpg" value={d.bgImageUrl} onChange={(v) => set('bgImageUrl', v)} />
      <ColorField label="Гарчиг" value={d.titleColor} onChange={(v) => set('titleColor', v)} />
      <ColorField label="Текст" value={d.textColor} onChange={(v) => set('textColor', v)} />
      <ColorField label="Товч" value={d.buttonColor} onChange={(v) => set('buttonColor', v)} />
      <ColorField label="Товчны текст" value={d.buttonTextColor} onChange={(v) => set('buttonTextColor', v)} />
      <SelectField
        label="Фонт"
        hint="Бүгд монгол кирилл (Ө, Ү) үсэг дэмждэг"
        value={d.fontFamily}
        options={Object.keys(FONTS).map((f) => ({ value: f, label: f === 'system' ? 'Системийн үндсэн' : f }))}
        onChange={(v) => set('fontFamily', v)}
      />

      <h4>Эффект</h4>
      <SelectField label="Дэвсгэрийн эффект" value={d.bgEffect} options={BG_EFFECTS} onChange={(v) => set('bgEffect', v)} />
      <SelectField label="Хожих үеийн эффект" value={d.winEffect} options={WIN_EFFECTS} onChange={(v) => set('winEffect', v)} />

      <h4>Нэмэлт CSS</h4>
      <Field label="CSS код" hint="Хүрд харагдах газар бүрт хэрэгжинэ. .lw-panel, .lw-title, .lw-spin-btn зэрэг классыг ашиглана уу" wide>
        <textarea rows={5} className="mono" spellCheck={false} value={d.customCss} onChange={(e) => set('customCss', e.target.value)} placeholder=".lw-title { text-transform: none; }" />
      </Field>
    </div>
  );
}
