import { TWO_TONE_YEAR, paintsIn } from '../../data/paints';
import { t } from '../../i18n';
import type { CarPaint } from '../paint';

/**
 * The paint card of a coachbuilder: the colours the year offers, and from the fifties a second row for
 * a contrasting roof. It changes how the car looks, nothing else.
 */
export function PaintPicker({ paint, year, onChange, note }: { paint: CarPaint; year: number; onChange: (paint: string, roof?: string) => void; note?: string }) {
  const offered = paintsIn(year);
  return (
    <div className="paint-picker">
      <div className="paint-row" role="radiogroup" aria-label={t('Boya')}>
        <span className="paint-label">{t('Boya')}</span>
        {offered.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === paint.body.id}
            className={`swatch ${p.id === paint.body.id ? 'is-on' : ''}`}
            style={{ background: p.color }}
            title={t(p.name)}
            aria-label={t(p.name)}
            onClick={() => onChange(p.id, paint.roof?.id)}
          />
        ))}
        <span className="paint-name">{t(paint.body.name)}</span>
      </div>
      {year >= TWO_TONE_YEAR && (
        <div className="paint-row" role="radiogroup" aria-label={t('Tavan')}>
          <span className="paint-label">{t('Tavan')}</span>
          <button
            type="button"
            role="radio"
            aria-checked={!paint.roof}
            className={`swatch is-same ${!paint.roof ? 'is-on' : ''}`}
            style={{ background: paint.body.color }}
            title={t('Gövdeyle aynı')}
            aria-label={t('Gövdeyle aynı')}
            onClick={() => onChange(paint.body.id, undefined)}
          />
          {offered
            .filter((p) => p.id !== paint.body.id)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === paint.roof?.id}
                className={`swatch ${p.id === paint.roof?.id ? 'is-on' : ''}`}
                style={{ background: p.color }}
                title={t(p.name)}
                aria-label={t(p.name)}
                onClick={() => onChange(paint.body.id, p.id)}
              />
            ))}
          <span className="paint-name">{paint.roof ? t(paint.roof.name) : t('Gövdeyle aynı')}</span>
        </div>
      )}
      {note && <p className="paint-note small">{note}</p>}
    </div>
  );
}
