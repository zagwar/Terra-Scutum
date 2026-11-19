import {
  type BuildingsSnapshot,
  type FoodSnapshot,
  type PopulationSnapshot,
  type WorldMap,
  countryNameKey,
  provinceNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';
import { useLayoutEffect, useRef } from 'react';
import { formatDensity, formatPercent, formatPopulation, t, tKey } from './i18n';

export interface MapTooltipProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** Given in the population map mode: a province's tooltip then also shows its people (F06). */
  readonly population?: PopulationSnapshot | null;
  /** Given in the industry map mode: a province's tooltip then also shows the people at work in its buildings (F07). */
  readonly buildings?: BuildingsSnapshot | null;
  /** Given in the food map mode: a province's tooltip then also shows its food security and famine (F08). */
  readonly food?: FoodSnapshot | null;
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
export function MapTooltip({
  world,
  provinceOwner,
  population,
  buildings,
  food,
  target,
}: MapTooltipProps) {
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
      {target.kind === 'province' && population && (
        <span className="map-tooltip-line" data-testid="map-tooltip-population">
          {t('MAP_TOOLTIP_PROVINCE_POPULATION', {
            people: formatPopulation(population.provincePopulation[target.index]),
            density: formatDensity(
              world.provinceAreaKm2[target.index] > 0
                ? population.provincePopulation[target.index] / world.provinceAreaKm2[target.index]
                : 0,
            ),
          })}
        </span>
      )}
      {target.kind === 'province' && buildings && (
        <span className="map-tooltip-line" data-testid="map-tooltip-industry">
          {buildings.provinceJobs[target.index] > 0
            ? t('MAP_TOOLTIP_PROVINCE_INDUSTRY', {
                workers: formatPopulation(buildings.provinceWorkers[target.index]),
                levels: provinceLevels(buildings, target.index).toLocaleString('en'),
              })
            : t('MAP_TOOLTIP_PROVINCE_NO_INDUSTRY')}
        </span>
      )}
      {target.kind === 'province' && food && (
        <span className="map-tooltip-line" data-testid="map-tooltip-food">
          {t(food.famineSince[target.index] >= 0 ? 'MAP_TOOLTIP_FAMINE' : 'MAP_TOOLTIP_FOOD', {
            security: formatPercent(food.provinceSecurity[target.index], 0),
            starving: formatPercent(food.provinceStarving[target.index], 0),
          })}
        </span>
      )}
    </div>
  );
}

/** All building levels of a province. */
function provinceLevels(buildings: BuildingsSnapshot, province: number): number {
  let levels = 0;
  for (let i = 0; i < buildings.cells.length; i++)
    if (Math.floor(buildings.cells[i] / buildings.typeCount) === province)
      levels += buildings.level[i];
  return levels;
}
