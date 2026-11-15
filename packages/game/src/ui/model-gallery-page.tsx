import { modelNameKey } from '@terra-scutum/sim';
import { useEffect, useState } from 'react';
import type { GalleryLabel, GalleryModelStats } from '../render/models/model-gallery';
import { t, tKey } from './i18n';

export interface ModelGallerySource {
  labels(): GalleryLabel[];
  stats(): GalleryModelStats[];
  isComplete(): boolean;
}

const DETAIL_KEYS = {
  icon: 'GALLERY_DETAIL_ICON',
  simple: 'GALLERY_DETAIL_SIMPLE',
  detailed: 'GALLERY_DETAIL_DETAILED',
} as const;

/**
 * The model gallery's page (F133, `?debug=models`): a title, how to move the
 * view, each model's facts (size, variants, triangles per detail level) and
 * labels that follow the models on screen.
 */
export function ModelGalleryPage({ gallery }: { gallery: ModelGallerySource | null }) {
  const [labels, setLabels] = useState<GalleryLabel[]>([]);
  const [stats, setStats] = useState<GalleryModelStats[]>([]);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!gallery) return;
    let frame = 0;
    const tick = () => {
      setLabels(gallery.labels());
      setStats(gallery.stats());
      setComplete(gallery.isComplete());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [gallery]);

  const triangles = (value: number | null) => (value === null ? '…' : String(value));
  return (
    <div className="ui-layer model-gallery">
      <section className="model-gallery-panel" aria-label={t('GALLERY_TITLE')}>
        <h1>{t('GALLERY_TITLE')}</h1>
        <p>{t('GALLERY_INTRO')}</p>
        <p className="model-gallery-dim">{t('GALLERY_HINT_ROWS')}</p>
        <p className="model-gallery-dim">{t('GALLERY_HINT')}</p>
        {!complete && <p className="model-gallery-loading">{t('GALLERY_LOADING')}</p>}
        <ul className="model-gallery-list">
          {stats.map((model) => (
            <li key={model.modelId} data-model={model.modelId}>
              <strong>{tKey(modelNameKey(model.modelId))}</strong>{' '}
              <span className="model-gallery-dim">
                ({t(model.source === 'file' ? 'GALLERY_SOURCE_FILE' : 'GALLERY_SOURCE_GENERATOR')})
              </span>
              <br />
              <span className="model-gallery-dim">
                {t('GALLERY_MODEL_STATS', {
                  height: model.heightM === null ? '…' : model.heightM.toFixed(1),
                  variants: model.variants,
                  icon: triangles(model.triangles.icon),
                  simple: triangles(model.triangles.simple),
                  detailed: triangles(model.triangles.detailed),
                })}
              </span>
            </li>
          ))}
        </ul>
        <a className="model-gallery-back" href="./">
          {t('GALLERY_BACK')}
        </a>
      </section>
      {labels.map((label) => (
        <div
          key={`${label.kind}-${label.id}`}
          className={`model-gallery-label model-gallery-label-${label.kind}`}
          style={{ left: label.x, top: label.y }}
        >
          {label.kind === 'model'
            ? tKey(modelNameKey(label.id))
            : t(DETAIL_KEYS[label.id.split(':')[1] as keyof typeof DETAIL_KEYS])}
        </div>
      ))}
    </div>
  );
}
