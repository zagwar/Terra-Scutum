import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import {
  type DetailLevel,
  METRES_PER_MAP_UNIT,
  type RenderStressConfig,
  type SceneryConfig,
} from '@terra-scutum/sim';
import { hashUnit } from '../../generators/seeded-random';
import { addWrapCopies, createLineMesh } from '../map/map-meshes';
import { createLineMaterial } from '../map/line-material';
import { type InstanceBatch, createInstancedModels } from '../models/instanced-models';
import type { ModelLibrary } from '../models/model-library';
import type { SceneryGround, SceneryView } from '../scenery/map-scenery';
import { detailForPixels, valueAtZoom, writeInstanceMatrix } from '../scenery/scenery-placement';
import { drapeLines } from '../terrain/terrain-mesh';
import {
  RAIL_KIND,
  STRESS_BUILDING,
  type PlacedModels,
  type StressPlacement,
} from './stress-placement';

/**
 * The render stress test's late-game load on the map (F139, `?debug=stress`):
 * about 20,000 buildings, 5,000 units, a battle with 2,400 bugs (animated
 * every frame), infrastructure lines, rain, clouds, smoke, fire and laser
 * beams, all with placeholder models and effects [DEFAULT sizes in
 * `data/stress_test.json` → `render`]. It is drawn the way the game will
 * draw such things (thin instances, one draw call per model variant, detail
 * level and material; lines with the map's line shader; particle systems),
 * so its frame rate says how the browser copes with a late-game map.
 *
 * Unlike the game, which will show far-away cities as clusters (section
 * 12.5), everything is drawn at every zoom: the worst case.
 */
export interface StressScene {
  update(view: SceneryView): void;
  stats(): StressSceneStats;
  /** Turns parts of the load on or off (to see what each one costs). */
  setParts(parts: Partial<Record<StressPart, boolean>>): void;
  parts(): Readonly<Record<StressPart, boolean>>;
  dispose(): void;
}

/** The parts of the load: models (buildings, units, bugs), lines, weather (rain, clouds), effects (smoke, fire, lasers). */
export const STRESS_PARTS = ['models', 'lines', 'weather', 'effects'] as const;
export type StressPart = (typeof STRESS_PARTS)[number];

export interface StressSceneStats {
  /** Models placed in all (not only on screen). */
  readonly buildings: number;
  readonly units: number;
  readonly bugs: number;
  readonly lines: number;
  /** Models drawn this frame, and what they cost. */
  readonly modelsDrawn: number;
  readonly modelDetail: DetailLevel;
  readonly modelDrawCalls: number;
  readonly modelTriangles: number;
  /** The main thread's time for the load's own work in the last frame (placing, animating), in milliseconds. */
  readonly updateMs: number;
  /** Particles alive now (rain, smoke, fire), cloud sprites, laser beams. */
  readonly particles: number;
  readonly clouds: number;
  readonly lasers: number;
}

/** Real heights (metres) the size on screen refers to, by kind of model [DEFAULT]. */
const REFERENCE_HEIGHT_M = [20, 3.5, 3] as const;
/** How many models' ground heights are read again per frame after the terrain changed. */
const HEIGHTS_PER_FRAME = 4000;
const RENDERING_GROUP = 1;
/** Rain falls only from this zoom on [DEFAULT]. */
const RAIN_FROM_ZOOM = 4;

