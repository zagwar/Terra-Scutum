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
import { type LineMaterial, type LineStyles, createLineMaterial } from './line-material';
import {
  type MapMode,
  applyHighlight,
  parseHexColor,
  provinceBaseColors,
  seaZoneColors,
} from './map-colors';
import {
  LINE_OTHER_COUNTRY,
  LINE_OTHER_REGION,
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
import { createShapeLookup } from './shape-lookup';

/**
 * The world map in the 3D scene (F01): sea zones underneath, provinces on
 * top, border lines, mouse picking and the camera (fixed for now: the
 * strategy camera is F03 and will steer this view through `lookAt`).
 *
 * - Everything lies flat on the ground (y = 0); terrain comes with F125.
 * - The map wraps east–west: the camera's position is kept inside the main
 *   copy of the world, and the map is drawn on both sides of it, so
 *   scrolling never reaches an edge.
 * - Province colors come from a one-pixel-per-province texture, so map modes
 *   and highlights are instant.
 * - Picking uses the shape lookup (exact, no GPU readback).
 * - The land has two levels of detail. Far away: simplified shapes, drawn as
 *   three copies. Close up: the full shapes, cut into chunks; only the chunks
 *   on screen are drawn, each placed on the copy of the world nearest to the
 *   camera. The close-up level is built the first time it's needed.
 */

export interface MapViewEvents {
  /** The province under the mouse changed (index, or null for none). */
  onHover(province: number | null): void;
  /** The map was clicked: on a province (index) or on the sea or outside the map (null). */
  onClick(province: number | null): void;
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
  setSelectedProvince(province: number | null): void;
  /** The province index at a longitude/latitude, or -1 for the sea. */
  provinceAt(longitude: number, latitude: number): number;
  /** Where a longitude/latitude is on screen, in CSS pixels from the canvas's top-left corner. */
  screenPosition(longitude: number, latitude: number): { x: number; y: number };
  /** Scrolls the map east (positive) or west (negative), in degrees of longitude. */
  scrollBy(degrees: number): void;
  /**
   * Points the camera at a place. Zoom 1 shows the whole world (and ignores
   * the latitude: the map stays centered top to bottom); zoom 4 is four times closer.
   */
  lookAt(longitude: number, latitude: number, zoom: number): void;
  /** The longitude at the middle of the screen. */
  centerLongitude(): number;
  dispose(): void;
}

/** Layers are drawn in a fixed order: the sea first, then the land on top of it. */
const SEA_GROUP = 0;
const LAND_GROUP = 1;
/** How far the mouse may move between press and release for it to count as a click, in pixels. */
const CLICK_TOLERANCE_PX = 4;

/** A TopoJSON file's content (the shapes carry only an id, no other properties). */
type MapTopology = Topology<Objects<Record<string, never>>>;

async function fetchTopology(url: string): Promise<MapTopology> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as MapTopology;
}

/** How wide the far edge of the view is compared with its middle (the camera leans back). */
const FAR_EDGE_ALLOWANCE = 1.5;

