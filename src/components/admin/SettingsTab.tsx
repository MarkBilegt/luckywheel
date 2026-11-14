import { playWin, scheduleTicks, unlockAudio } from '../../lib/sound';
import { tickTimes } from '../../lib/wheel';
import type { FieldMode, Settings } from '../../types';
import { CheckField, Field, NumberField, SelectField, TextField } from './fields';

const FIELD_MODES: { value: FieldMode; label: string }[] = [
  { value: 'off', label: 'Харуулахгүй' },
  { value: 'optional', label: 'Заавал биш' },
  { value: 'required', label: 'Заавал' },
];

type Set = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export function SettingsTab({ s, set }: { s: Settings; set: Set }) {
  return (
    <div className="lw-form-grid">
      <CheckField label="Хүрд идэвхтэй" hint="Унтраавал зочдод «Удахгүй эргэн ирнэ» гэсэн мэдэгдэл харагдана" checked={s.enabled} onChange={(v) => set('enabled', v)} />
      <h4>Эргүүлэх дүрэм</h4>
      <NumberField label="Нэг дугаарт ногдох эргүүлэлт" hint="0 = хязгааргүй" value={s.spinsPerPhone} onChange={(v) => set('spinsPerPhone', v)} />
      <NumberField label="Нэг төхөөрөмжөөс өдөрт" hint="Нэг IP хаягаас 24 цагт эргүүлэх дээд тоо (зохиомол дугаараас хамгаална). 0 = хязгааргүй" value={s.spinsPerIpPerDay} onChange={(v) => set('spinsPerIpPerDay', v)} />
      <NumberField label="Эргүүлэлт хоорондын хугацаа (цаг)" hint="0 = хүлээхгүй" step={0.5} value={s.cooldownHours} onChange={(v) => set('cooldownHours', v)} />
      <CheckField label="Эргүүлэх эрхийг өдөр бүр шинэчлэх" checked={s.resetSpinsDaily} onChange={(v) => set('resetSpinsDaily', v)} />
      <Field label="Шинэчлэгдэх цаг" hint="Таны компьютерийн цагаар">
        <input type="time" value={s.resetTime} disabled={!s.resetSpinsDaily} onChange={(e) => set('resetTime', e.target.value || '00:00')} className="narrow-time" />
      </Field>
      <NumberField label="Эргэх хугацаа (секунд)" min={2} max={15} value={s.spinDurationSec} onChange={(v) => set('spinDurationSec', v)} />

      <h4>Дуу</h4>
      <CheckField label="Дуу тоглуулах" hint="Эргэх үеийн тикэх дуу, хожих үеийн баярын ая. Зочид өөрсдөө хааж болно." checked={s.soundEnabled} onChange={(v) => set('soundEnabled', v)} />
      <NumberField label="Дууны хэмжээ (%)" min={0} max={100} step={5} value={s.soundVolume} onChange={(v) => set('soundVolume', v)} />
      <div className="lw-sound-test">
        <span className="lw-field-label">Сонсож үзэх:</span>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            unlockAudio(s.soundVolume / 100);
            // A real-length spin's worth of ticks (8 slices, ~7 turns).
            scheduleTicks(tickTimes(0, 360 * 7 + 100, 8, 0, s.spinDurationSec));
          }}
        >
          Эргэх дуу
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            unlockAudio(s.soundVolume / 100);
            playWin();
          }}
        >
          Хожих дуу
        </button>
      </div>

      <h4>Маягтын талбарууд</h4>
      <SelectField label="Нэр" value={s.nameField} options={FIELD_MODES} onChange={(v) => set('nameField', v)} />
      <p className="muted lw-form-note">Утасны дугаар үргэлж заавал. Монгол 8 оронтой дугаар (жишээ нь 9911-2233) хүлээн авна.</p>
      <CheckField label="Зөвшөөрлийн чагт" hint="Эргүүлэхээс өмнө зочин заавал чагтална" checked={s.gdprEnabled} onChange={(v) => set('gdprEnabled', v)} />
      <TextField label="Зөвшөөрлийн текст" hint="{terms} гэж бичсэн газарт холбоос гарна" wide value={s.gdprMessage} onChange={(v) => set('gdprMessage', v)} />
      <TextField label="Холбоосын текст" value={s.gdprLinkText} onChange={(v) => set('gdprLinkText', v)} />
      <TextField label="Холбоосын хаяг (URL)" placeholder="https://example.mn/nuhtsul" value={s.gdprLinkUrl} onChange={(v) => set('gdprLinkUrl', v)} />

      <h4>Текст</h4>
      <TextField label="Гарчиг" wide value={s.title} onChange={(v) => set('title', v)} />
      <TextField label="Тайлбар" wide multiline value={s.description} onChange={(v) => set('description', v)} />
      <TextField label="Товчны текст" value={s.buttonText} onChange={(v) => set('buttonText', v)} />
      <Field label="Валют" hint="Тэмдэг (₮, $) эсвэл код (MNT)">
        <input value={s.currency} maxLength={5} className="narrow" onChange={(e) => set('currency', e.target.value)} />
      </Field>
      <SelectField
        label="Валютын байрлал"
        value={s.currencyPosition}
        options={[
          { value: 'after', label: 'Дүнгийн ард (5,000₮)' },
          { value: 'before', label: 'Дүнгийн өмнө ($5)' },
        ]}
        onChange={(v) => set('currencyPosition', v)}
      />
      <TextField label="Хожсон үеийн гарчиг" value={s.winTitle} onChange={(v) => set('winTitle', v)} />
      <TextField label="Хожоогүй үеийн гарчиг" value={s.loseTitle} onChange={(v) => set('loseTitle', v)} />
      <TextField label="Хожсон үеийн мессеж" hint="Орлуулагч: {prize} шагнал, {expiry} дуусах огноо, {name} нэр" wide multiline value={s.winMessage} onChange={(v) => set('winMessage', v)} />
      <TextField label="Хожоогүй үеийн мессеж" hint="Орлуулагч: {name} нэр" wide multiline value={s.loseMessage} onChange={(v) => set('loseMessage', v)} />

      <h4>Купон</h4>
      <Field label="Кодын угтвар" hint="Зөвхөн латин үсэг, тоо">
        <input value={s.couponPrefix} maxLength={12} onChange={(e) => set('couponPrefix', e.target.value.replace(/[^a-z0-9]/gi, ''))} />
      </Field>
      <NumberField label="Хүчинтэй хугацаа (өдөр)" min={1} value={s.couponValidDays} onChange={(v) => set('couponValidDays', v)} />
    </div>
  );
}
