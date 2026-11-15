import { countryFrame } from './country-frame';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Culling/ray';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  METRES_PER_MAP_UNIT,
  type MapViewConfig,
  type TerrainTilesFile,
  type WorldMap,
  terrainCellSize,
  terrainLayout,
} from '@terra-scutum/sim';
import { presimplify, simplify } from 'topojson-simplify';
import type { Objects, Topology } from 'topojson-specification';
import provincesUrl from '../../../../../data/geometry/provinces.topo.json?url';
import riversUrl from '../../../../../data/geometry/rivers.json?url';
import seaZonesUrl from '../../../../../data/geometry/sea_zones.topo.json?url';
import { type CameraFit, fitMapCamera } from './camera-fit';
import {
  cameraAlphaForHeading,
  edgeScrollDirection,
  glideFraction,
  screenAxes,
  tiltForZoom,
  wrappedDelta,
} from './camera-motion';
import { type LineMaterial, type LineStyles, createLineMaterial } from './line-material';
import {
  type MapMode,
  applySeaHighlight,
  parseHexColor,
  provinceBaseColors,
  provinceHighlights,
  seaZoneColors,
} from './map-colors';
import {
  LINE_COAST,
  LINE_OTHER_COUNTRY,
  LINE_OTHER_REGION,
  LINE_PLAIN,
  type MapPolygon,
  type StyledLine,
  buildInnerBorders,
  buildLineGeometry,
  buildProvinceBorders,
  decodePolygons,
  outlineOf,
  triangulate,
  wholeLine,
} from './map-geometry';
import {
  addWrapCopies,
  createColorTable,
  createFillMaterial,
  createFillMesh,
  createLineMesh,
} from './map-meshes';
import { createMapProjection } from './map-projection';
import { type MapTarget, createShapeLookup, findTarget } from './shape-lookup';
import { type TerrainShapes, createTerrainLand } from '../terrain/terrain-land';
import { drapeLines } from '../terrain/terrain-mesh';
import { createModelLights } from '../models/instanced-models';
import type { ModelLibrary } from '../models/model-library';
import {
  type MapScenery,
  type SceneryProbe,
  type SceneryStats,
  type SceneryView,
  createMapScenery,
} from '../scenery/map-scenery';

export type { MapTarget } from './shape-lookup';

/**
 * The world map in the 3D scene (F01): sea zones underneath, provinces on
 * top, border lines, mouse picking and the strategy camera (F03).
 *
 * - The camera glides (zoom, scrolling, turning) towards where the input
 *   sends it. Mouse wheel and +/-: zoom (towards the mouse); dragging: move,
 *   exactly with the mouse; WASD, the arrow keys and the window's edge:
 *   scroll (faster with Shift held); middle mouse button or Q/E: turn; Home: the whole world, north
 *   up. On a touch screen: tap = click, one finger drags, two fingers pinch
 *   to zoom and move the map together. The camera leans back more the closer it zooms in. The math is in
 *   `camera-motion.ts`.
 *
 * - The land is real terrain (F125, `../terrain/`): the provinces are cut into
 *   terrain tiles that load as the view needs them, finer ones the closer the
 *   view. The land rises more (exaggerated) than in reality; the map mode's
 *   colors fade as the view zooms in, so the terrain shows through. The sea
 *   stays flat at y = 0.
 * - The map wraps east–west: the camera's position is kept inside the main
 *   copy of the world, and the map is drawn on both sides of it, so
 *   scrolling never reaches an edge.
 * - Province colors come from a one-pixel-per-province texture, so map modes
 *   and highlights are instant.
 * - Ownership (F02) comes from the sim through `setProvinceOwners`: the
 *   political colors and the country borders follow the current owners.
 *   Border lines know the provinces on their two sides, so a change of
 *   owner only rewrites one small number per vertex of the lines it affects.
 * - Picking: the mouse's ray is followed to where it meets the land as it is
 *   drawn (`groundAt`), then the shape lookup says which province is there
 *   (exact, no GPU readback). Sea zones (F70) are picked the same way; land
 *   wins where the two overlap, because the sea zone shapes continue under
 *   the land.
 * - The coarse terrain levels are drawn from simplified shapes, the finer
 *   ones from the full shapes.
 */

export interface MapViewEvents {
  /** The province or sea zone under the mouse changed (null: nothing, outside the map). */
  onHover(target: MapTarget | null): void;
  /** The map was clicked: on a province, on a sea zone, or outside the map (null). */
  onClick(target: MapTarget | null): void;
}

/** Numbers for checking the map's performance. */
export interface MapStats {
  readonly provinces: number;
  readonly seaZones: number;
  /** Which shapes the land is drawn from right now: simplified (far) or full (near). */
  readonly detail: 'far' | 'near';
  /** The terrain level the zoom asks for (0 = coarsest). */
  readonly terrainLevel: number;
  /** Terrain tiles on screen, tiles the view still waits for, and tiles kept ready. */
  readonly terrainTiles: number;
  readonly terrainPending: number;
  readonly terrainReady: number;
  /** The longest a single terrain tile took to build, in milliseconds. */
  readonly slowestTileBuildMs: number;
  /** How many times higher than in reality the land is drawn right now. */
  readonly exaggeration: number;
  /** How much of the map mode's color covers the terrain right now: 0…1. */
  readonly colorStrength: number;
  /** What the last frame actually drew. */
  readonly drawnTriangles: number;
  readonly drawnMeshes: number;
  /** Time to download and read the shape files, in milliseconds. */
  readonly loadMs: number;
  /** Time to build the map (the sea and the coarsest terrain level), in milliseconds. */
  readonly buildMs: number;
  /** The scenery on the land (F133): trees and capital markers. */
  readonly scenery: SceneryStats;
}

