import type { Scene } from '@babylonjs/core/scene';
import {
  type DetailLevel,
  LAND_COVER_CLASSES,
  type SceneryConfig,
  type WorldMap,
} from '@terra-scutum/sim';
import { type InstanceBatch, createInstancedModels } from '../models/instanced-models';
import type { ModelLibrary } from '../models/model-library';
import {
  type ClusterBuilding,
  type ViewRect,
  capitalCluster,
  createForestPlacement,
  detailForPixels,
  finestGridLevel,
  levelWeight,
  type ForestSearch,
  continueForestSearch,
  startForestSearch,
  valueAtZoom,
  writeInstanceMatrix,
  zoomFade,
} from './scenery-placement';

/**
 * Scenery on the world map (F133): generated models standing on the land,
 * drawn with thin instances.
 * - **Forests**: trees on the land the land cover data marks as forest
 *   (`scenery.forests` in `data/map_view.json`), from the operational zoom.
 *   Only the trees around the view exist; they are found again when the view
 *   moves away or the terrain under them changes.
 * - **Capital markers** [DEFAULT]: a small cluster of placeholder buildings
 *   at each country's capital, until cities come (F126, M2).
 * Models are drawn as oversized symbols (`sizePx`: their height on screen),
 * and with the detail level that suits that size (`simplePx`, `detailedPx`).
 * Everything stands on the land as drawn (`heightAt` × the exaggeration of
 * the moment) and follows it when the view zooms.
 */
export interface SceneryView {
  readonly rect: ViewRect;
  readonly unitsPerPixel: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly zoom: number;
  /** Heights in metres times this are heights in map units as drawn right now. */
  readonly heightUnits: number;
}

export interface SceneryGround {
  /** The land's height in metres (real scale) at a map position. */
  heightAt(x: number, z: number): number;
  coverShareAt(x: number, z: number, classes: ArrayLike<boolean>): number;
  /** True inside a province. */
  onLand(x: number, z: number): boolean;
  /** Changes whenever the terrain drawn changes. */
  terrainVersion(): number;
  latitude(z: number): number;
  /** A map position from longitude and latitude. */
  x(longitude: number): number;
  z(latitude: number): number;
  longitude(x: number): number;
}

export interface SceneryStats {
  readonly trees: number;
  readonly treeDetail: DetailLevel | null;
  readonly capitalBuildings: number;
  readonly buildingDetail: DetailLevel | null;
  readonly drawCalls: number;
  readonly triangles: number;
  /** How long finding the trees took the last time, in milliseconds (spread over several frames). */
  readonly placeMs: number;
  /** True while a search for trees is running. */
  readonly searching: boolean;
}

/** One drawn model for tests: where it stands and the height of its base as drawn (metres at real scale). */
export interface SceneryProbe {
  readonly kind: 'tree' | 'building';
  readonly longitude: number;
  readonly latitude: number;
  readonly baseM: number;
  readonly heightPx: number;
}

