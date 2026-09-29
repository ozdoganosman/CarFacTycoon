import { useRef, useState } from 'react';
import * as A from '../../core/actions';
import { deserialize, serialize } from '../../core/save';
import { store, useGameState } from '../store';
import { Button, Choice, Panel, Toggle } from '../components/ui';
import { AdSettings } from '../components/Sponsor';
import { LanguagePicker } from '../components/LanguagePicker';
import { ads } from '../ads';
import { t, tc } from '../../i18n';

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
      store.showToast(t('Kayıt kodu panoya kopyalandı'), 'good');
    } catch {
      store.showToast(t('Panoya kopyalanamadı: aşağıdaki kutudaki metni seçip kopyala'), 'info');
    }
  };

  const loadText = (text: string) => {
    try {
      store.load(deserialize(text.trim()));
      store.showToast(t('Kayıt yüklendi'), 'good');
    } catch (err) {
      store.showToast((err as Error).message, 'bad');
    }
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Ayarlar')}</h1>
      </div>
      <Panel title="Dil · Language">
        <LanguagePicker />
      </Panel>
      <Panel title={t('Oynanış')}>
        <Toggle
          checked={s.settings.engineerMode}
          onChange={(v) => store.act((st) => A.setEngineerMode(st, v))}
          label={t('Mühendis modu')}
          sub={t(
            'Açıkken (varsayılan) motorun silindir düzeni, çapı, stroku, sıkıştırma oranı, supap düzeni, yakıt sistemi ve kompresörü ayrı ayrı ayarlanır ve her ayarın ne işe yaradığı yazar. Karışık gelirse kapat: hazır motorlar ve tek bir karakter kaydırıcısıyla çalışırsın.',
          )}
        />
        <Toggle
          checked={s.settings.autoPauseCards}
          onChange={(v) => store.act((st) => A.setAutoPauseCards(st, v))}
          label={t('Yeni teknoloji kartlarını göster')}
          sub={t('Yeni bir teknoloji açıldığında “Neden böyle çalışıyor?” kartı açılır ve oyun durur.')}
        />
        <p className="muted small">{t('Kısayollar: boşluk = duraklat/devam, 1-2-3 = hız.')}</p>
      </Panel>
      <Panel title={t('Görünüm')}>
        <Choice
          value={theme}
          onChange={(th) => {
            setTheme(th);
            applyTheme(th);
          }}
          options={[
            { value: 'system', label: t('Sistem') },
            { value: 'light', label: tc('tema', 'Açık') },
            { value: 'dark', label: t('Koyu') },
          ]}
        />
      </Panel>
      {ads.backend && (
        <Panel title={t('Reklamlar')}>
          <AdSettings />
        </Panel>
      )}
      <Panel title={t('Kayıt')}>
        <p className="muted small">
          {t(
            'Oyun her çeyrek otomatik olarak bu tarayıcıya kaydedilir. Başka bir cihazda devam etmek için kayıt kodunu kopyala ve orada yapıştırıp yükle ya da bir kayıt dosyası seç.',
          )}
        </p>
        <div className="row">
          <Button
            onClick={() => {
              store.save();
              store.showToast(t('Kaydedildi'), 'good');
            }}
          >
            {t('Şimdi kaydet')}
          </Button>
          <Button onClick={copySave}>{t('Kayıt kodunu kopyala')}</Button>
          <Button onClick={() => fileRef.current?.click()}>{t('Kayıt dosyası yükle')}</Button>
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
                  title: t('Ana menüye dönülsün mü?'),
                  body: t('Oyun bu tarayıcıya kaydedilir; ana menüden kaldığın yerden devam edebilirsin.'),
                  confirm: t('Ana menü'),
                })
              )
                store.quit();
            }}
          >
            {t('Ana menü')}
          </Button>
        </div>
        <label className="field save-code">
          <span>{t('Kayıt kodu')}</span>
          <textarea
            id="save-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onFocus={(e) => e.target.select()}
            rows={3}
            placeholder={t('Başka bir cihazdan kopyaladığın kayıt kodunu buraya yapıştır')}
          />
        </label>
        <div className="row">
          <Button disabled={!code.trim()} onClick={() => loadText(code)}>
            {t('Koddan yükle')}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
