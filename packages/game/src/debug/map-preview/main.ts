import { countryNameKey, provinceNameKey, regionNameKey, seaZoneNameKey } from '@terra-scutum/sim';
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import countriesFile from '../../../../../data/countries.json';
import provincesUrl from '../../../../../data/geometry/provinces.topo.json?url';
import seaZonesUrl from '../../../../../data/geometry/sea_zones.topo.json?url';
import provincesFile from '../../../../../data/provinces.json';
import regionsFile from '../../../../../data/regions.json';
import seaZonesFile from '../../../../../data/sea_zones.json';
import { t, tKey } from '../../ui/i18n';
import '../../ui/styles.css';
import './map-preview.css';

/**
 * Map data preview (F64): a flat, temporary viewer for the generated map data,
 * so the designer can check provinces, countries, regions, sea zones and
 * borders on the preview link. The real 3D map replaces it (F01).
 */

type Mode = 'countries' | 'regions' | 'seaZones';
type Selection = { kind: 'province' | 'seaZone'; id: string } | null;

interface Shape {
  readonly id: string;
  readonly path: Path2D;
  readonly box: [number, number, number, number];
}

interface MapPreviewApi {
  ready: boolean;
  counts: { countries: number; provinces: number; regions: number; seaZones: number };
  /** What is drawn at a longitude/latitude: a province id, a sea zone id, or null. */
  pick(lon: number, lat: number): Selection;
  select(selection: Selection): void;
  setMode(mode: Mode): void;
}

declare global {
  interface Window {
    __mapPreview?: MapPreviewApi;
  }
}

const provinces = new Map(provincesFile.provinces.map((p) => [p.id, p]));
const countries = new Map(countriesFile.countries.map((c) => [c.id, c]));
const regions = new Map(regionsFile.regions.map((r) => [r.id, r]));
const seaZones = new Map(seaZonesFile.seaZones.map((s) => [s.id, s]));
const coastalProvinces = new Map<string, string[]>();
for (const p of provincesFile.provinces) {
  for (const zone of p.adjacentSeaZones)
    coastalProvinces.set(zone, [...(coastalProvinces.get(zone) ?? []), p.id]);
}