export interface MapView {
  getStats(): MapStats;
  setMode(mode: MapMode): void;
  /** Who owns each province now (country indices, from the sim's snapshot). */
  setProvinceOwners(provinceOwner: Uint16Array): void;
  setSelectedProvince(province: number | null): void;
  setSelectedSeaZone(seaZone: number | null): void;
  /** Tints every province of a country (index), or none (null): the country picked while choosing (F05). */
  setHighlightedCountry(country: number | null): void;
  /** The province index at a longitude/latitude, or -1 for the sea. */
  provinceAt(longitude: number, latitude: number): number;
  /** The height of the land as drawn right now at a longitude/latitude, in metres (0 at sea). */
  heightAt(longitude: number, latitude: number): number;
  /** Up to `count` of the scenery's models as drawn right now (tests check they stand on the land). */
  sceneryProbe(count: number): SceneryProbe[];
  /** Turns the scenery (F133) on or off. */
  setSceneryEnabled(enabled: boolean): void;
  /** The sea zone index at a longitude/latitude, or -1 for land (or outside the map). */
  seaZoneAt(longitude: number, latitude: number): number;
  /** Where a longitude/latitude is on screen, in CSS pixels from the canvas's top-left corner. */
  screenPosition(longitude: number, latitude: number): { x: number; y: number };
  /** The longitude/latitude under a point of the canvas (CSS pixels), or null if it misses the ground. */
  placeAt(x: number, y: number): { longitude: number; latitude: number } | null;
  /** Scrolls the map east (positive) or west (negative), in degrees of longitude. */
  scrollBy(degrees: number): void;
  /**
   * Points the camera at a place right away (no glide). Zoom 1 shows the
   * whole world (and ignores the latitude: the map stays centered top to
   * bottom); zoom 4 is four times closer. The heading is kept (north up at zoom 1).
   */
  lookAt(longitude: number, latitude: number, zoom: number): void;
  /** The longitude at the middle of the screen. */
  centerLongitude(): number;
  /** How far the view is zoomed in: 1 shows the whole world. */
  zoom(): number;
  /** Which way the top of the screen points, in radians: 0 = north, π/2 = east. */
  heading(): number;
  /** How far the camera leans back from looking straight down, in radians (it grows as the view zooms in). */
  tilt(): number;
  /** True while the camera is still gliding to where it was sent. */
  isMoving(): boolean;
  /** Finishes any glide at once (used by tests). */
  settle(): void;
  /** Glides back to the whole world, north up. */
  resetView(): void;
  /** Turns scrolling at the window's edge on or off (tests park the mouse at the edge). */
  setEdgeScrolling(enabled: boolean): void;
  /**
   * Brings a province into view: glides to it and, if it would be too small
   * to see, zooms in until it is.
   */
  focusProvince(province: number): void;
  /** Brings a sea zone into view: glides to its label point. */
  focusSeaZone(seaZone: number): void;
  /**
   * Brings a country into view (F05): glides to its main part around the
   * capital (`countryFrame`) and zooms so that part fills about half the screen.
   */
  focusCountry(country: number): void;
  dispose(): void;
}

/** Layers are drawn in a fixed order: the sea first, then the land on top of it. */
const SEA_GROUP = 0;
const LAND_GROUP = 1;
/** `focusCountry`: pieces of a country farther than this from its capital (east–west, degrees) are not framed [DEFAULT]. */
const COUNTRY_FRAME_REACH_DEGREES = 50;
/** `focusCountry`: the share of the screen the framed country fills [DEFAULT]. */
const COUNTRY_FRAME_SHARE = 0.5;
/** How far the mouse may move between press and release for it to count as a click, in pixels. */
const CLICK_TOLERANCE_PX = 4;
/** The same for a tap with a finger, which wobbles more than a mouse. */
const TAP_TOLERANCE_PX = 10;

/** A TopoJSON file's content (the shapes carry only an id, no other properties). */
type MapTopology = Topology<Objects<Record<string, never>>>;

/** `data/geometry/rivers.json`: each river's stroke weight and its points (whole units, stored as steps). */
interface RiversFile {
  readonly unitsPerDegree: number;
  readonly rivers: readonly { readonly weight: number; readonly points: readonly number[] }[];
}

async function fetchTopology(url: string): Promise<MapTopology> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as MapTopology;
}

/** The line style for sea zone borders in a map mode: they stand out in the sea zones map mode. */
function seaLineStyles(mode: MapMode, lines: MapViewConfig['lines']): LineStyles {
  return { plain: mode === 'seaZones' ? lines.seaZoneBorderEmphasis : lines.seaZoneBorder };
}

/** The line styles for land borders in a map mode: which borders stand out, and how. */
function landLineStyles(mode: MapMode, lines: MapViewConfig['lines']): LineStyles {
  return {
    plain: lines.provinceBorder,
    coast: lines.coast,
    // Regions mode: region borders stand out. All other modes: country borders.
    emphasis: mode === 'regions' ? lines.regionBorder : lines.countryBorder,
    emphasisFlag: mode === 'regions' ? LINE_OTHER_REGION : LINE_OTHER_COUNTRY,
  };
}

