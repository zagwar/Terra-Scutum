import { countryFrame } from './country-frame';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Culling/ray';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { MapViewConfig, WorldMap } from '@terra-scutum/sim';
import { presimplify, simplify } from 'topojson-simplify';
import type { Objects, Topology } from 'topojson-specification';
import provincesUrl from '../../../../../data/geometry/provinces.topo.json?url';
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
  applyHighlight,
  applySeaHighlight,
  parseHexColor,
  provinceBaseColors,
  seaZoneColors,
} from './map-colors';
import {
  LINE_OTHER_COUNTRY,
  LINE_OTHER_REGION,
  type LineGeometry,
  type MapPolygon,
  buildInnerBorders,
  buildLineGeometry,
  buildProvinceBorders,
  chunkLines,
  chunkPolygons,
  createChunkGrid,
  decodePolygons,
  outlineOf,
  triangulate,
  updateBorderKinds,
  wholeLine,
} from './map-geometry';
import {
  addWrapCopies,
  createColorTable,
  createFillMaterial,
  createFillMesh,
  createLineMesh,
  uploadLineKinds,
} from './map-meshes';
import { createMapProjection } from './map-projection';
import { type MapTarget, createShapeLookup, findTarget } from './shape-lookup';

export type { MapTarget } from './shape-lookup';

/**
 * The world map in the 3D scene (F01): sea zones underneath, provinces on
 * top, border lines, mouse picking and the strategy camera (F03).
 *
 * - The camera glides (zoom, scrolling, turning) towards where the input
 *   sends it. Mouse wheel and +/-: zoom (towards the mouse); dragging: move,
 *   exactly with the mouse; WASD, the arrow keys and the window's edge:
 *   scroll (faster with Shift held); middle mouse button or Q/E: turn; Home: the whole world, north
 *   up. The camera leans back more the closer it zooms in. The math is in
 *   `camera-motion.ts`.
 *
 * - Everything lies flat on the ground (y = 0); terrain comes with F125.
 * - The map wraps east–west: the camera's position is kept inside the main
 *   copy of the world, and the map is drawn on both sides of it, so
 *   scrolling never reaches an edge.
 * - Province colors come from a one-pixel-per-province texture, so map modes
 *   and highlights are instant.
 * - Ownership (F02) comes from the sim through `setProvinceOwners`: the
 *   political colors and the country borders follow the current owners.
 *   Border lines know the provinces on their two sides, so a change of
 *   owner only rewrites one small number per vertex of the lines it affects.
 * - Picking uses the shape lookup (exact, no GPU readback). Sea zones (F70)
 *   are picked the same way; land wins where the two overlap, because the
 *   sea zone shapes continue under the land.
 * - The land has two levels of detail. Far away: simplified shapes, drawn as
 *   three copies. Close up: the full shapes, cut into chunks; only the chunks
 *   on screen are drawn, each placed on the copy of the world nearest to the
 *   camera. The close-up level is built the first time it's needed.
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
  /** Which level of detail the land is drawn with right now. */
  readonly detail: 'far' | 'near';
  /** Triangles in one copy of the world at the far level (sea, land and lines). */
  readonly farTriangles: number;
  /** Triangles in the whole close-up level; null until it has been built. */
  readonly nearTriangles: number | null;
  /** What the last frame actually drew. */
  readonly drawnTriangles: number;
  readonly drawnMeshes: number;
  /** Time to download and read the shape files, in milliseconds. */
  readonly loadMs: number;
  /** Time to build the map (far level), in milliseconds. */
  readonly buildMs: number;
  /** Time to build the close-up level, in milliseconds; null until it has been built. */
  readonly nearBuildMs: number | null;
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