/** Smooth value noise from 0 to 1 at a point of a `cells`-wide grid (for the clouds' lumps). */
function valueNoise(x: number, y: number, cells: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const corner = (cx: number, cy: number) => hashUnit(seed, ((cx % cells) + cells) % cells, cy);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = corner(x0, y0) + (corner(x0 + 1, y0) - corner(x0, y0)) * sx;
  const bottom = corner(x0, y0 + 1) + (corner(x0 + 1, y0 + 1) - corner(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** A small round, soft-edged picture (white with alpha), for particles and clouds (`lumpy`). */
function softDotTexture(scene: Scene, size: number, lumpy: boolean): Texture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let edge = 1 - Math.hypot(u - 0.5, v - 0.5) * 2;
      if (lumpy)
        edge *= 0.45 + 0.35 * valueNoise(u * 4, v * 4, 4, 1) + 0.2 * valueNoise(u * 9, v * 9, 9, 2);
      const alpha = Math.max(0, Math.min(1, edge * 1.6));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * alpha * 255);
    }
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

interface ModelSet {
  readonly placed: PlacedModels;
  /** Each model's ground height (metres) and the terrain version it was read at. */
  readonly groundM: Float32Array;
  readonly groundVersion: Int32Array;
  /** One batch per model and variant. */
  readonly batches: InstanceBatch[][];
  /** The view these were last drawn for (static sets are drawn again only when it changes). */
  look: string;
  heightCursor: number;
}

export function createStressScene(
  scene: Scene,
  library: ModelLibrary,
  config: RenderStressConfig,
  scenery: Pick<SceneryConfig, 'simplePx' | 'detailedPx'>,
  placement: StressPlacement,
  ground: SceneryGround,
): StressScene {
  const drawn = createInstancedModels(scene, library, 'stress', RENDERING_GROUP);
  const variants = placement.models.map((id) => Math.max(1, library.variants(id)));

  const makeSet = (placed: PlacedModels): ModelSet => {
    const batches = placement.models.map((modelId, m) =>
      Array.from({ length: variants[m] }, (_, variant) => ({
        modelId,
        variant,
        matrices: new Float32Array(16 * Math.max(1, placed.count)),
        colors: null,
        count: 0,
        version: 0,
      })),
    );
    return {
      placed,
      groundM: new Float32Array(placed.count),
      groundVersion: new Int32Array(placed.count).fill(-1),
      batches,
      look: '',
      heightCursor: 0,
    };
  };
  const statics = makeSet(placement.statics);
  const defenders = makeSet(placement.defenders);
  const bugs = makeSet(placement.bugs);
  const sets = [statics, defenders, bugs];
  const allBatches = sets.flatMap((set) => set.batches.flat());

  /** Reads the ground under up to HEIGHTS_PER_FRAME models whose height is from older terrain; true if any changed. */
  const refreshHeights = (set: ModelSet, budget: number): number => {
    const version = ground.terrainVersion();
    const { placed } = set;
    let done = 0;
    for (let n = 0; n < placed.count && done < budget; n++) {
      const i = (set.heightCursor + n) % placed.count;
      if (set.groundVersion[i] === version) continue;
      set.groundM[i] = Math.max(0, ground.heightAt(placed.x[i], placed.z[i]));
      set.groundVersion[i] = version;
      done += 1;
      set.heightCursor = (i + 1) % placed.count;
    }
    return done;
  };

  let detail: DetailLevel = 'icon';
  let unitPerMetre = [0, 0, 0];

  /** Writes the matrices of the models of a set that are in view; `animate` moves bugs. */
  const drawSet = (set: ModelSet, view: SceneryView, seconds: number, animate: boolean) => {
    for (const row of set.batches) for (const batch of row) batch.count = 0;
    const { placed } = set;
    const { minX, maxX, minZ, maxZ } = view.rect;
    const margin = 20 * view.unitsPerPixel;
    const wave = placement.battle.halfSize * 0.12;
    for (let i = 0; i < placed.count; i++) {
      let x = placed.x[i];
      let z = placed.z[i];
      let yaw = placed.yaw[i];
      if (animate) {
        // Bugs surge forward (west) and fall back in waves, and sway a little.
        const phase = placed.phase[i] * Math.PI * 2;
        x -= (0.5 + 0.5 * Math.sin(seconds * 0.6 + phase)) * wave;
        z += Math.sin(seconds * 1.7 + phase * 3) * wave * 0.08;
        yaw += Math.sin(seconds * 2.3 + phase) * 0.25;
      }
      // The copy of the model nearest the view (the map wraps east–west).
      x = view.centerX + ((((x - view.centerX + 180) % 360) + 360) % 360) - 180;
      if (x < minX - margin || x > maxX + margin || z < minZ - margin || z > maxZ + margin)
        continue;
      const batch = set.batches[placed.model[i]][placed.variant[i]];
      writeInstanceMatrix(
        batch.matrices,
        batch.count,
        x,
        set.groundM[i] * view.heightUnits,
        z,
        unitPerMetre[placed.kind[i]] * placed.size[i],
        yaw,
      );
      batch.count += 1;
    }
    for (const row of set.batches) for (const batch of row) batch.version += 1;
  };

  // ── Infrastructure lines ─────────────────────────────────────────────────
  const { road, rail, power } = config.infrastructure;
  const lineMaterial = createLineMaterial('stress-lines', scene, {
    plain: { color: road.color, opacity: 0.85, widthPx: road.widthPx },
    emphasis: { color: rail.color, opacity: 0.9, widthPx: rail.widthPx },
    emphasisFlag: RAIL_KIND,
    coast: { color: power.color, opacity: 0.7, widthPx: power.widthPx },
  });
  const lineGeometry = drapeLines(
    placement.lines,
    (x, z) => Math.max(0, ground.heightAt(x, z)),
    0.5,
  );
  const lineMeshes = addWrapCopies(
    createLineMesh('stress-lines', scene, lineGeometry, lineMaterial.material, RENDERING_GROUP, 5),
    360,
  );

  // ── Clouds ───────────────────────────────────────────────────────────────
  const cloudMaterial = new StandardMaterial('stress-clouds', scene);
  cloudMaterial.disableLighting = true;
  cloudMaterial.emissiveColor = new Color3(0.95, 0.96, 0.98);
  cloudMaterial.diffuseTexture = softDotTexture(scene, 64, true);
  cloudMaterial.diffuseTexture.hasAlpha = true;
  cloudMaterial.useAlphaFromDiffuseTexture = true;
  cloudMaterial.alpha = 0.45;
  cloudMaterial.backFaceCulling = false;
  cloudMaterial.disableDepthWrite = true;
  const cloudMesh: Mesh = CreateGround('stress-clouds', { width: 1, height: 1 }, scene);
  cloudMesh.material = cloudMaterial;
  cloudMesh.renderingGroupId = RENDERING_GROUP;
  cloudMesh.isPickable = false;
  cloudMesh.alphaIndex = 20;
  const cloudCount = config.weather.clouds;
  const cloudMatrices = new Float32Array(16 * Math.max(1, cloudCount));
  const cloudBase = Array.from({ length: cloudCount }, (_, i) => ({
    x: hashUnit(7, i, 1) * 360 - 180,
    z: ground.z(-55 + hashUnit(7, i, 2) * 130),
    size: 3 + hashUnit(7, i, 3) * 6,
    yaw: hashUnit(7, i, 4) * Math.PI,
  }));
  cloudMesh.thinInstanceSetBuffer('matrix', cloudMatrices, 16, false);
  cloudMesh.thinInstanceCount = cloudCount;
  cloudMesh.alwaysSelectAsActiveMesh = true;

  // ── Laser beams (from the bugs into the sky) ─────────────────────────────
  const laserMaterial = new StandardMaterial('stress-lasers', scene);
  laserMaterial.disableLighting = true;
  laserMaterial.emissiveColor = new Color3(1, 0.35, 0.2);
  laserMaterial.alpha = 0.85;
  laserMaterial.alphaMode = Constants.ALPHA_ADD;
  laserMaterial.disableDepthWrite = true;
  const laserMesh: Mesh = CreateBox('stress-lasers', { size: 1 }, scene);
  laserMesh.material = laserMaterial;
  laserMesh.renderingGroupId = RENDERING_GROUP;
  laserMesh.isPickable = false;
  laserMesh.alwaysSelectAsActiveMesh = true;
  const laserCount = Math.min(config.battle.lasers, placement.bugs.count);
  const laserMatrices = new Float32Array(16 * Math.max(1, laserCount));
  laserMesh.thinInstanceSetBuffer('matrix', laserMatrices, 16, false);
  laserMesh.thinInstanceCount = laserCount;

  // ── Particles: rain over the view, smoke and fire at the battle ──────────
  const dot = softDotTexture(scene, 32, false);
  const battle = placement.battle;
  const explosionSpots = Array.from({ length: Math.max(1, config.battle.explosions) }, (_, i) => ({
    x: battle.x + (hashUnit(11, i, 1) - 0.65) * battle.halfSize * 0.9,
    z: battle.z + (hashUnit(11, i, 2) - 0.5) * battle.halfSize * 1.6,
  }));
  let viewNow: SceneryView | null = null;

  const makeParticles = (name: string, capacity: number): ParticleSystem | null => {
    if (capacity <= 0) return null;
    const system = new ParticleSystem(name, capacity, scene);
    system.particleTexture = dot;
    system.emitter = Vector3.Zero();
    system.renderingGroupId = RENDERING_GROUP;
    system.updateSpeed = 0.01;
    system.minLifeTime = 1;
    system.maxLifeTime = 1;
    system.emitRate = capacity / 1.7;
    system.isLocal = false;
    return system;
  };
  const rain = makeParticles('stress-rain', config.weather.rainParticles);
  const smoke = makeParticles('stress-smoke', config.weather.smokeParticles);
  const fire = makeParticles('stress-fire', config.weather.fireParticles);
  if (rain) {
    // No rain until the first frame says the view is close enough (see `RAIN_FROM_ZOOM`).
    rain.emitRate = 0;
    rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    rain.color1 = new Color4(0.75, 0.8, 0.9, 0.55);
    rain.color2 = new Color4(0.75, 0.8, 0.9, 0.35);
    rain.colorDead = new Color4(0.75, 0.8, 0.9, 0);
    rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    rain.startPositionFunction = (_matrix, position) => {
      const view = viewNow;
      if (!view) return;
      position.x = view.rect.minX + Math.random() * (view.rect.maxX - view.rect.minX);
      position.z = view.rect.minZ + Math.random() * (view.rect.maxZ - view.rect.minZ);
      position.y = view.unitsPerPixel * 260 * Math.random() + view.unitsPerPixel * 40;
    };
    rain.startDirectionFunction = (_matrix, direction) => direction.set(0.08, -1, 0.03);
  }
  const battleSpot = (position: Vector3, spread: number, lift: number) => {
    const spot = explosionSpots[Math.floor(Math.random() * explosionSpots.length)];
    const view = viewNow;
    const unit = view ? view.unitsPerPixel : 0.01;
    position.x = spot.x + (Math.random() - 0.5) * unit * spread;
    position.z = spot.z + (Math.random() - 0.5) * unit * spread;
    position.y =
      (view ? Math.max(0, ground.heightAt(spot.x, spot.z)) * view.heightUnits : 0) + unit * lift;
  };
  if (smoke) {
    smoke.color1 = new Color4(0.25, 0.24, 0.23, 0.55);
    smoke.color2 = new Color4(0.4, 0.38, 0.36, 0.45);
    smoke.colorDead = new Color4(0.5, 0.5, 0.5, 0);
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.minLifeTime = 2;
    smoke.maxLifeTime = 3.5;
    smoke.emitRate = config.weather.smokeParticles / 4.5;
    smoke.startPositionFunction = (_m, position) => battleSpot(position, 10, 2);
    smoke.startDirectionFunction = (_m, direction) =>
      direction.set(0.25 + Math.random() * 0.2, 1, (Math.random() - 0.5) * 0.3);
  }
  if (fire) {
    fire.color1 = new Color4(1, 0.65, 0.2, 0.9);
    fire.color2 = new Color4(1, 0.35, 0.1, 0.8);
    fire.colorDead = new Color4(0.3, 0.05, 0, 0);
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.minLifeTime = 0.4;
    fire.maxLifeTime = 0.9;
    fire.emitRate = config.weather.fireParticles / 1.1;
    fire.startPositionFunction = (_m, position) => battleSpot(position, 6, 0.5);
    fire.startDirectionFunction = (_m, direction) =>
      direction.set((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4);
  }
  const particleSystems = [rain, smoke, fire].filter((p): p is ParticleSystem => p !== null);
  for (const system of particleSystems) system.start();

  let updateMs = 0;
  let lastStats = { modelsDrawn: 0, modelDrawCalls: 0, modelTriangles: 0 };
  const startedAt = performance.now();

  /** Clouds drift east above the land. */
  const updateClouds = (view: SceneryView, seconds: number) => {
    const cloudY = view.unitsPerPixel * 30 + 9000 * view.heightUnits;
    for (let i = 0; i < cloudCount; i++) {
      const cloud = cloudBase[i];
      let x = cloud.x + seconds * 0.15;
      x = view.centerX + ((((x - view.centerX + 180) % 360) + 360) % 360) - 180;
      writeInstanceMatrix(cloudMatrices, i, x, cloudY, cloud.z, cloud.size, cloud.yaw);
    }
    cloudMesh.thinInstanceBufferUpdated('matrix');
  };
  /** Laser beams: each one fires from a bug for a moment, then another bug fires. */
  const updateLasers = (view: SceneryView, seconds: number) => {
    const beamHeight = view.unitsPerPixel * 180;
    const beamWidth = view.unitsPerPixel * 1.6;
    for (let i = 0; i < laserCount; i++) {
      const turn = Math.floor(seconds * 2.5 + hashUnit(13, i, 0) * 7);
      const bug = Math.floor(hashUnit(13, i, turn) * placement.bugs.count);
      let x = placement.bugs.x[bug];
      x = view.centerX + ((((x - view.centerX + 180) % 360) + 360) % 360) - 180;
      const y = bugs.groundM[bug] * view.heightUnits + beamHeight / 2;
      const o = i * 16;
      laserMatrices.fill(0, o, o + 16);
      laserMatrices[o] = beamWidth;
      laserMatrices[o + 5] = beamHeight;
      laserMatrices[o + 10] = beamWidth;
      laserMatrices[o + 12] = x;
      laserMatrices[o + 13] = y;
      laserMatrices[o + 14] = placement.bugs.z[bug];
      laserMatrices[o + 15] = 1;
    }
    laserMesh.thinInstanceBufferUpdated('matrix');
  };

  const parts: Record<StressPart, boolean> = {
    models: true,
    lines: true,
    weather: true,
    effects: true,
  };
  const run = (system: ParticleSystem | null, on: boolean) => {
    if (!system) return;
    if (on && !system.isStarted()) system.start();
    if (!on && system.isStarted()) system.stop();
  };
  const applyParts = () => {
    if (!parts.models) drawn.show([], () => 'icon');
    for (const set of sets) set.look = '';
    for (const mesh of lineMeshes) mesh.setEnabled(parts.lines);
    cloudMesh.setEnabled(parts.weather);
    run(rain, parts.weather);
    laserMesh.setEnabled(parts.effects);
    run(smoke, parts.effects);
    run(fire, parts.effects);
  };

  return {
    update(view) {
      const updateStartedAt = performance.now();
      viewNow = view;
      const seconds = (performance.now() - startedAt) / 1000;
      const sizePx = valueAtZoom(config.sizePx, view.zoom);
      detail = detailForPixels(sizePx, scenery);
      unitPerMetre = REFERENCE_HEIGHT_M.map((metres) => (sizePx * view.unitsPerPixel) / metres);

      // Ground heights follow the terrain as finer tiles arrive (a slice per frame).
      let budget = HEIGHTS_PER_FRAME;
      for (const set of sets) budget -= refreshHeights(set, budget);
      const heightsChanged = budget < HEIGHTS_PER_FRAME;

      const look = `${view.rect.minX}|${view.rect.minZ}|${view.rect.maxX}|${view.rect.maxZ}|${view.unitsPerPixel}|${view.heightUnits}`;
      if (parts.models) {
        for (const set of [statics, defenders]) {
          if (set.look === look && !heightsChanged) continue;
          set.look = look;
          drawSet(set, view, seconds, false);
        }
        drawSet(bugs, view, seconds, true);
        drawn.show(allBatches, () => detail);
      }
      lastStats = (({ instances, drawCalls, triangles }) => ({
        modelsDrawn: instances,
        modelDrawCalls: drawCalls,
        modelTriangles: triangles,
      }))(drawn.stats());

      // Lines: heights at real scale, raised by the land's exaggeration of the moment.
      lineMaterial.setHeightScale(view.heightUnits * METRES_PER_MAP_UNIT);
      lineMaterial.updateResolution();

      if (parts.weather) updateClouds(view, seconds);
      if (parts.effects) updateLasers(view, seconds);

      // Particle sizes and speeds follow the zoom (a few pixels on screen).
      if (rain) {
        // Rain only from the operational zoom: from farther away, the weather is the clouds.
        rain.emitRate = view.zoom >= RAIN_FROM_ZOOM ? config.weather.rainParticles / 1.7 : 0;
        rain.minSize = rain.maxSize = view.unitsPerPixel * 1.2;
        rain.minScaleY = rain.maxScaleY = 6;
        rain.minEmitPower = rain.maxEmitPower = (view.unitsPerPixel * 300) / 1.7 / 0.6;
      }
      if (smoke) {
        smoke.minSize = view.unitsPerPixel * 12;
        smoke.maxSize = view.unitsPerPixel * 28;
        smoke.minEmitPower = smoke.maxEmitPower = (view.unitsPerPixel * 25) / 0.6;
      }
      if (fire) {
        fire.minSize = view.unitsPerPixel * 5;
        fire.maxSize = view.unitsPerPixel * 12;
        fire.minEmitPower = fire.maxEmitPower = (view.unitsPerPixel * 15) / 0.6;
      }
      updateMs = performance.now() - updateStartedAt;
    },
    stats() {
      let buildings = 0;
      for (let i = 0; i < placement.statics.count; i++)
        if (placement.statics.kind[i] === STRESS_BUILDING) buildings += 1;
      return {
        buildings,
        units: placement.statics.count - buildings + placement.defenders.count,
        bugs: placement.bugs.count,
        lines: placement.lines.length,
        ...lastStats,
        modelDetail: detail,
        updateMs,
        particles: particleSystems.reduce((sum, system) => sum + system.getActiveCount(), 0),
        clouds: cloudCount,
        lasers: laserCount,
      };
    },
    setParts(next) {
      for (const part of STRESS_PARTS) if (next[part] !== undefined) parts[part] = next[part];
      applyParts();
    },
    parts: () => ({ ...parts }),
    dispose() {
      drawn.dispose();
      for (const system of particleSystems) system.dispose();
      for (const mesh of lineMeshes) mesh.dispose();
      lineMaterial.material.dispose();
      cloudMesh.dispose();
      cloudMaterial.dispose();
      laserMesh.dispose();
      laserMaterial.dispose();
      dot.dispose();
    },
  };
}
