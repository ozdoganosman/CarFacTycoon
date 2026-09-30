import { useRef, useState } from 'react';
import { deserialize, hasLocalSave } from '../../core/save';
import { CITIES, type CityId } from '../../data/cities';
import { DIFFICULTIES, type DifficultyId } from '../../data/difficulty';
import { store } from '../store';
import { Button, Choice, ProsCons } from '../components/ui';
import { CarSVG } from '../viz/CarSVG';
import { LanguagePicker } from '../components/LanguagePicker';
import { t } from '../../i18n';

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
          <p className="start-tag">{t('1900, Amerika. Küçük bir atölye. Amacın ülkenin büyük otomobil markalarından biri olmak.')}</p>
        </div>
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault();
            store.start({ companyName: name, city, difficulty });
          }}
        >
          <label className="field">
            <span>{t('Şirketinin adı')}</span>
            <input value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>{t('Atölyeni hangi şehirde kuruyorsun?')}</span>
            <p className="muted small">
              {t('Arabaların önce yalnızca bu eyalette satılır; komşu eyaletlere bayi bularak büyürsün. Eyalet dışına giden her araba için demiryolu nakliyesi ödersin.')}
            </p>
            <Choice
              value={city}
              onChange={setCity}
              options={CITIES.map((c) => ({
                value: c.id,
                label: `${c.name}, ${c.state}`,
                sub: (
                  <>
                    {t(c.blurb)}
                    <ProsCons pros={c.pros.map((p) => t(p))} cons={c.cons.map((x) => t(x))} />
                  </>
                ),
              }))}
            />
          </div>
          <div className="field">
            <span>{t('Başlangıç')}</span>
            <Choice value={difficulty} onChange={setDifficulty} options={DIFFICULTIES.map((d) => ({ value: d.id, label: t(d.name), sub: t(d.desc) }))} />
          </div>
          <div className="start-actions">
            <Button kind="primary" type="submit">
              {t('Yeni oyun')}
            </Button>
            {canContinue && (
              <Button onClick={() => store.loadSaved() || setErr(t('Kayıt okunamadı.'))}>{t('Kaldığın yerden devam et')}</Button>
            )}
            <Button kind="ghost" onClick={() => fileRef.current?.click()}>
              {t('Kayıt dosyası yükle')}
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
          {t(
            'Bu sürüm 1900-1960 dönemini kapsar. Sonraki dönemler (petrol krizi, emisyon kuralları, elektrikli araçlar) ve 1961 “Devrim” ile başlayan Türkiye senaryosu genişleme olarak gelecek.',
          )}
        </p>
      </div>
    </div>
  );
}