const REGION_COLORS = [
  '#8c6d4f',
  '#5f7f5a',
  '#7a5c7e',
  '#4f6f8f',
  '#9a7b3c',
  '#6b8e8a',
  '#a0614f',
  '#5b6b9a',
  '#7f8f4f',
  '#8f5f6f',
  '#4f8a6f',
  '#9a8a6a',
];
const SEA_COLORS = ['#1d3a57', '#21445f', '#1a3350', '#244a66', '#1f3d5c', '#18304a'];
const regionOrder = [...regions.keys()].sort();

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, key: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const f = 1 + ((hash(key) % 1000) / 1000 - 0.5) * 2 * amount;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((value >> 16) & 255)}, ${c((value >> 8) & 255)}, ${c(value & 255)})`;
}

/** World coordinates: x = longitude + 180, y = 90 − latitude (degrees). */
function ringsToPath(path: Path2D, rings: number[][][]): void {
  for (const ring of rings) {
    ring.forEach(([lon, lat], i) =>
      i === 0 ? path.moveTo(lon + 180, 90 - lat) : path.lineTo(lon + 180, 90 - lat),
    );
    path.closePath();
  }
}

function toShapes(topology: Topology, objectName: string): Shape[] {
  const object = topology.objects[objectName] as GeometryCollection;
  return object.geometries.map((geometry) => {
    const f = feature(topology, geometry as GeometryObject) as unknown as Feature<
      Polygon | MultiPolygon
    >;
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const path = new Path2D();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const polygon of polygons) {
      ringsToPath(path, polygon);
      for (const [lon, lat] of polygon[0] ?? []) {
        minX = Math.min(minX, lon + 180);
        maxX = Math.max(maxX, lon + 180);
        minY = Math.min(minY, 90 - lat);
        maxY = Math.max(maxY, 90 - lat);
      }
    }
    return { id: String(geometry.id), path, box: [minX, minY, maxX, maxY] };
  });
}

function linesToPath(lines: MultiLineString): Path2D {
  const path = new Path2D();
  for (const line of lines.coordinates) {
    line.forEach(([lon, lat], i) =>
      i === 0 ? path.moveTo(lon + 180, 90 - lat) : path.lineTo(lon + 180, 90 - lat),
    );
  }
  return path;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

async function start(root: HTMLElement): Promise<void> {
  document.title = `${t('GAME_TITLE')}: ${t('MAP_PREVIEW_TITLE')}`;
  const canvas = element('canvas', 'map-preview-canvas');
  const panel = element('section', 'panel map-preview-panel');
  const details = element('section', 'panel map-preview-details');
  const tooltip = element('div', 'map-preview-tooltip');
  details.hidden = true;
  tooltip.hidden = true;
  root.append(canvas, panel, details, tooltip);

  panel.append(element('h1', 'panel-title', t('MAP_PREVIEW_TITLE')));
  const status = element('p', 'map-preview-status', t('MAP_PREVIEW_LOADING'));
  status.dataset.testid = 'map-preview-status';
  panel.append(status);

  const [provinceTopo, seaTopo] = await Promise.all(
    [provincesUrl, seaZonesUrl].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return (await response.json()) as Topology;
    }),
  );

  const provinceShapes = toShapes(provinceTopo, 'provinces');
  const seaShapes = toShapes(seaTopo, 'seaZones');
  const provinceObject = provinceTopo.objects.provinces as GeometryCollection;
  const prop = (g: GeometryObject) => provinces.get(String(g.id))!;
  const meshPath = (filter: (a: GeometryObject, b: GeometryObject) => boolean) =>
    linesToPath(mesh(provinceTopo, provinceObject, filter));
  const coastline = meshPath((a, b) => a === b);
  const countryBorders = meshPath((a, b) => a !== b && prop(a).country !== prop(b).country);
  const regionBorders = meshPath((a, b) => a !== b && prop(a).region !== prop(b).region);
  const provinceBorders = meshPath((a, b) => a !== b);
  const seaBorders = linesToPath(
    mesh(
      seaTopo,
      seaTopo.objects.seaZones as GeometryCollection,
      (a: unknown, b: unknown) => a !== b,
    ),
  );

  const counts = {
    countries: countries.size,
    provinces: provinces.size,
    regions: regions.size,
    seaZones: seaZones.size,
  };
  status.textContent = t('MAP_PREVIEW_COUNTS', {
    countries: counts.countries.toLocaleString('en'),
    provinces: counts.provinces.toLocaleString('en'),
    regions: counts.regions.toLocaleString('en'),
    seaZones: counts.seaZones.toLocaleString('en'),
  });
  panel.append(element('p', 'map-preview-hint', t('MAP_PREVIEW_HINT')));

  let mode: Mode = 'countries';
  let selection: Selection = null;
  const modeButtons = new Map<Mode, HTMLButtonElement>();
  const buttons = element('div', 'map-preview-buttons');
  const modes: [Mode, Parameters<typeof t>[0]][] = [
    ['countries', 'MAP_PREVIEW_MODE_COUNTRIES'],
    ['regions', 'MAP_PREVIEW_MODE_REGIONS'],
    ['seaZones', 'MAP_PREVIEW_MODE_SEA_ZONES'],
  ];
  for (const [m, key] of modes) {
    const button = element('button', 'button map-preview-mode', t(key));
    button.type = 'button';
    button.dataset.testid = `mode-${m}`;
    button.onclick = () => setMode(m);
    modeButtons.set(m, button);
    buttons.append(button);
  }
  const reset = element('button', 'button', t('MAP_PREVIEW_RESET'));
  reset.type = 'button';
  reset.onclick = () => {
    fitView();
    draw();
  };
  buttons.append(reset);
  panel.append(buttons);
  const back = element('a', 'map-preview-back', t('MAP_PREVIEW_BACK'));
  back.href = './';
  panel.append(back);

  // ── View (pan and zoom) ─────────────────────────────────────────────────
  const view = { scale: 1, x: 0, y: 0 };
  let width = 0;
  let height = 0;
  const dpr = () => window.devicePixelRatio || 1;
  const fitView = () => {
    view.scale = Math.min(width / 360, height / 160);
    view.x = (width - 360 * view.scale) / 2;
    view.y = (height - 180 * view.scale) / 2 + 8 * view.scale;
  };
  const resize = () => {
    width = root.clientWidth;
    height = root.clientHeight;
    canvas.width = Math.round(width * dpr());
    canvas.height = Math.round(height * dpr());
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };
  /** The map loops east–west: world x is wrapped into [0, 360). */
  const wrapX = (x: number) => ((x % 360) + 360) % 360;
  const toWorld = (sx: number, sy: number) =>
    [wrapX((sx - view.x) / view.scale), (sy - view.y) / view.scale] as const;
  /** Keeps the horizontal offset within one world width, so panning never runs out of map. */
  const normalizeView = () => {
    const span = 360 * view.scale;
    view.x = (((view.x % span) + span) % span) - span;
  };

  // ── Drawing ─────────────────────────────────────────────────────────────
  // CPU drawing: thousands of detailed paths draw faster on the CPU than through an emulated or
  // low-end GPU, and the preview only redraws when something changes.
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const provinceFill = (id: string): string => {
    const p = provinces.get(id)!;
    if (mode === 'countries') return shade(countries.get(p.country)!.mapColor, id, 0.12);
    if (mode === 'regions')
      return shade(
        REGION_COLORS[regionOrder.indexOf(p.region) % REGION_COLORS.length],
        p.region,
        0.3,
      );
    return '#4a4d52';
  };
  const highlighted = (): {
    provinces: Set<string>;
    seaZones: Set<string>;
    main: string | null;
  } => {
    const result = {
      provinces: new Set<string>(),
      seaZones: new Set<string>(),
      main: selection?.id ?? null,
    };
    if (selection?.kind === 'province') {
      const p = provinces.get(selection.id)!;
      p.adjacentProvinces.forEach((n) => result.provinces.add(n));
      p.adjacentSeaZones.forEach((z) => result.seaZones.add(z));
    } else if (selection?.kind === 'seaZone') {
      seaZones.get(selection.id)!.adjacentSeaZones.forEach((z) => result.seaZones.add(z));
      (coastalProvinces.get(selection.id) ?? []).forEach((p) => result.provinces.add(p));
    }
    return result;
  };

  function draw(): void {
    normalizeView();
    const ratio = dpr();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b1622';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Draw as many copies of the world, side by side, as the screen needs.
    const span = 360 * view.scale;
    for (let copyX = view.x; copyX < width; copyX += span) {
      context.setTransform(
        view.scale * ratio,
        0,
        0,
        view.scale * ratio,
        copyX * ratio,
        view.y * ratio,
      );
      drawWorld();
    }
  }

  function drawWorld(): void {
    const line = (px: number) => px / view.scale;
    const lit = highlighted();

    for (const shape of seaShapes) {
      const zone = seaZones.get(shape.id)!;
      let fill = mode === 'seaZones' ? SEA_COLORS[hash(shape.id) % SEA_COLORS.length] : '#1b2f45';
      if (mode === 'seaZones' && zone.depth === 'shallow') fill = '#2b5878';
      if (lit.main === shape.id) fill = '#c8a85a';
      else if (lit.seaZones.has(shape.id)) fill = '#6f6a4a';
      context.fillStyle = fill;
      context.fill(shape.path);
    }
    context.strokeStyle = mode === 'seaZones' ? '#7fa6c8' : '#35506b';
    context.lineWidth = line(mode === 'seaZones' ? 1.2 : 0.8);
    context.stroke(seaBorders);

    for (const shape of provinceShapes) {
      let fill = provinceFill(shape.id);
      if (lit.main === shape.id) fill = '#e8c86a';
      else if (lit.provinces.has(shape.id)) fill = '#b89a50';
      context.fillStyle = fill;
      context.fill(shape.path, 'evenodd');
    }
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(10, 14, 20, 0.45)';
    context.lineWidth = line(0.6);
    context.stroke(provinceBorders);
    context.strokeStyle = 'rgba(8, 10, 14, 0.95)';
    context.lineWidth = line(mode === 'regions' ? 2.2 : 1.4);
    context.stroke(mode === 'regions' ? regionBorders : countryBorders);
    context.strokeStyle = 'rgba(200, 220, 240, 0.35)';
    context.lineWidth = line(0.7);
    context.stroke(coastline);
  }

  // ── Picking and details ─────────────────────────────────────────────────
  const hitContext = document.createElement('canvas').getContext('2d')!;
  const hit = (shapes: Shape[], x: number, y: number) =>
    shapes.find(
      (s) =>
        x >= s.box[0] &&
        x <= s.box[2] &&
        y >= s.box[1] &&
        y <= s.box[3] &&
        hitContext.isPointInPath(s.path, x, y, 'evenodd'),
    );
  const pickWorld = (x: number, y: number): Selection => {
    const province = hit(provinceShapes, x, y);
    if (province) return { kind: 'province', id: province.id };
    const zone = hit(seaShapes, x, y);
    return zone ? { kind: 'seaZone', id: zone.id } : null;
  };
  const nameOf = (s: NonNullable<Selection>) =>
    s.kind === 'province' ? tKey(provinceNameKey(s.id)) : tKey(seaZoneNameKey(s.id));
  const describe = (s: NonNullable<Selection>): [string, string][] => {
    if (s.kind === 'province') {
      const p = provinces.get(s.id)!;
      const region = regions.get(p.region)!;
      const rows: [string, string][] = [
        [t('MAP_PREVIEW_COUNTRY'), tKey(countryNameKey(p.country))],
        [t('MAP_PREVIEW_REGION'), tKey(regionNameKey(p.region))],
        [t('MAP_PREVIEW_CLIMATE'), tKey(`CLIMATE_${region.climate.toUpperCase()}`)],
        [
          t('MAP_PREVIEW_AREA'),
          t('MAP_PREVIEW_AREA_VALUE', { area: p.areaKm2.toLocaleString('en') }),
        ],
      ];
      const capitalOf = [...countries.values()].find((c) => c.capitalProvince === p.id);
      if (capitalOf)
        rows.unshift([
          '★',
          t('MAP_PREVIEW_CAPITAL', { country: tKey(countryNameKey(capitalOf.id)) }),
        ]);
      return rows;
    }
    const zone = seaZones.get(s.id)!;
    return [[t('MAP_PREVIEW_DEPTH'), tKey(`SEA_DEPTH_${zone.depth.toUpperCase()}`)]];
  };
  const list = (title: string, names: string[]) => {
    const wrap = element('div', 'map-preview-list');
    wrap.append(element('h3', 'map-preview-list-title', `${title} (${names.length})`));
    wrap.append(
      element(
        'p',
        '',
        names.length ? names.sort((a, b) => a.localeCompare(b)).join(', ') : t('MAP_PREVIEW_NONE'),
      ),
    );
    return wrap;
  };
  const showDetails = () => {
    details.replaceChildren();
    details.hidden = selection === null;
    if (!selection) return;
    const title = element('h2', 'panel-title', nameOf(selection));
    title.dataset.testid = 'details-title';
    details.append(title);
    const facts = element('dl', 'facts');
    for (const [label, value] of describe(selection))
      facts.append(element('dt', '', label), element('dd', '', value));
    details.append(facts);
    if (selection.kind === 'province') {
      const p = provinces.get(selection.id)!;
      details.append(
        list(
          t('MAP_PREVIEW_NEIGHBORS'),
          p.adjacentProvinces.map((n) => tKey(provinceNameKey(n))),
        ),
      );
      details.append(
        list(
          t('MAP_PREVIEW_SEA_NEIGHBORS'),
          p.adjacentSeaZones.map((z) => tKey(seaZoneNameKey(z))),
        ),
      );
    } else {
      details.append(
        list(
          t('MAP_PREVIEW_SEA_NEIGHBORS'),
          seaZones.get(selection.id)!.adjacentSeaZones.map((z) => tKey(seaZoneNameKey(z))),
        ),
      );
      details.append(
        list(
          t('MAP_PREVIEW_NEIGHBORS'),
          (coastalProvinces.get(selection.id) ?? []).map((p) => tKey(provinceNameKey(p))),
        ),
      );
    }
  };
  const select = (next: Selection) => {
    selection = next;
    showDetails();
    draw();
  };
  const setMode = (next: Mode) => {
    mode = next;
    for (const [m, button] of modeButtons) button.classList.toggle('is-active', m === mode);
    draw();
  };

  // ── Input ───────────────────────────────────────────────────────────────
  let drag: { x: number; y: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag && event.buttons) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        view.x += dx;
        view.y += dy;
        drag.x = event.clientX;
        drag.y = event.clientY;
        tooltip.hidden = true;
        draw();
        return;
      }
    }
    const [x, y] = toWorld(event.offsetX, event.offsetY);
    const target = pickWorld(x, y);
    tooltip.hidden = target === null;
    if (target) {
      tooltip.textContent =
        target.kind === 'province'
          ? `${nameOf(target)} · ${tKey(countryNameKey(provinces.get(target.id)!.country))}`
          : nameOf(target);
      tooltip.style.left = `${event.offsetX + 14}px`;
      tooltip.style.top = `${event.offsetY + 14}px`;
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (drag && !drag.moved) {
      const [x, y] = toWorld(event.offsetX, event.offsetY);
      select(pickWorld(x, y));
    }
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => (tooltip.hidden = true));
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const next = Math.min(400, Math.max(1, view.scale * factor));
      const wx = (event.offsetX - view.x) / view.scale;
      const wy = (event.offsetY - view.y) / view.scale;
      view.scale = next;
      view.x = event.offsetX - wx * next;
      view.y = event.offsetY - wy * next;
      draw();
    },
    { passive: false },
  );
  window.addEventListener('resize', () => {
    resize();
    draw();
  });

  resize();
  fitView();
  setMode('countries');

  window.__mapPreview = {
    ready: true,
    counts,
    pick: (lon, lat) => pickWorld(wrapX(lon + 180), 90 - lat),
    select,
    setMode,
  };
}

const root = document.getElementById('map-preview');
if (root) {
  start(root).catch((error: unknown) => {
    console.error(error);
    const message = element(
      'div',
      'panel map-preview-error',
      `${t('MAP_PREVIEW_FAILED')} ${String(error)}`,
    );
    message.setAttribute('role', 'alert');
    root.append(message);
  });
}