/** The line styles for land borders in a map mode: which borders stand out, and how. */
function landLineStyles(mode: MapMode, lines: MapViewConfig['lines']): LineStyles {
  return {
    plain: lines.provinceBorder,
    coast: lines.coast,
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

  // The sea: always drawn the same way (it has few shapes), as three copies.
  const seaPolygons = decodePolygons(
    seaTopology,
    'seaZones',
    indexIn(world.seaZoneIndex, 'sea zone'),
    projection,
  );
  const seaTable = createColorTable('sea-zone-colors', scene, world.seaZoneIds.length);
  seaTable.update(seaZoneColors(world, config.colors));
  const seaMaterial = createFillMaterial('sea-zones-material', scene, seaTable);
  const seaFill = createFillMesh(
    'sea-zones',
    scene,
    triangulate(seaPolygons),
    seaTable,
    seaMaterial,
    SEA_GROUP,
  );
  const seaLines = createLineMesh(
    'sea-zone-borders',
    scene,
    buildLineGeometry(buildInnerBorders(seaTopology, 'seaZones', projection).map(wholeLine)),
    lineMaterial('sea-zone-borders-material', { plain: config.lines.seaZoneBorder }).material,
    SEA_GROUP,
    0,
  );
  allMeshes.push(...addWrapCopies(seaFill, worldWidth), ...addWrapCopies(seaLines, worldWidth));

  // The land. Both levels of detail share the color table and the materials.
  let mode: MapMode = 'provinces';
  const provinceTable = createColorTable('province-colors', scene, world.provinceIds.length);
  const provinceMaterial = createFillMaterial('provinces-material', scene, provinceTable);
  const landLines = lineMaterial('borders-material', landLineStyles(mode, config.lines));
  const selectionMaterial = lineMaterial('selection-material', { plain: config.lines.selection });
  let selectionMeshes: Mesh[] = [];

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
    for (const [chunk, spans] of chunkLines(bordersOf(topology), grid))
      meshes.push(
        createLineMesh(
          `borders-${name}-${chunk}`,
          scene,
          buildLineGeometry(spans),
          landLines.material,
          LAND_GROUP,
          0,
        ),
      );
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
  let baseColors = provinceBaseColors(mode, world, config.colors);
  const shownColors = new Uint8Array(baseColors.length);
  let selected: number | null = null;
  let hovered: number | null = null;
  const refreshColors = () => {
    applyHighlight(baseColors, shownColors, { selected, hovered }, world, config.colors);
    provinceTable.update(shownColors);
  };
  refreshColors();

  // Mouse state (used further down; the camera code needs to flag "look under the mouse again").
  let pointer: { x: number; y: number } | null = null;
  let pointerMoved = false;
  let pressedAt: { x: number; y: number } | null = null;

  // ── Camera: looks north, fitted so the whole world is visible at zoom 1 ───
  const camera = new ArcRotateCamera('map-camera', -Math.PI / 2, 0, 100, Vector3.Zero(), scene);
  const tilt = Math.max(0.001, (config.camera.tiltDegrees * Math.PI) / 180);
  camera.fov = (config.camera.fieldOfViewDegrees * Math.PI) / 180;
  camera.lowerBetaLimit = 0;
  camera.beta = tilt;
  scene.activeCamera = camera;

  let centerX = 0;
  /** Where the camera looks north–south; null = wherever fits the whole map. */
  let centerZ: number | null = null;
  let zoom = 1;
  let fit: CameraFit = { radius: 100, targetZ: 0 };
  let fittedAspect = 0;
  let detail: 'far' | 'near' = 'far';

  /** Shows the level of detail that suits the zoom, and puts the close-up chunks on the nearest copy of the world. */
  const updateDetail = () => {
    const scale = engine.getHardwareScalingLevel();
    const degreesPerPixel =
      (2 * camera.radius * Math.tan(camera.fov / 2)) / (engine.getRenderHeight() * scale);
    const viewWidth = degreesPerPixel * engine.getRenderWidth() * scale * FAR_EDGE_ALLOWANCE;
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
      const x = Math.round((centerX - chunk.centerX) / worldWidth) * worldWidth;
      if (chunk.mesh.position.x !== x) chunk.mesh.position.x = x;
    }
  };
  const applyView = () => {
    camera.radius = fit.radius / zoom;
    camera.target.copyFromFloats(centerX, 0, centerZ ?? fit.targetZ);
    camera.minZ = camera.radius * 0.05;
    camera.maxZ = camera.radius * 8;
    updateDetail();
    pointerMoved = true; // the province under the mouse may have changed
  };
  const fitCamera = () => {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    if (aspect === fittedAspect) return;
    fittedAspect = aspect;
    fit = fitMapCamera({
      halfWidth: worldWidth / 2,
      minZ: projection.minZ,
      maxZ: projection.maxZ,
      aspect,
      fieldOfView: camera.fov,
      tilt,
      margin: config.camera.fitMargin,
    });
    for (const material of lineMaterials) material.updateResolution();
    applyView();
  };

  fitCamera();

  // ── Mouse: hover and click ────────────────────────────────────────────────
  /** The map position under a point of the canvas (CSS pixels), or null if it misses the ground. */
  const groundAt = (x: number, y: number): { x: number; z: number } | null => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const distance = -ray.origin.y / ray.direction.y;
    if (distance <= 0) return null;
    return {
      x: ray.origin.x + ray.direction.x * distance,
      z: ray.origin.z + ray.direction.z * distance,
    };
  };
  const provinceAtCanvasPoint = (x: number, y: number): number | null => {
    const ground = groundAt(x, y);
    if (!ground) return null;
    const found = lookup.find(ground.x, ground.z);
    return found < 0 ? null : found;
  };

  const setHovered = (province: number | null) => {
    if (province === hovered) return;
    hovered = province;
    canvas.style.cursor = province === null ? 'default' : 'pointer';
    refreshColors();
    events.onHover(province);
  };
  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.offsetX, y: event.offsetY };
    pointerMoved = true;
  };
  const onPointerLeave = () => {
    pointer = null;
    pressedAt = null;
    setHovered(null);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 0) pressedAt = { x: event.offsetX, y: event.offsetY };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || !pressedAt) return;
    const moved = Math.hypot(event.offsetX - pressedAt.x, event.offsetY - pressedAt.y);
    pressedAt = null;
    if (moved <= CLICK_TOLERANCE_PX)
      events.onClick(provinceAtCanvasPoint(event.offsetX, event.offsetY));
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  // ── Keyboard: temporary east–west scrolling until the strategy camera (F03) ──
  const scrollBy = (degrees: number) => {
    // Keeping the camera inside the main copy of the world is what makes the map endless.
    centerX = projection.wrapX(centerX + degrees);
    applyView();
  };
  const heldKeys = new Set<string>();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    heldKeys.add(event.key);
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => heldKeys.delete(event.key);
  const onBlur = () => heldKeys.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const beforeRender = scene.onBeforeRenderObservable.add(() => {
    fitCamera();
    const direction = (heldKeys.has('ArrowRight') ? 1 : 0) - (heldKeys.has('ArrowLeft') ? 1 : 0);
    if (direction !== 0) {
      const seconds = Math.min(0.1, engine.getDeltaTime() / 1000);
      scrollBy(direction * config.camera.scrollDegreesPerSecond * seconds);
    }
    if (pointerMoved && pointer) {
      pointerMoved = false;
      setHovered(provinceAtCanvasPoint(pointer.x, pointer.y));
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
      baseColors = provinceBaseColors(mode, world, config.colors);
      refreshColors();
      landLines.setStyles(landLineStyles(mode, config.lines));
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
    provinceAt: (longitude, latitude) =>
      lookup.find(projection.x(longitude), projection.z(latitude)),
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
    scrollBy,
    lookAt(longitude, latitude, nextZoom) {
      zoom = Math.max(1, nextZoom);
      centerX = projection.wrapX(projection.x(longitude));
      centerZ = zoom > 1 ? projection.z(latitude) : null;
      applyView();
    },
    centerLongitude: () => projection.longitude(centerX),
    dispose() {
      scene.onBeforeRenderObservable.remove(beforeRender);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const mesh of [...allMeshes, ...selectionMeshes]) mesh.dispose();
      for (const material of lineMaterials) material.material.dispose();
      seaMaterial.dispose();
      provinceMaterial.dispose();
      seaTable.dispose();
      provinceTable.dispose();
      camera.dispose();
    },
  };
}
