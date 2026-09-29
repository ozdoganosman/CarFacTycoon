import { useRef, useState } from 'react';
import { deserialize, hasLocalSave } from '../../core/save';
import { CITIES, type CityId } from '../../data/cities';
import { DIFFICULTIES, type DifficultyId } from '../../data/difficulty';
import { store } from '../store';
import { Button, Choice } from '../components/ui';
import { CarSVG } from '../viz/CarSVG';
import { LanguagePicker } from '../components/LanguagePicker';

export function StartScreen() {
  const [name, setName] = useState('Öncü Motor');
  const [city, setCity] = useState<CityId>('detroit');
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canContinue = hasLocalSave();

  const importFile = async (f: File) => {
    try {
      store.load(deserialize(await f.text()));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-lang">
          <LanguagePicker compact />
        </div>
        <div className="start-hero">
          <CarSVG body="phaeton" size={0.3} year={1905} cylinders={4} styling={0.5} className="start-car" />
          <h1>CarFacTycoon</h1>
          <p className="start-tag">1900. Küçük bir atölye. Amacın dünya çapında bir otomobil markası kurmak.</p>
        </div>
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault();
            store.start({ companyName: name, city, difficulty });
          }}
        >
          <label className="field">
            <span>Şirketinin adı</span>
            <input value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>Atölyeni hangi şehirde kuruyorsun?</span>
            <p className="muted small">
              Arabaların önce yalnızca bu eyalette satılır; komşu eyaletlere bayi bularak büyürsün. Eyalet dışına giden her araba için demiryolu nakliyesi ödersin.
            </p>
            <Choice
              value={city}
              onChange={setCity}
              options={CITIES.map((c) => ({
                value: c.id,
                label: `${c.name}, ${c.state}`,
                sub: `${c.blurb} ${c.pros.map((p) => `✓ ${p}`).join(' · ')} · ${c.cons.map((x) => `✗ ${x}`).join(' · ')}`,
              }))}
            />
          </div>
          <div className="field">
            <span>Başlangıç</span>
            <Choice value={difficulty} onChange={setDifficulty} options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.name, sub: d.desc }))} />
          </div>
          <div className="start-actions">
            <Button kind="primary" type="submit">
              Yeni oyun
            </Button>
            {canContinue && (
              <Button onClick={() => store.loadSaved() || setErr('Kayıt okunamadı.')}>Kaldığın yerden devam et</Button>
            )}
            <Button kind="ghost" onClick={() => fileRef.current?.click()}>
              Kayıt dosyası yükle
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
          </div>
          {err && <p className="tone-bad">{err}</p>}
        </form>
        <p className="start-foot">
          Bu sürüm 1900-1960 dönemini kapsar. Sonraki dönemler (petrol krizi, emisyon kuralları, elektrikli araçlar) ve 1961 “Devrim” ile başlayan
          Türkiye senaryosu genişleme olarak gelecek.
        </p>
      </div>
    </div>
  );
}