export async function createMapView(
  scene: Scene,
  world: WorldMap,
  config: MapViewConfig,
  terrainTiles: TerrainTilesFile,
  models: ModelLibrary,
  events: MapViewEvents,
): Promise<MapView> {
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();
  if (!canvas) throw new Error('the map needs a canvas');

  const loadStart = performance.now();
  const [provinceTopology, seaTopology, riversFile] = await Promise.all([
    fetchTopology(provincesUrl),
    fetchTopology(seaZonesUrl),
    fetch(riversUrl).then((response) => {
      if (!response.ok) throw new Error(`${riversUrl}: HTTP ${response.status}`);
      return response.json() as Promise<RiversFile>;
    }),
  ]);
  const buildStart = performance.now();

  // ── Shapes ────────────────────────────────────────────────────────────────
  const projection = createMapProjection(config.projection);
  const worldWidth = projection.width;
  const indexIn = (index: ReadonlyMap<string, number>, what: string) => (id: string) => {
    const found = index.get(id);
    if (found === undefined) throw new Error(`the map shapes contain an unknown ${what}: ${id}`);
    return found;
  };
  const provinceIndex = indexIn(world.provinceIndex, 'province');
  const bordersOf = (topology: MapTopology) =>
    buildProvinceBorders(
      topology,
      'provinces',
      provinceIndex,
      world.provinceCountry,
      world.provinceRegion,
      projection,
    );
  // The full shapes: used for picking, for outlines and for the finer terrain levels.
  const provincePolygons = decodePolygons(provinceTopology, 'provinces', provinceIndex, projection);
  const lookup = createShapeLookup(provincePolygons, projection);
  // The coarse terrain levels' shapes. Simplifying the topology keeps neighbors fitting together without gaps.
  const tolerance = config.detail.farSimplifyDegrees;
  const farTopology =
    tolerance > 0
      ? simplify(presimplify(provinceTopology), tolerance * tolerance)
      : provinceTopology;

  // ── Scene ─────────────────────────────────────────────────────────────────
  const [r, g, b] = parseHexColor(config.colors.background);
  scene.clearColor = new Color4(r / 255, g / 255, b / 255, 1);
  scene.skipPointerMovePicking = true;

  const allMeshes: Mesh[] = [];
  const lineMaterials: LineMaterial[] = [];
  const lineMaterial = (name: string, styles: LineStyles) => {
    const material = createLineMaterial(name, scene, styles);
    lineMaterials.push(material);
    return material;
  };

  let mode: MapMode = 'political';

  // The sea: always drawn the same way (it has few shapes), as three copies.
  const seaPolygons = decodePolygons(
    seaTopology,
    'seaZones',
    indexIn(world.seaZoneIndex, 'sea zone'),
    projection,
  );
  const seaLookup = createShapeLookup(seaPolygons, projection);
  const seaTable = createColorTable('sea-zone-colors', scene, world.seaZoneIds.length);
  const seaMaterial = createFillMaterial('sea-zones-material', scene, seaTable);
  const seaFill = createFillMesh(
    'sea-zones',
    scene,
    triangulate(seaPolygons),
    seaTable,
    seaMaterial,
    SEA_GROUP,
  );
  const seaLineMaterial = lineMaterial(
    'sea-zone-borders-material',
    seaLineStyles(mode, config.lines),
  );
  const seaLines = createLineMesh(
    'sea-zone-borders',
    scene,
    buildLineGeometry(buildInnerBorders(seaTopology, 'seaZones', projection).map(wholeLine)),
    seaLineMaterial.material,
    SEA_GROUP,
    0,
  );
  allMeshes.push(...addWrapCopies(seaFill, worldWidth), ...addWrapCopies(seaLines, worldWidth));

  // The land (F125): the provinces lie on terrain tiles (`../terrain/terrain-land.ts`).
  // Until the sim's first owners arrive: the starting owners.
  let owners: Uint16Array = world.provinceCountry.slice();
  const terrainConfig = config.terrain;
  const layout = terrainLayout(terrainTiles);
  // Row 0: each province's map-mode color; row 1: its highlight.
  const provinceTable = createColorTable('province-colors', scene, world.provinceIds.length, 2);
  const landLines = lineMaterial('borders-material', landLineStyles(mode, config.lines));
  const riverLines = lineMaterial('rivers-material', {
    plain: config.lines.river,
    emphasis: config.lines.riverMajor,
    emphasisFlag: LINE_OTHER_COUNTRY,
    coast: config.lines.riverGreat,
  });
  const selectionMaterial = lineMaterial('selection-material', { plain: config.lines.selection });
  let selectionMeshes: Mesh[] = [];
  let seaSelectionMeshes: Mesh[] = [];

  // The coarse levels are drawn from the simplified shapes, the finer ones from the full shapes.
  const farShapes: TerrainShapes = {
    polygons: decodePolygons(farTopology, 'provinces', provinceIndex, projection),
    borders: bordersOf(farTopology),
  };
  let fullShapes: TerrainShapes | null = null;
  const shapesFor = (level: number): TerrainShapes =>
    level <= terrainConfig.simplifiedShapesMaxLevel
      ? farShapes
      : (fullShapes ??= { polygons: provincePolygons, borders: bordersOf(provinceTopology) });

  // Rivers: thin, major and great ones use the line shader's three styles.
  const rivers: { weight: number; line: StyledLine }[] = riversFile.rivers.map((river) => {
    const points = new Float32Array(river.points.length);
    let longitude = 0;
    let latitude = 0;
    for (let i = 0; i < river.points.length; i += 2) {
      longitude += river.points[i] / riversFile.unitsPerDegree;
      latitude += river.points[i + 1] / riversFile.unitsPerDegree;
      points[i] = projection.x(longitude);
      points[i + 1] = projection.z(latitude);
    }
    const { majorWeight, greatWeight } = terrainConfig.rivers;
    const kind =
      river.weight >= greatWeight
        ? LINE_COAST
        : river.weight >= majorWeight
          ? LINE_OTHER_COUNTRY
          : LINE_PLAIN;
    return { weight: river.weight, line: { points, kind } };
  });
  const riversOfLevel = new Map<number, StyledLine[]>();
  const riversFor = (level: number): StyledLine[] => {
    let lines = riversOfLevel.get(level);
    if (!lines) {
      const thinnest = terrainConfig.rivers.minWeightByLevel[level] ?? null;
      lines =
        thinnest === null
          ? []
          : rivers.filter((river) => river.weight >= thinnest).map((river) => river.line);
      riversOfLevel.set(level, lines);
    }
    return lines;
  };

  const terrain = createTerrainLand({
    scene,
    tiles: terrainTiles,
    config: terrainConfig,
    provinceTable,
    borderMaterial: landLines.material,
    riverMaterial: riverLines.material,
    renderingGroup: LAND_GROUP,
    shapesFor,
    riversFor,
    owners: () => owners,
    regionOf: world.provinceRegion,
  });

  // ── Scenery (F133): generated models standing on the land ─────────────────
  const scenery: MapScenery = createMapScenery(
    scene,
    models,
    config.scenery,
    world,
    {
      heightAt: (x, z) => terrain.heightAt(x, z),
      coverShareAt: (x, z, classes) => terrain.coverShareAt(x, z, classes),
      provinceAt: (x, z) => lookup.find(x, z),
      terrainVersion: () => terrain.drawnVersion(),
      latitude: (z) => projection.latitude(z),
      x: (longitude) => projection.x(longitude),
      z: (latitude) => projection.z(latitude),
      longitude: (x) => projection.longitude(x),
    },
    LAND_GROUP,
  );
  const lightAzimuth = (terrainConfig.lightAzimuthDegrees * Math.PI) / 180;
  const lightElevation = (terrainConfig.lightElevationDegrees * Math.PI) / 180;
  const modelLights = createModelLights(
    scene,
    [
      Math.sin(lightAzimuth) * Math.cos(lightElevation),
      Math.sin(lightElevation),
      Math.cos(lightAzimuth) * Math.cos(lightElevation),
    ],
    config.scenery.ambientLight,
    config.scenery.sunLight,
  );
  /** What the screen showed the last time the detail was updated; the scenery follows it every frame. */
  let sceneryView: SceneryView | null = null;

  // ── Colors and highlights ─────────────────────────────────────────────────
  let baseColors = provinceBaseColors(mode, world, config.colors, owners);
  const highlights = new Uint8Array(baseColors.length);
  let selected: number | null = null;
  let highlightedCountry: number | null = null;
  let hovered: MapTarget | null = null;
  const hoveredOf = (kind: MapTarget['kind']) => (hovered?.kind === kind ? hovered.index : null);
  /** The map mode's colors (row 0 of the land's color table). */
  const refreshBaseColors = () => provinceTable.update(baseColors, 0);
  /** The highlights (row 1): the picked country, the selection and its neighbors, the hovered province. */
  const refreshColors = () => {
    provinceHighlights(
      highlights,
      {
        selected,
        hovered: hoveredOf('province'),
        country: highlightedCountry === null ? null : { index: highlightedCountry, owners },
      },
      world,
      config.colors,
    );
    provinceTable.update(highlights, 1);
  };
  refreshBaseColors();
  refreshColors();
  let seaBaseColors = seaZoneColors(mode, world, config.colors);
  const seaShownColors = new Uint8Array(seaBaseColors.length);
  let selectedSeaZone: number | null = null;
  const refreshSeaColors = () => {
    applySeaHighlight(
      seaBaseColors,
      seaShownColors,
      { selected: selectedSeaZone, hovered: hoveredOf('seaZone') },
      config.colors,
    );
    seaTable.update(seaShownColors);
  };
  refreshSeaColors();

  /** Draws the selected province's outline on the land as it is drawn right now (again whenever that changes). */
  const drawSelection = () => {
    for (const mesh of selectionMeshes) mesh.dispose();
    selectionMeshes = [];
    if (selected === null) return;
    const outline = outlineOf(provincePolygons, selected, projection);
    const mesh = createLineMesh(
      'selection',
      scene,
      drapeLines(outline, (x, z) => terrain.heightAt(x, z), terrain.cellSize()),
      selectionMaterial.material,
      LAND_GROUP,
      2,
    );
    selectionMeshes = addWrapCopies(mesh, worldWidth);
  };

  // Mouse state (used further down; the camera code needs to flag "look under the mouse again").
  let pointer: { x: number; y: number } | null = null;
  let pointerMoved = false;
  let pressedAt: { x: number; y: number } | null = null;
  /** While the map is being dragged: where the mouse was at the last step. */
  let dragFrom: { x: number; y: number } | null = null;
  /** While the map is being turned with the middle mouse button: where the mouse was at the last step. */
  let rotateFrom: number | null = null;

  // ── The strategy camera (F03) ─────────────────────────────────────────────
  // The view glides: input changes where the camera is going (`goal`), and
  // every frame the camera covers part of the remaining way (`stepCamera`).
  // Dragging and the test hooks move both at once, so they are exact.
  const settings = config.camera;
  const degrees = (value: number) => (value * Math.PI) / 180;
  const farTilt = Math.max(0.001, degrees(settings.tiltDegrees));
  const nearTilt = Math.max(0.001, degrees(settings.tiltNearDegrees));
  const tiltAt = (zoomLevel: number) => tiltForZoom(zoomLevel, settings.maxZoom, farTilt, nearTilt);
  const camera = new ArcRotateCamera(
    'map-camera',
    -Math.PI / 2,
    farTilt,
    100,
    Vector3.Zero(),
    scene,
  );
  camera.fov = degrees(settings.fieldOfViewDegrees);
  camera.lowerBetaLimit = 0;
  scene.activeCamera = camera;

  /** Where the camera is now: the ground point in the middle of the screen, the zoom and the heading. */
  let centerX = 0;
  let centerZ = 0;
  let zoom = 1;
  let heading = 0;
  /** Where the camera is going. */
  const goal = { x: 0, z: 0, zoom: 1, heading: 0 };
  /** While a mouse-wheel zoom glides: the place (and its height, in metres) that must stay under the mouse. */
  let zoomAnchor: {
    readonly screen: { x: number; y: number };
    readonly ground: { x: number; z: number; height: number };
  } | null = null;
  let edgeScrolling = settings.edgeScrollPx > 0;
  let fit: CameraFit = { radius: 100, targetZ: 0 };
  let fittedAspect = 0;

  // ── The land's look at a zoom level (F125) ────────────────────────────────
  /** 0 with the whole world in view, 1 at the closest zoom, evenly per zoom step. */
  const zoomShare = (zoomLevel: number) =>
    settings.maxZoom > 1
      ? Math.min(1, Math.max(0, Math.log(zoomLevel) / Math.log(settings.maxZoom)))
      : 0;
  /** How many times higher than in reality the land is drawn at a zoom level. */
  const exaggerationAt = (zoomLevel: number) => {
    const { exaggeration: far, exaggerationNear: near } = terrainConfig;
    if (far <= 0 || near <= 0) return far + (near - far) * zoomShare(zoomLevel);
    return far * (near / far) ** zoomShare(zoomLevel);
  };
  /** Heights in metres times this are heights in map units as drawn right now. */
  const heightUnits = () => exaggerationAt(zoom) / METRES_PER_MAP_UNIT;
  /** How much of the map mode's color covers the terrain at a zoom level. */
  const colorStrengthAt = (zoomLevel: number) => {
    if (terrainConfig.naturalModes.includes(mode)) return 0;
    const stops = terrainConfig.colorStrength;
    if (zoomLevel <= stops[0].zoom) return stops[0].strength;
    for (let i = 1; i < stops.length; i++) {
      if (zoomLevel > stops[i].zoom) continue;
      const share =
        Math.log(zoomLevel / stops[i - 1].zoom) / Math.log(stops[i].zoom / stops[i - 1].zoom);
      return stops[i - 1].strength + (stops[i].strength - stops[i - 1].strength) * share;
    }
    return stops[stops.length - 1].strength;
  };

  const pickingRay = (x: number, y: number) => {
    // The view may have changed since the last frame was drawn (zooming, dragging).
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    return scene.createPickingRay(x, y, Matrix.Identity(), camera);
  };
  /** Where the ray through a point of the canvas (CSS pixels) meets a level plane (`height` in map units), or null. */
  const planeAt = (x: number, y: number, height = 0): { x: number; z: number } | null => {
    const ray = pickingRay(x, y);
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const distance = (height - ray.origin.y) / ray.direction.y;
    if (distance <= 0) return null;
    return {
      x: ray.origin.x + ray.direction.x * distance,
      z: ray.origin.z + ray.direction.z * distance,
    };
  };
  /**
   * The map position under a point of the canvas (CSS pixels) and the land's height there in
   * metres, or null if it misses the ground. The ray is followed down to where it first meets
   * the land as it is drawn right now (the sea is flat, at height 0).
   */
  const groundAt = (x: number, y: number): { x: number; z: number; height: number } | null => {
    const ray = pickingRay(x, y);
    const { origin, direction } = ray;
    if (direction.y > -1e-9) return null;
    const units = heightUnits();
    const top = Math.max(0, terrainTiles.maxHeightM) * units;
    const bottom = Math.min(0, terrainTiles.minHeightM) * units;
    const start = origin.y > top ? (top - origin.y) / direction.y : 0;
    const end = (bottom - origin.y) / direction.y;
    /** How far the ray is above the land after travelling `t`. */
    const above = (t: number) =>
      origin.y +
      direction.y * t -
      terrain.heightAt(origin.x + direction.x * t, origin.z + direction.z * t) * units;
    const at = (t: number) => {
      const px = origin.x + direction.x * t;
      const pz = origin.z + direction.z * t;
      return { x: px, z: pz, height: terrain.heightAt(px, pz) };
    };
    // Walk along the ray in steps of half a mesh cell, then close in on the crossing.
    const travel = (end - start) * Math.hypot(direction.x, direction.z);
    const steps = Math.min(240, Math.max(1, Math.ceil(travel / (terrain.cellSize() / 2))));
    let before = start;
    if (above(start) <= 0) return at(start);
    for (let i = 1; i <= steps; i++) {
      const t = start + ((end - start) * i) / steps;
      if (above(t) > 0) {
        before = t;
        continue;
      }
      let low = before;
      let high = t;
      for (let k = 0; k < 20; k++) {
        const middle = (low + high) / 2;
        if (above(middle) > 0) low = middle;
        else high = middle;
      }
      return at(high);
    }
    return at(end);
  };
  const cssSize = () => {
    const scale = engine.getHardwareScalingLevel();
    return { width: engine.getRenderWidth() * scale, height: engine.getRenderHeight() * scale };
  };

  /** Called when the land as drawn changed (terrain arrived, another level): whatever stands on it follows. */
  const landChanged = () => {
    pointerMoved = true; // the province under the mouse may have changed
    drawSelection();
  };
  /** Tells the terrain what the screen shows, and gives the land its look for this zoom. */
  const updateDetail = () => {
    const { width, height } = cssSize();
    const unitsPerPixel = (2 * camera.radius * Math.tan(camera.fov / 2)) / height;
    const units = heightUnits();
    for (const material of lineMaterials) material.setHeightScale(exaggerationAt(zoom));
    // What the screen shows of the ground (the view can be turned and tilted).
    const rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ]) {
      const ground = planeAt(x, y);
      if (!ground) continue;
      rect.minX = Math.min(rect.minX, ground.x);
      rect.maxX = Math.max(rect.maxX, ground.x);
      rect.minZ = Math.min(rect.minZ, ground.z);
      rect.maxZ = Math.max(rect.maxZ, ground.z);
    }
    if (!Number.isFinite(rect.minX)) return;
    // High land just outside that rectangle can still reach into the picture.
    const margin = terrainTiles.maxHeightM * units * 1.5;
    rect.minX -= margin;
    rect.maxX += margin;
    rect.minZ -= margin;
    rect.maxZ += margin;
    const changed = terrain.update({ rect, unitsPerPixel, centerX, centerZ });
    sceneryView = { rect, unitsPerPixel, centerX, centerZ, zoom, heightUnits: units };
    // Up close, where the land cover's cells get big on screen: a surface pattern and wandering edges.
    const cellPixels = terrainCellSize(layout, terrain.stats().level) / unitsPerPixel;
    const closeness = Math.min(1, Math.max(0, (cellPixels - 2) / 3));
    terrain.setLook({
      heightScale: exaggerationAt(zoom),
      colorStrength: colorStrengthAt(zoom),
      detailStrength: terrainConfig.detailStrength * closeness,
      wander: terrainConfig.detailWander * closeness,
    });
    if (changed) landChanged();
  };
  /**
   * How far north or south the camera may look at a zoom level: nowhere but
   * the fitted middle with the whole world in view, up to the map's edges
   * when zoomed in.
   */
  const clampZ = (z: number, zoomLevel: number) => {
    const room = 1 - 1 / zoomLevel;
    const south = fit.targetZ - (fit.targetZ - projection.minZ) * room;
    const north = fit.targetZ + (projection.maxZ - fit.targetZ) * room;
    return Math.min(north, Math.max(south, z));
  };
  /** Puts the camera where `centerX`, `centerZ`, `zoom` and `heading` say. */
  const applyView = () => {
    // Keeping the camera inside the main copy of the world is what makes the map endless.
    centerX = projection.wrapX(centerX);
    centerZ = clampZ(centerZ, zoom);
    camera.alpha = cameraAlphaForHeading(heading);
    camera.beta = tiltAt(zoom);
    camera.radius = fit.radius / zoom;
    camera.target.copyFromFloats(centerX, 0, centerZ);
    camera.minZ = camera.radius * 0.05;
    camera.maxZ = camera.radius * 8;
    updateDetail();
    pointerMoved = true; // the province under the mouse may have changed
  };
  /** Sets where the camera is going, within the limits (zoom range, north–south room, north up with the whole world in view). */
  const setGoal = (changes: Partial<typeof goal>) => {
    Object.assign(goal, changes);
    goal.zoom = Math.min(settings.maxZoom, Math.max(1, goal.zoom));
    goal.x = projection.wrapX(goal.x);
    goal.z = clampZ(goal.z, goal.zoom);
    // The whole world is always shown north up.
    if (goal.zoom <= 1) goal.heading = 0;
  };
  /** Moves the camera right away (no glide), and makes that its goal too. */
  const jumpTo = (changes: Partial<typeof goal>) => {
    zoomAnchor = null;
    setGoal(changes);
    centerX = goal.x;
    centerZ = goal.z;
    zoom = goal.zoom;
    heading = goal.heading;
    applyView();
  };
  /** One frame of gliding towards the goal (`seconds` = Infinity: arrive at once). Returns true if the camera moved. */
  const stepCamera = (seconds: number): boolean => {
    const fraction = glideFraction(seconds, settings.smoothSeconds);
    const before = [centerX, centerZ, zoom, heading];
    const zoomGap = Math.log(goal.zoom / zoom);
    zoom =
      Math.abs(zoomGap) < 1e-4 || fraction === 1 ? goal.zoom : zoom * Math.exp(zoomGap * fraction);
    const turn = wrappedDelta(heading, goal.heading, 2 * Math.PI);
    heading = Math.abs(turn) < 1e-4 || fraction === 1 ? goal.heading : heading + turn * fraction;
    if (zoomAnchor) {
      // Zooming with the wheel: the place under the mouse stays under the mouse.
      applyView();
      // The anchored place rose or sank with the zoom (the exaggeration changes): aim at its height now.
      const ground = planeAt(
        zoomAnchor.screen.x,
        zoomAnchor.screen.y,
        zoomAnchor.ground.height * heightUnits(),
      );
      if (ground) {
        centerX += wrappedDelta(ground.x, zoomAnchor.ground.x, worldWidth);
        centerZ += zoomAnchor.ground.z - ground.z;
      }
      centerX = projection.wrapX(centerX);
      centerZ = clampZ(centerZ, zoom);
      goal.x = centerX;
      goal.z = clampZ(centerZ, goal.zoom);
      if (zoom === goal.zoom) zoomAnchor = null;
    } else {
      const east = wrappedDelta(centerX, goal.x, worldWidth);
      const north = goal.z - centerZ;
      const arrived = Math.hypot(east, north) < 1e-4 / zoom || fraction === 1;
      centerX = arrived ? goal.x : centerX + east * fraction;
      centerZ = arrived ? goal.z : centerZ + north * fraction;
    }
    if ([centerX, centerZ, zoom, heading].every((value, i) => value === before[i])) return false;
    applyView();
    return true;
  };
  const isMoving = () =>
    zoomAnchor !== null ||
    goal.zoom !== zoom ||
    goal.heading !== heading ||
    goal.x !== centerX ||
    goal.z !== centerZ;

  const fitCamera = () => {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    if (aspect === fittedAspect) return;
    const first = fittedAspect === 0;
    fittedAspect = aspect;
    fit = fitMapCamera({
      halfWidth: worldWidth / 2,
      minZ: projection.minZ,
      maxZ: projection.maxZ,
      aspect,
      fieldOfView: camera.fov,
      tilt: farTilt,
      margin: settings.fitMargin,
    });
    for (const material of lineMaterials) material.updateResolution();
    if (first) {
      centerZ = fit.targetZ;
      goal.z = fit.targetZ;
    }
    setGoal({});
    applyView();
  };

  fitCamera();

  // ── Mouse: hover and click ────────────────────────────────────────────────
  /** The province or sea zone at a map position (land wins: the sea zone shapes continue under it). */
  const targetAt = (x: number, z: number) => findTarget(lookup, seaLookup, x, z);
  const targetAtCanvasPoint = (x: number, y: number): MapTarget | null => {
    const ground = groundAt(x, y);
    return ground && targetAt(ground.x, ground.z);
  };

  const setHovered = (target: MapTarget | null) => {
    if (target?.kind === hovered?.kind && target?.index === hovered?.index) return;
    const before = hovered;
    hovered = target;
    canvas.style.cursor = target === null ? 'default' : 'pointer';
    if (before?.kind === 'province' || target?.kind === 'province') refreshColors();
    if (before?.kind === 'seaZone' || target?.kind === 'seaZone') refreshSeaColors();
    events.onHover(target);
  };

  // ── Moving the view ───────────────────────────────────────────────────────
  /** Moves the view right away by (dx, dz) map units (east, north): dragging. */
  const panBy = (dx: number, dz: number) =>
    jumpTo({ x: centerX + dx, z: centerZ + dz, zoom: goal.zoom, heading: goal.heading });
  /** Zooms by a factor (above 1 = closer), keeping the place under a point of the canvas where it is. */
  const zoomBy = (factor: number, around: { x: number; y: number } | null) => {
    const ground = around ? groundAt(around.x, around.y) : null;
    zoomAnchor = around && ground ? { screen: around, ground } : null;
    setGoal({ zoom: goal.zoom * factor });
  };
  /** Turns the view by an angle in radians (clockwise seen from above); never with the whole world in view. */
  const turnBy = (angle: number, immediately: boolean) => {
    if (goal.zoom <= 1) return;
    setGoal({ heading: goal.heading + angle });
    if (immediately) {
      heading = goal.heading;
      applyView();
    }
  };
  const resetView = () => {
    zoomAnchor = null;
    setGoal({ zoom: 1, heading: 0 });
  };

  // ── Touch: two fingers pinch to zoom and move the map together ──────────
  /** Where each finger on the map is now (touch pointers only). */
  const fingers = new Map<number, { x: number; y: number }>();
  /** While two fingers are down: their distance apart and their midpoint at the last step. */
  let pinch: { distance: number; middle: { x: number; y: number } } | null = null;
  /** After a pinch, the finger left on the map neither drags nor taps until it is lifted. */
  let pinchLeftover = false;
  /** Whether the press now on the map is a finger (a tap may wobble a little more than a click). */
  let pressedWithTouch = false;
  const pinchState = () => {
    const [a, b] = [...fingers.values()];
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };
  /** Zooms by how much the fingers spread, and moves the map with their midpoint, at once (no glide). */
  const stepPinch = () => {
    if (!pinch || fingers.size < 2) return;
    const next = pinchState();
    const grabbed = groundAt(pinch.middle.x, pinch.middle.y);
    jumpTo({ zoom: goal.zoom * (next.distance / pinch.distance) });
    const under = grabbed && planeAt(next.middle.x, next.middle.y, grabbed.height * heightUnits());
    if (grabbed && under) panBy(grabbed.x - under.x, grabbed.z - under.z);
    pinch = next;
  };
  /** A finger touched the map. Returns true if the touch is handled here (a pinch, or a finger left over from one). */
  const touchDown = (event: PointerEvent): boolean => {
    if (event.pointerType !== 'touch') return false;
    fingers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    if (fingers.size === 2) {
      // The second finger: whatever the first one started (a drag, a tap) becomes a pinch.
      endDrag();
      setHovered(null);
      pinch = pinchState();
      canvas.setPointerCapture(event.pointerId);
      return true;
    }
    return fingers.size > 2 || pinchLeftover;
  };
  /** A finger moved. Returns true if it belongs to a pinch. */
  const touchMove = (event: PointerEvent): boolean => {
    if (event.pointerType !== 'touch' || !fingers.has(event.pointerId)) return false;
    fingers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    if (pinch) stepPinch();
    return pinch !== null || pinchLeftover;
  };
  /** A finger left the map. Returns true if it belonged to a pinch (so it is no tap). */
  const touchUp = (event: PointerEvent): boolean => {
    if (event.pointerType !== 'touch' || !fingers.has(event.pointerId)) return false;
    fingers.delete(event.pointerId);
    const wasPinch = pinch !== null || pinchLeftover;
    if (pinch && fingers.size < 2) {
      pinch = null;
      pinchLeftover = fingers.size > 0;
    } else if (fingers.size === 0) pinchLeftover = false;
    return wasPinch;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (touchMove(event)) return;
    pointer = { x: event.offsetX, y: event.offsetY };
    pointerMoved = true;
    if (rotateFrom !== null) {
      turnBy(degrees((event.offsetX - rotateFrom) * settings.rotateDegreesPerPixel), true);
      rotateFrom = event.offsetX;
      return;
    }
    if (!pressedAt) return;
    // Holding the button and moving drags the map: the place that was grabbed stays under the mouse.
    if (
      !dragFrom &&
      Math.hypot(pointer.x - pressedAt.x, pointer.y - pressedAt.y) >
        (pressedWithTouch ? TAP_TOLERANCE_PX : CLICK_TOLERANCE_PX)
    ) {
      dragFrom = pressedAt;
      canvas.style.cursor = 'grabbing';
    }
    if (!dragFrom) return;
    // The grabbed place keeps its height: where does the mouse now point at that height?
    const from = groundAt(dragFrom.x, dragFrom.y);
    const to = from && planeAt(pointer.x, pointer.y, from.height * heightUnits());
    dragFrom = pointer;
    if (from && to) panBy(from.x - to.x, from.z - to.z);
  };
  const endDrag = () => {
    pressedAt = null;
    rotateFrom = null;
    if (!dragFrom) return;
    dragFrom = null;
    canvas.style.cursor = hovered === null ? 'default' : 'pointer';
  };
  const onPointerLeave = () => {
    pointer = null;
    if (!dragFrom && rotateFrom === null) setHovered(null);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (touchDown(event)) return;
    if (event.button === 1) {
      // The middle mouse button turns the map (and must not start the browser's auto-scroll).
      event.preventDefault();
      rotateFrom = event.offsetX;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    pressedAt = { x: event.offsetX, y: event.offsetY };
    pressedWithTouch = event.pointerType === 'touch';
    // Keep getting the mouse while it is dragged across a panel or out of the window.
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (touchUp(event)) return;
    if (event.button === 1) {
      rotateFrom = null;
      return;
    }
    if (event.button !== 0 || !pressedAt) return;
    const dragged = dragFrom !== null;
    endDrag();
    if (!dragged) events.onClick(targetAtCanvasPoint(event.offsetX, event.offsetY));
  };
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // One notch of a mouse wheel is about 100 pixels, or 3 lines; touchpads send many small steps.
    const notches = event.deltaY / (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 3 : 100);
    const steps = Math.max(-3, Math.min(3, -notches));
    zoomBy(settings.wheelZoomStep ** steps, { x: event.offsetX, y: event.offsetY });
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  const onPointerCancel = (event: PointerEvent) => {
    touchUp(event);
    endDrag();
  };
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Keys by position on the keyboard (`code`), so WASD and Q/E sit in the same place on every layout.
  const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    KeyA: [-1, 0],
    KeyD: [1, 0],
    KeyW: [0, 1],
    KeyS: [0, -1],
  };
  const TURN_KEYS: Readonly<Record<string, number>> = { KeyQ: -1, KeyE: 1 };
  const heldKeys = new Set<string>();
  /** Shift held: the keys scroll faster. */
  let shiftHeld = false;
  const onKeyDown = (event: KeyboardEvent) => {
    shiftHeld = event.shiftKey;
    // A shortcut of the browser, or typing in a text field: not ours.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
      return;
    // The number pad's + and − choose the game speed (F04, `ui/time-keys.ts`), not the zoom.
    if (event.code === 'NumpadAdd' || event.code === 'NumpadSubtract') return;
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      const step = settings.wheelZoomStep;
      zoomBy(event.key === '-' ? 1 / step : step, null);
      event.preventDefault();
      return;
    }
    if (event.key === 'Home') {
      resetView();
      event.preventDefault();
      return;
    }
    if (!(event.code in MOVE_KEYS) && !(event.code in TURN_KEYS)) return;
    heldKeys.add(event.code);
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    shiftHeld = event.shiftKey;
    heldKeys.delete(event.code);
  };
  const onBlur = () => {
    heldKeys.clear();
    shiftHeld = false;
    pointer = null;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const beforeRender = scene.onBeforeRenderObservable.add(() => {
    fitCamera();
    const seconds = Math.min(0.1, engine.getDeltaTime() / 1000);
    // Scrolling: keys and the window's edge, in the screen's directions (the map may be turned).
    let right = 0;
    let up = 0;
    let turn = 0;
    let keyScroll = false;
    for (const code of heldKeys) {
      const move = MOVE_KEYS[code];
      if (move) {
        right += move[0];
        up += move[1];
        keyScroll = true;
      }
      turn += TURN_KEYS[code] ?? 0;
    }
    if (edgeScrolling && pointer && !dragFrom && rotateFrom === null) {
      const { width, height } = cssSize();
      const edge = edgeScrollDirection(pointer, width, height, settings.edgeScrollPx);
      right += edge.right;
      up += edge.up;
    }
    right = Math.sign(right);
    up = Math.sign(up);
    if (right !== 0 || up !== 0) {
      // The same speed across the screen at every zoom level; faster with Shift and a key.
      const fast = keyScroll && shiftHeld ? settings.fastScrollFactor : 1;
      const distance = (settings.scrollDegreesPerSecond * fast * seconds) / goal.zoom;
      const axes = screenAxes(heading);
      zoomAnchor = null;
      setGoal({
        x: goal.x + (axes.right.x * right + axes.up.x * up) * distance,
        z: goal.z + (axes.right.z * right + axes.up.z * up) * distance,
      });
    }
    if (turn !== 0)
      turnBy(Math.sign(turn) * degrees(settings.rotateDegreesPerSecond) * seconds, false);
    stepCamera(seconds);
    // Terrain that arrived is built a little every frame; then the view may draw finer tiles.
    if (terrain.tick()) updateDetail();
    if (sceneryView) scenery.update(sceneryView);
    if (pointerMoved && pointer && !dragFrom) {
      pointerMoved = false;
      setHovered(targetAtCanvasPoint(pointer.x, pointer.y));
    }
  });

  // The coarsest terrain level is there before the map appears; finer tiles arrive as the view asks.
  await terrain.preload();
  updateDetail();
  const buildMs = Math.round(performance.now() - buildStart);

  return {
    getStats: () => {
      const land = terrain.stats();
      return {
        provinces: world.provinceIds.length,
        seaZones: world.seaZoneIds.length,
        detail: land.level <= terrainConfig.simplifiedShapesMaxLevel ? 'far' : 'near',
        terrainLevel: land.level,
        terrainTiles: land.drawn,
        terrainPending: land.pending,
        terrainReady: land.ready,
        slowestTileBuildMs: Math.round(land.slowestBuildMs),
        exaggeration: exaggerationAt(zoom),
        colorStrength: colorStrengthAt(zoom),
        drawnTriangles: scene.getActiveIndices() / 3,
        drawnMeshes: scene.getActiveMeshes().length,
        loadMs: Math.round(buildStart - loadStart),
        buildMs,
        scenery: scenery.stats(),
      };
    },
    sceneryProbe: (count) => scenery.probe(count),
    setSceneryEnabled: (enabled) => scenery.setEnabled(enabled),
    setMode(next) {
      if (next === mode) return;
      mode = next;
      baseColors = provinceBaseColors(mode, world, config.colors, owners);
      refreshBaseColors();
      seaBaseColors = seaZoneColors(mode, world, config.colors);
      refreshSeaColors();
      // Some map modes show the natural terrain: the land's look depends on the mode.
      updateDetail();
      landLines.setStyles(landLineStyles(mode, config.lines));
      seaLineMaterial.setStyles(seaLineStyles(mode, config.lines));
    },
    setProvinceOwners(provinceOwner) {
      if (provinceOwner.length !== owners.length)
        throw new Error('the owners do not match the number of provinces');
      if (provinceOwner.every((owner, province) => owner === owners[province])) return;
      owners = provinceOwner.slice();
      if (mode === 'political') {
        baseColors = provinceBaseColors(mode, world, config.colors, owners);
        refreshBaseColors();
      }
      if (highlightedCountry !== null) refreshColors();
      // Country borders follow the owners.
      terrain.ownersChanged();
    },
    setSelectedProvince(province) {
      if (province === selected) return;
      selected = province;
      refreshColors();
      drawSelection();
    },
    setHighlightedCountry(country) {
      if (country === highlightedCountry) return;
      highlightedCountry = country;
      refreshColors();
    },
    setSelectedSeaZone(seaZone) {
      if (seaZone === selectedSeaZone) return;
      selectedSeaZone = seaZone;
      refreshSeaColors();
      for (const mesh of seaSelectionMeshes) mesh.dispose();
      seaSelectionMeshes = [];
      if (seaZone !== null) {
        // Drawn with the sea, so the land covers the part of the outline that runs under it.
        const outline = outlineOf(seaPolygons, seaZone, projection).map(wholeLine);
        const mesh = createLineMesh(
          'sea-selection',
          scene,
          buildLineGeometry(outline),
          selectionMaterial.material,
          SEA_GROUP,
          1,
        );
        seaSelectionMeshes = addWrapCopies(mesh, worldWidth);
      }
    },
    provinceAt: (longitude, latitude) =>
      lookup.find(projection.x(longitude), projection.z(latitude)),
    heightAt: (longitude, latitude) =>
      terrain.heightAt(projection.x(longitude), projection.z(latitude)),
    seaZoneAt(longitude, latitude) {
      const target = targetAt(projection.x(longitude), projection.z(latitude));
      return target?.kind === 'seaZone' ? target.index : -1;
    },
    screenPosition(longitude, latitude) {
      // Use the copy of the world that is nearest to the middle of the screen.
      const x = centerX + projection.wrapX(projection.x(longitude) - centerX);
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      const z = projection.z(latitude);
      const projected = Vector3.Project(
        // On the land as it is drawn right now.
        new Vector3(x, terrain.heightAt(x, z) * heightUnits(), z),
        Matrix.Identity(),
        camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)),
        camera.viewport.toGlobal(width, height),
      );
      const scale = engine.getHardwareScalingLevel();
      return { x: projected.x * scale, y: projected.y * scale };
    },
    placeAt(x, y) {
      const ground = groundAt(x, y);
      return (
        ground && {
          longitude: projection.longitude(projection.wrapX(ground.x)),
          latitude: projection.latitude(ground.z),
        }
      );
    },
    scrollBy: (degrees) => jumpTo({ x: centerX + degrees, z: centerZ }),
    lookAt(longitude, latitude, nextZoom) {
      jumpTo({ x: projection.x(longitude), z: projection.z(latitude), zoom: nextZoom });
    },
    centerLongitude: () => projection.longitude(centerX),
    zoom: () => zoom,
    heading: () => heading,
    tilt: () => camera.beta,
    isMoving,
    settle() {
      stepCamera(Infinity);
    },
    resetView,
    setEdgeScrolling(enabled) {
      edgeScrolling = enabled && settings.edgeScrollPx > 0;
    },
    focusProvince(province) {
      // The province's biggest piece (a province can have islands).
      let piece: MapPolygon | null = null;
      for (const polygon of provincePolygons) {
        if (polygon.item !== province) continue;
        const size = (polygon.maxX - polygon.minX) * (polygon.maxZ - polygon.minZ);
        if (!piece || size > (piece.maxX - piece.minX) * (piece.maxZ - piece.minZ)) piece = polygon;
      }
      if (!piece) return;
      // Zoom in if it would be too small to see; never zoom out.
      const widest = Math.max(piece.maxX - piece.minX, piece.maxZ - piece.minZ);
      const degreesPerPixelAtZoom1 = (2 * fit.radius * Math.tan(camera.fov / 2)) / cssSize().height;
      const needed = (settings.focusMinProvincePx * degreesPerPixelAtZoom1) / widest;
      zoomAnchor = null;
      // Glides there.
      setGoal({
        zoom: Math.max(goal.zoom, Math.min(settings.maxZoom, needed)),
        x: (piece.minX + piece.maxX) / 2,
        z: (piece.minZ + piece.maxZ) / 2,
      });
    },
    focusSeaZone(seaZone) {
      // Sea zones are big: gliding to the label point is enough, no zooming.
      zoomAnchor = null;
      setGoal({
        x: projection.x(world.seaZoneCenter[seaZone * 2]),
        z: projection.z(world.seaZoneCenter[seaZone * 2 + 1]),
      });
    },
    focusCountry(country) {
      const capital = world.countryCapital[country];
      let anchorX = 0;
      for (const polygon of provincePolygons)
        if (polygon.item === capital) anchorX = (polygon.minX + polygon.maxX) / 2;
      const box = countryFrame(
        provincePolygons,
        owners,
        country,
        anchorX,
        COUNTRY_FRAME_REACH_DEGREES,
        worldWidth,
      );
      if (!box) return;
      const { width, height } = cssSize();
      const degreesPerPixelAtZoom1 = (2 * fit.radius * Math.tan(camera.fov / 2)) / height;
      // Visible ground at zoom 1, in map units, across and up the screen.
      const visibleUp = degreesPerPixelAtZoom1 * height;
      const visibleAcross = degreesPerPixelAtZoom1 * width;
      const zoomToFit = Math.min(
        (visibleUp * COUNTRY_FRAME_SHARE) / Math.max(box.maxZ - box.minZ, 0.01),
        (visibleAcross * COUNTRY_FRAME_SHARE) / Math.max(box.maxX - box.minX, 0.01),
      );
      zoomAnchor = null;
      setGoal({
        zoom: Math.max(1, Math.min(settings.maxZoom, zoomToFit)),
        x: (box.minX + box.maxX) / 2,
        z: (box.minZ + box.maxZ) / 2,
      });
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(beforeRender);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const mesh of [...allMeshes, ...selectionMeshes, ...seaSelectionMeshes]) mesh.dispose();
      scenery.dispose();
      modelLights.dispose();
      terrain.dispose();
      for (const material of lineMaterials) material.material.dispose();
      seaMaterial.dispose();
      seaTable.dispose();
      provinceTable.dispose();
      camera.dispose();
    },
  };
}
