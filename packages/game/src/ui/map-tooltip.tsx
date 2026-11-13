import { type WorldMap, countryNameKey, provinceNameKey, seaZoneNameKey } from '@terra-scutum/sim';
import { useLayoutEffect, useRef } from 'react';
import { t, tKey } from './i18n';

export interface MapTooltipProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** What is under the mouse: a province or a sea zone (by index). */
  readonly target: { readonly kind: 'province' | 'seaZone'; readonly index: number };
}

/** Distance between the mouse and the tooltip, in pixels. */
const OFFSET = 16;

/** Where the mouse was last seen, so a new tooltip can appear right there. */
let lastPointer: { x: number; y: number } | null = null;
window.addEventListener('pointermove', (event) => {
  lastPointer = { x: event.clientX, y: event.clientY };
});

/**
 * The small label that follows the mouse over the map: a province's name and
 * owner, or a sea zone's name. It moves itself with
 * the mouse (without going through the app store), so React only re-renders
 * when the province changes.
 */
export function MapTooltip({ world, provinceOwner, target }: MapTooltipProps) {
  const element = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const place = (pointer: { x: number; y: number }) => {
      const tooltip = element.current;
      if (!tooltip) return;
      // Keep it inside the window: flip to the other side of the mouse near the right and bottom edges.
      const flipX = pointer.x + OFFSET + tooltip.offsetWidth > window.innerWidth;
      const flipY = pointer.y + OFFSET + tooltip.offsetHeight > window.innerHeight;
      const x = flipX ? pointer.x - OFFSET - tooltip.offsetWidth : pointer.x + OFFSET;
      const y = flipY ? pointer.y - OFFSET - tooltip.offsetHeight : pointer.y + OFFSET;
      tooltip.style.transform = `translate(${x}px, ${y}px)`;
      tooltip.style.visibility = 'visible';
    };
    const follow = (event: PointerEvent) => place({ x: event.clientX, y: event.clientY });
    if (lastPointer) place(lastPointer);
    window.addEventListener('pointermove', follow);
    return () => window.removeEventListener('pointermove', follow);
  }, []);

  return (
    <div ref={element} className="map-tooltip" data-testid="map-tooltip">
      {target.kind === 'province'
        ? t('MAP_TOOLTIP_PROVINCE', {
            province: tKey(provinceNameKey(world.provinceIds[target.index])),
            country: tKey(countryNameKey(world.countryIds[provinceOwner[target.index]])),
          })
        : t('MAP_TOOLTIP_SEA_ZONE', {
            seaZone: tKey(seaZoneNameKey(world.seaZoneIds[target.index])),
          })}
    </div>
  );
}