export interface MapScenery {
  /** Once per frame, with the current view. */
  update(view: SceneryView): void;
  stats(): SceneryStats;
  /** Up to `count` drawn models, for tests. */
  probe(count: number): SceneryProbe[];
  /** Turns all scenery on or off (some test scenarios turn it off: the test browser draws in software). */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Trees are found for the view plus this share of its size on every side, so small moves need no new search. */
const PLACE_MARGIN = 0.2;

const newBatch = (modelId: string, variant: number, colors: boolean): InstanceBatch => ({
  modelId,
  variant,
  matrices: new Float32Array(16 * 64),
  colors: colors ? new Float32Array(4 * 64) : null,
  count: 0,
  version: 0,
});

/** Makes sure a batch has room for `count` instances (keeps what is in it). */
function reserve(batch: InstanceBatch, count: number): void {
  if (batch.matrices.length >= count * 16) return;
  const size = Math.max(count, (batch.matrices.length / 16) * 2);
  const matrices = new Float32Array(size * 16);
  matrices.set(batch.matrices);
  batch.matrices = matrices;
  if (batch.colors) {
    const colors = new Float32Array(size * 4);
    colors.set(batch.colors);
    batch.colors = colors;
  }
}

export function createMapScenery(
  scene: Scene,
  library: ModelLibrary,
  config: SceneryConfig,
  world: WorldMap,
  ground: SceneryGround,
  renderingGroup: number,
): MapScenery {
  const { forests, capitals } = config;
  const drawn = createInstancedModels(scene, library, 'scenery', renderingGroup);
  const forestClasses = LAND_COVER_CLASSES.map((name) => forests.landCover.includes(name));

  // ── Forests ────────────────────────────────────────────────────────────
  const forestVariants = forests.models.map((tree) => library.variants(tree.model));
  const forestBatches = forests.models.map((tree, m) =>
    Array.from({ length: forestVariants[m] }, (_, v) => newBatch(tree.model, v, true)),
  );
  // Two buffers: the trees drawn (`placement`) and the ones a search is finding (`next`).
  let placement = createForestPlacement(forests.maxInstances);
  let nextPlacement = createForestPlacement(forests.maxInstances);
  let search: ForestSearch | null = null;
  let searchTerrain = -1;
  let searchMs = 0;
  let placedRect: ViewRect | null = null;
  let placedLevel = -2;
  let placedTerrain = -1;
  let placeMs = 0;
  let forestDetail: DetailLevel | null = null;
  let forestLook = '';
  const forestGround = {
    forestShare: (x: number, z: number) => ground.coverShareAt(x, z, forestClasses),
    heightM: (x: number, z: number) => ground.heightAt(x, z),
    onLand: (x: number, z: number) => ground.onLand(x, z),
    latitude: (z: number) => ground.latitude(z),
  };
  const contains = (outer: ViewRect | null, inner: ViewRect) =>
    outer !== null &&
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minZ >= outer.minZ &&
    inner.maxZ <= outer.maxZ;

  /** Starts a search for the trees around the view (the trees drawn stay until it is done). */
  const startSearch = (view: SceneryView) => {
    const width = view.rect.maxX - view.rect.minX;
    const height = view.rect.maxZ - view.rect.minZ;
    const rect = {
      minX: view.rect.minX - width * PLACE_MARGIN,
      maxX: view.rect.maxX + width * PLACE_MARGIN,
      minZ: view.rect.minZ - height * PLACE_MARGIN,
      maxZ: view.rect.maxZ + height * PLACE_MARGIN,
    };
    search = startForestSearch(nextPlacement, rect, view.unitsPerPixel, forests);
    searchTerrain = ground.terrainVersion();
    searchMs = 0;
  };

  /** Goes on with the search for a slice of this frame; true when it finished and its trees are now the ones drawn. */
  const continueSearch = (): boolean => {
    if (!search) return false;
    const start = performance.now();
    const done = continueForestSearch(
      search,
      forests,
      forestVariants,
      forestGround,
      start + forests.placeMsPerFrame,
    );
    searchMs += performance.now() - start;
    if (!done) return false;
    [placement, nextPlacement] = [nextPlacement, placement];
    placedRect = search.rect;
    placedLevel = search.finest;
    placedTerrain = searchTerrain;
    placeMs = searchMs;
    search = null;
    return true;
  };

  const drawTrees = (view: SceneryView) => {
    const fade = zoomFade(forests.fromZoom, forests.fullZoom, view.zoom);
    const sizePx = valueAtZoom(forests.sizePx, view.zoom);
    const unit = (sizePx * view.unitsPerPixel) / forests.referenceHeight;
    for (const batches of forestBatches) for (const batch of batches) batch.count = 0;
    const weights = new Float32Array(placedLevel + 2);
    for (let level = 0; level < weights.length; level++)
      weights[level] = levelWeight(level, view.unitsPerPixel, forests.spacingPx) * fade;
    // Only the trees on screen are drawn (the others were found in case the view moves).
    const edge = sizePx * view.unitsPerPixel;
    const { minX, maxX, minZ, maxZ } = view.rect;
    for (let i = 0; i < placement.count; i++) {
      const weight = weights[placement.level[i]] ?? 0;
      if (weight < 0.02) continue;
      const x = placement.x[i];
      const z = placement.z[i];
      if (x < minX - edge || x > maxX + edge || z < minZ - edge || z > maxZ + edge) continue;
      const batch = forestBatches[placement.model[i]][placement.variant[i]];
      reserve(batch, batch.count + 1);
      writeInstanceMatrix(
        batch.matrices,
        batch.count,
        x,
        placement.groundM[i] * view.heightUnits,
        z,
        unit * placement.size[i] * weight,
        placement.yaw[i],
      );
      const tint = placement.tint[i];
      const colors = batch.colors!;
      const c = batch.count * 4;
      colors[c] = tint;
      colors[c + 1] = tint;
      colors[c + 2] = tint;
      colors[c + 3] = 1;
      batch.count += 1;
    }
    for (const batches of forestBatches) for (const batch of batches) batch.version += 1;
    forestDetail = detailForPixels(sizePx, config);
  };

  const updateForests = (view: SceneryView): boolean => {
    if (!forests.enabled || view.zoom < forests.fromZoom) {
      // No trees this far out: a search still running is no longer needed.
      search = null;
      if (forestDetail === null) return false;
      for (const batches of forestBatches) for (const batch of batches) batch.count = 0;
      forestDetail = null;
      forestLook = '';
      return true;
    }
    const level = finestGridLevel(view.unitsPerPixel, forests.spacingPx);
    // A new search when the view left the trees found (unless the search running covers it),
    // or when the zoom or the terrain changed since (once the search running is done).
    if (!contains(placedRect, view.rect) && !contains(search?.rect ?? null, view.rect))
      startSearch(view);
    else if (!search && (level !== placedLevel || ground.terrainVersion() !== placedTerrain))
      startSearch(view);
    const placed = continueSearch();
    const look = `${view.rect.minX}|${view.rect.minZ}|${view.rect.maxX}|${view.rect.maxZ}|${view.unitsPerPixel}|${view.heightUnits}|${view.zoom}`;
    if (!placed && look === forestLook) return false;
    forestLook = look;
    drawTrees(view);
    return true;
  };

  // ── Capital markers ───────────────────────────────────────────────────
  const buildingVariants = library.variants(capitals.model);
  const capitalBatches = Array.from({ length: buildingVariants }, (_, v) =>
    newBatch(capitals.model, v, false),
  );
  const clusters: { x: number; z: number; buildings: ClusterBuilding[] }[] = [];
  world.countryCapital.forEach((province, country) => {
    if (province < 0) return;
    clusters.push({
      x: ground.x(world.provinceCenter[province * 2]),
      z: ground.z(world.provinceCenter[province * 2 + 1]),
      buildings: capitalCluster(country, capitals.buildings, capitals.clusterPx, buildingVariants),
    });
  });
  let capitalDetail: DetailLevel | null = null;
  let capitalLook = '';

  const updateCapitals = (view: SceneryView): boolean => {
    if (!capitals.enabled || view.zoom < capitals.fromZoom) {
      if (capitalDetail === null) return false;
      for (const batch of capitalBatches) batch.count = 0;
      capitalDetail = null;
      capitalLook = '';
      return true;
    }
    const look = `${view.rect.minX}|${view.rect.minZ}|${view.unitsPerPixel}|${view.heightUnits}|${view.zoom}|${ground.terrainVersion()}`;
    if (look === capitalLook) return false;
    capitalLook = look;
    const fade = zoomFade(capitals.fromZoom, capitals.fullZoom, view.zoom);
    const sizePx = valueAtZoom(capitals.sizePx, view.zoom);
    const unit = (sizePx * view.unitsPerPixel * fade) / capitals.referenceHeight;
    const reach = (capitals.clusterPx + sizePx) * view.unitsPerPixel;
    for (const batch of capitalBatches) batch.count = 0;
    for (const cluster of clusters) {
      // The copy of the capital nearest the view (the map wraps east–west).
      const x = view.centerX + ((((cluster.x - view.centerX + 180) % 360) + 360) % 360) - 180;
      if (
        x < view.rect.minX - reach ||
        x > view.rect.maxX + reach ||
        cluster.z < view.rect.minZ - reach ||
        cluster.z > view.rect.maxZ + reach
      )
        continue;
      for (const building of cluster.buildings) {
        const bx = x + building.offsetX * view.unitsPerPixel;
        const bz = cluster.z + building.offsetZ * view.unitsPerPixel;
        const batch = capitalBatches[building.variant];
        reserve(batch, batch.count + 1);
        writeInstanceMatrix(
          batch.matrices,
          batch.count,
          bx,
          ground.heightAt(bx, bz) * view.heightUnits,
          bz,
          unit * building.size,
          building.yaw,
        );
        batch.count += 1;
      }
    }
    for (const batch of capitalBatches) batch.version += 1;
    capitalDetail = detailForPixels(sizePx, config);
    return true;
  };

  const allBatches: InstanceBatch[] = [...forestBatches.flat(), ...capitalBatches];
  const capitalSet = new Set(capitalBatches);
  let lastView: SceneryView | null = null;
  let enabled = true;

  return {
    update(view) {
      lastView = view;
      if (!enabled) {
        drawn.show([], () => 'icon');
        return;
      }
      updateForests(view);
      updateCapitals(view);
      // Hand the batches over every frame: models that finished loading appear.
      drawn.show(allBatches, (batch) =>
        capitalSet.has(batch) ? (capitalDetail ?? 'icon') : (forestDetail ?? 'icon'),
      );
    },
    stats() {
      const counted = drawn.stats();
      return {
        trees: forestBatches.flat().reduce((sum, batch) => sum + batch.count, 0),
        treeDetail: forestDetail,
        capitalBuildings: capitalBatches.reduce((sum, batch) => sum + batch.count, 0),
        buildingDetail: capitalDetail,
        drawCalls: counted.drawCalls,
        triangles: counted.triangles,
        placeMs: Math.round(placeMs * 10) / 10,
        // Also while a new search is due (the view's zoom level or the terrain changed since the last one).
        searching:
          enabled &&
          (search !== null ||
            (forestDetail !== null &&
              lastView !== null &&
              (finestGridLevel(lastView.unitsPerPixel, forests.spacingPx) !== placedLevel ||
                ground.terrainVersion() !== placedTerrain))),
      };
    },
    probe(count) {
      const found: SceneryProbe[] = [];
      if (!lastView) return found;
      const units = lastView.heightUnits;
      for (const batch of allBatches) {
        const kind = capitalSet.has(batch) ? 'building' : 'tree';
        const reference = kind === 'tree' ? forests.referenceHeight : capitals.referenceHeight;
        for (let i = 0; i < batch.count && found.length < count; i++) {
          const o = i * 16;
          const x = batch.matrices[o + 12];
          const z = batch.matrices[o + 14];
          const scale = Math.hypot(batch.matrices[o], batch.matrices[o + 2]);
          found.push({
            kind,
            longitude: ground.longitude(x),
            latitude: ground.latitude(z),
            baseM: units > 0 ? batch.matrices[o + 13] / units : 0,
            heightPx: (scale * reference) / lastView.unitsPerPixel,
          });
        }
      }
      return found;
    },
    setEnabled(next) {
      enabled = next;
    },
    dispose() {
      drawn.dispose();
    },
  };
}