/** A TopoJSON file's content (the shapes carry only an id, no other properties). */
type MapTopology = Topology<Objects<Record<string, never>>>;

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
  events: MapViewEvents,
): Promise<MapView> {
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();
  if (!canvas) throw new Error('the map needs a canvas');

  const loadStart = performance.now();
  const [provinceTopology, seaTopology] = await Promise.all([
    fetchTopology(provincesUrl),
    fetchTopology(seaZonesUrl),
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
  // The full shapes: used for picking, for outlines and for the close-up level.
  const provincePolygons = decodePolygons(provinceTopology, 'provinces', provinceIndex, projection);
  const lookup = createShapeLookup(provincePolygons, projection);
  let widestPolygon = 0;
  for (const polygon of provincePolygons)
    widestPolygon = Math.max(widestPolygon, polygon.maxX - polygon.minX);
  // The far level's shapes. Simplifying the topology keeps neighbors fitting together without gaps.
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
  const trianglesOf = (mesh: Mesh) => mesh.getTotalIndices() / 3;
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

  // The land. Both levels of detail share the color table and the materials.
  // Until the sim's first owners arrive: the starting owners.
  let owners: Uint16Array = world.provinceCountry.slice();
  /** Every land border mesh with its geometry, to change border kinds when provinces change owner. */
  const borderMeshes: { readonly mesh: Mesh; readonly geometry: LineGeometry }[] = [];
  const provinceTable = createColorTable('province-colors', scene, world.provinceIds.length);
  const provinceMaterial = createFillMaterial('provinces-material', scene, provinceTable);
  const landLines = lineMaterial('borders-material', landLineStyles(mode, config.lines));
  const selectionMaterial = lineMaterial('selection-material', { plain: config.lines.selection });
  let selectionMeshes: Mesh[] = [];
  let seaSelectionMeshes: Mesh[] = [];

  /** Builds the land (fills and border lines) from one set of shapes, one pair of meshes per chunk. */
  const buildLand = (
    name: string,
    topology: MapTopology,
    polygons: readonly MapPolygon[],
    chunkDegrees: number,
  ): Mesh[] => {
    const grid = createChunkGrid(projection, chunkDegrees);
    const meshes: Mesh[] = [];
    for (const [chunk, list] of chunkPolygons(polygons, grid))
      meshes.push(
        createFillMesh(
          `provinces-${name}-${chunk}`,
          scene,
          triangulate(list),
          provinceTable,
          provinceMaterial,
          LAND_GROUP,
        ),
      );
    for (const [chunk, spans] of chunkLines(bordersOf(topology), grid)) {
      const geometry = buildLineGeometry(spans);
      updateBorderKinds(geometry, owners, world.provinceRegion);
      const mesh = createLineMesh(
        `borders-${name}-${chunk}`,
        scene,
        geometry,
        landLines.material,
        LAND_GROUP,
        0,
      );
      borderMeshes.push({ mesh, geometry });
      meshes.push(mesh);
    }
    allMeshes.push(...meshes);
    return meshes;
  };
  const trianglesIn = (meshes: readonly Mesh[]) =>
    meshes.reduce((sum, mesh) => sum + trianglesOf(mesh), 0);

  // Far level: big chunks, each drawn on all three copies of the world (the ones off screen are skipped).
  const farChunks = buildLand(
    'far',
    farTopology,
    decodePolygons(farTopology, 'provinces', provinceIndex, projection),
    config.detail.farChunkDegrees,
  );
  const farMeshes = farChunks.flatMap((mesh) => addWrapCopies(mesh, worldWidth));
  allMeshes.push(...farMeshes.filter((mesh) => !farChunks.includes(mesh)));
  const farTriangles = trianglesOf(seaFill) + trianglesOf(seaLines) + trianglesIn(farChunks);

  /** The close-up level: small chunks of the full shapes, each drawn once. */
  interface NearChunk {
    readonly mesh: Mesh;
    /** Where the chunk's middle is in the main copy of the world. */
    readonly centerX: number;
  }
  let nearChunks: NearChunk[] | null = null;
  let nearTriangles: number | null = null;
  let nearBuildMs: number | null = null;
  const buildNearLevel = (): NearChunk[] => {
    const start = performance.now();
    const meshes = buildLand(
      'near',
      provinceTopology,
      provincePolygons,
      config.detail.chunkDegrees,
    );
    nearTriangles = trianglesIn(meshes);
    nearBuildMs = Math.round(performance.now() - start);
    return meshes.map((mesh) => ({
      mesh,
      centerX: mesh.getBoundingInfo().boundingBox.center.x,
    }));
  };

  // ── Colors and highlights ─────────────────────────────────────────────────
  let baseColors = provinceBaseColors(mode, world, config.colors, owners);
  const shownColors = new Uint8Array(baseColors.length);
  let selected: number | null = null;
  let highlightedCountry: number | null = null;
  let hovered: MapTarget | null = null;
  const hoveredOf = (kind: MapTarget['kind']) => (hovered?.kind === kind ? hovered.index : null);
  const refreshColors = () => {
    applyHighlight(
      baseColors,
      shownColors,
      {
        selected,
        hovered: hoveredOf('province'),
        country: highlightedCountry === null ? null : { index: highlightedCountry, owners },
      },
      world,
      config.colors,
    );
    provinceTable.update(shownColors);
  };
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
  /** While a mouse-wheel zoom glides: the place that must stay under the mouse. */
  let zoomAnchor: {
    readonly screen: { x: number; y: number };
    readonly ground: { x: number; z: number };
  } | null = null;
  let edgeScrolling = settings.edgeScrollPx > 0;
  let fit: CameraFit = { radius: 100, targetZ: 0 };
  let fittedAspect = 0;
  let detail: 'far' | 'near' = 'far';

  /** The map position under a point of the canvas (CSS pixels), or null if it misses the ground. */
  const groundAt = (x: number, y: number): { x: number; z: number } | null => {
    // The view may have changed since the last frame was drawn (zooming, dragging).
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const distance = -ray.origin.y / ray.direction.y;
    if (distance <= 0) return null;
    return {
      x: ray.origin.x + ray.direction.x * distance,
      z: ray.origin.z + ray.direction.z * distance,
    };
  };
  const cssSize = () => {
    const scale = engine.getHardwareScalingLevel();
    return { width: engine.getRenderWidth() * scale, height: engine.getRenderHeight() * scale };
  };

  /** Shows the level of detail that suits the zoom, and puts the close-up chunks on the nearest copy of the world. */
  const updateDetail = () => {
    const { width, height } = cssSize();
    const degreesPerPixel = (2 * camera.radius * Math.tan(camera.fov / 2)) / height;
    // What the screen shows of the ground, east to west (the view can be turned and tilted).
    let minX = Infinity;
    let maxX = -Infinity;
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ]) {
      const ground = groundAt(x, y);
      minX = Math.min(minX, ground ? ground.x : -Infinity);
      maxX = Math.max(maxX, ground ? ground.x : Infinity);
    }
    const viewWidth = maxX - minX;
    const middleX = Number.isFinite(viewWidth) ? (minX + maxX) / 2 : centerX;
    // A chunk is drawn once, so it must never be needed on both sides of the screen at the same time.
    const fitsOnce = viewWidth + config.detail.chunkDegrees + widestPolygon <= worldWidth;
    const wanted =
      degreesPerPixel <= config.detail.nearMaxDegreesPerPixel && fitsOnce ? 'near' : 'far';
    if (wanted === 'near') nearChunks ??= buildNearLevel();
    if (wanted !== detail) {
      detail = wanted;
      for (const mesh of farMeshes) mesh.setEnabled(detail === 'far');
    }
    if (!nearChunks) return;
    for (const chunk of nearChunks) {
      chunk.mesh.setEnabled(detail === 'near');
      if (detail !== 'near') continue;
      const x = Math.round((middleX - chunk.centerX) / worldWidth) * worldWidth;
      if (chunk.mesh.position.x !== x) chunk.mesh.position.x = x;
    }
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
      const ground = groundAt(zoomAnchor.screen.x, zoomAnchor.screen.y);
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

  const onPointerMove = (event: PointerEvent) => {
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
      Math.hypot(pointer.x - pressedAt.x, pointer.y - pressedAt.y) > CLICK_TOLERANCE_PX
    ) {
      dragFrom = pressedAt;
      canvas.style.cursor = 'grabbing';
    }
    if (!dragFrom) return;
    const from = groundAt(dragFrom.x, dragFrom.y);
    const to = groundAt(pointer.x, pointer.y);
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
    if (event.button === 1) {
      // The middle mouse button turns the map (and must not start the browser's auto-scroll).
      event.preventDefault();
      rotateFrom = event.offsetX;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    pressedAt = { x: event.offsetX, y: event.offsetY };
    // Keep getting the mouse while it is dragged across a panel or out of the window.
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
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
  canvas.addEventListener('pointercancel', endDrag);
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
    if (pointerMoved && pointer && !dragFrom) {
      pointerMoved = false;
      setHovered(targetAtCanvasPoint(pointer.x, pointer.y));
    }
  });

  const buildMs = Math.round(performance.now() - buildStart);

  return {
    getStats: () => ({
      provinces: world.provinceIds.length,
      seaZones: world.seaZoneIds.length,
      detail,
      farTriangles,
      nearTriangles,
      drawnTriangles: scene.getActiveIndices() / 3,
      drawnMeshes: scene.getActiveMeshes().length,
      loadMs: Math.round(buildStart - loadStart),
      buildMs,
      nearBuildMs,
    }),
    setMode(next) {
      if (next === mode) return;
      mode = next;
      baseColors = provinceBaseColors(mode, world, config.colors, owners);
      refreshColors();
      seaBaseColors = seaZoneColors(mode, world, config.colors);
      refreshSeaColors();
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
        refreshColors();
      } else if (highlightedCountry !== null) refreshColors();
      // Country borders follow the owners. (Wrap copies share the mesh's buffers.)
      for (const { mesh, geometry } of borderMeshes)
        if (updateBorderKinds(geometry, owners, world.provinceRegion))
          uploadLineKinds(mesh, geometry);
    },
    setSelectedProvince(province) {
      if (province === selected) return;
      selected = province;
      refreshColors();
      for (const mesh of selectionMeshes) mesh.dispose();
      selectionMeshes = [];
      if (province !== null) {
        const outline = outlineOf(provincePolygons, province, projection).map(wholeLine);
        const mesh = createLineMesh(
          'selection',
          scene,
          buildLineGeometry(outline),
          selectionMaterial.material,
          LAND_GROUP,
          1,
        );
        selectionMeshes = addWrapCopies(mesh, worldWidth);
      }
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
    seaZoneAt(longitude, latitude) {
      const target = targetAt(projection.x(longitude), projection.z(latitude));
      return target?.kind === 'seaZone' ? target.index : -1;
    },
    screenPosition(longitude, latitude) {
      // Use the copy of the world that is nearest to the middle of the screen.
      const x = centerX + projection.wrapX(projection.x(longitude) - centerX);
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      const projected = Vector3.Project(
        new Vector3(x, 0, projection.z(latitude)),
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
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const mesh of [...allMeshes, ...selectionMeshes, ...seaSelectionMeshes]) mesh.dispose();
      for (const material of lineMaterials) material.material.dispose();
      seaMaterial.dispose();
      provinceMaterial.dispose();
      seaTable.dispose();
      provinceTable.dispose();
      camera.dispose();
    },
  };
}
