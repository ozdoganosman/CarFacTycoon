import { useRef, useState } from 'react';
import * as A from '../../core/actions';
import { deserialize, serialize } from '../../core/save';
import { formatDate } from '../../core/time';
import { store, useGameState } from '../store';
import { Button, Choice, Panel, Toggle } from '../components/ui';

type Theme = 'system' | 'light' | 'dark';

function readTheme(): Theme {
  try {
    return (localStorage.getItem('carfactycoon.theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('carfactycoon.theme', t);
  } catch {
    /* ignore */
  }
}

export function Settings() {
  const s = useGameState();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportSave = () => {
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `carfactycoon-${s.company.name.replace(/\s+/g, '-').toLowerCase()}-${formatDate(s.week).replace(' ', '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Ayarlar</h1>
      </div>
      <Panel title="Oynanış">
        <Toggle
          checked={s.settings.engineerMode}
          onChange={(v) => store.act((st) => A.setEngineerMode(st, v))}
          label="Mühendis modu"
          sub="Motor tasarımında silindir çapı, strok, sıkıştırma oranı, supap düzeni, yakıt sistemi ve kompresör ayrı ayrı ayarlanır. Kapalıyken hazır motorlar ve tek bir karakter kaydırıcısı kullanılır."
        />
        <Toggle
          checked={s.settings.autoPauseCards}
          onChange={(v) => store.act((st) => A.setAutoPauseCards(st, v))}
          label="Yeni teknoloji kartlarını göster"
          sub="Yeni bir teknoloji açıldığında “Neden böyle çalışıyor?” kartı açılır ve oyun durur."
        />
        <p className="muted small">Kısayollar: boşluk = duraklat/devam, 1-2-3 = hız.</p>
      </Panel>
      <Panel title="Görünüm">
        <Choice
          value={theme}
          onChange={(t) => {
            setTheme(t);
            applyTheme(t);
          }}
          options={[
            { value: 'system', label: 'Sistem' },
            { value: 'light', label: 'Açık' },
            { value: 'dark', label: 'Koyu' },
          ]}
        />
      </Panel>
      <Panel title="Kayıt">
        <p className="muted small">Oyun her çeyrek otomatik olarak bu tarayıcıya kaydedilir. Başka bir cihazda devam etmek için kayıt dosyasını indir.</p>
        <div className="row">
          <Button
            onClick={() => {
              store.save();
              store.showToast('Kaydedildi', 'good');
            }}
          >
            Şimdi kaydet
          </Button>
          <Button onClick={exportSave}>Kayıt dosyasını indir</Button>
          <Button onClick={() => fileRef.current?.click()}>Kayıt dosyası yükle</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                store.load(deserialize(await f.text()));
                store.showToast('Kayıt yüklendi', 'good');
              } catch (err) {
                store.showToast((err as Error).message, 'bad');
              }
            }}
          />
          <Button kind="danger" onClick={() => window.confirm('Ana menüye dönülsün mü? (Oyun kaydedilir)') && store.quit()}>
            Ana menü
          </Button>
        </div>
      </Panel>
    </div>
  );
}
