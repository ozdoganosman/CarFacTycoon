import { useRef, useState } from 'react';
import * as A from '../../core/actions';
import { deserialize, serialize } from '../../core/save';
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
  const [code, setCode] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const copySave = async () => {
    const text = serialize(s);
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      store.showToast('Kayıt kodu panoya kopyalandı', 'good');
    } catch {
      store.showToast('Panoya kopyalanamadı: aşağıdaki kutudaki metni seçip kopyala', 'info');
    }
  };

  const loadText = (text: string) => {
    try {
      store.load(deserialize(text.trim()));
      store.showToast('Kayıt yüklendi', 'good');
    } catch (err) {
      store.showToast((err as Error).message, 'bad');
    }
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
        <p className="muted small">
          Oyun her çeyrek otomatik olarak bu tarayıcıya kaydedilir. Başka bir cihazda devam etmek için kayıt kodunu kopyala ve orada yapıştırıp yükle ya da bir kayıt dosyası
          seç.
        </p>
        <div className="row">
          <Button
            onClick={() => {
              store.save();
              store.showToast('Kaydedildi', 'good');
            }}
          >
            Şimdi kaydet
          </Button>
          <Button onClick={copySave}>Kayıt kodunu kopyala</Button>
          <Button onClick={() => fileRef.current?.click()}>Kayıt dosyası yükle</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.txt"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) loadText(await f.text());
            }}
          />
          <Button
            kind="danger"
            onClick={async () => {
              if (
                await store.ask({
                  title: 'Ana menüye dönülsün mü?',
                  body: 'Oyun bu tarayıcıya kaydedilir; ana menüden kaldığın yerden devam edebilirsin.',
                  confirm: 'Ana menü',
                })
              )
                store.quit();
            }}
          >
            Ana menü
          </Button>
        </div>
        <label className="field save-code">
          <span>Kayıt kodu</span>
          <textarea
            id="save-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onFocus={(e) => e.target.select()}
            rows={3}
            placeholder="Başka bir cihazdan kopyaladığın kayıt kodunu buraya yapıştır"
          />
        </label>
        <div className="row">
          <Button disabled={!code.trim()} onClick={() => loadText(code)}>
            Koddan yükle
          </Button>
        </div>
      </Panel>
    </div>
  );
}
