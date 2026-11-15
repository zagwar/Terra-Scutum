import { z } from 'zod';

/**
 * `data/map_view.json`: how the world map is drawn (projection, the fixed
 * camera, colors and border lines). Every value is a [DEFAULT] the designer
 * can change in the data file. The sim itself never uses these: the sim
 * worker validates them with the rest of the data and hands them to the game.
 */
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/, 'colors are written as #rrggbb (lowercase)');
const fraction = z.number().min(0).max(1);

const lineStyle = z.strictObject({
  color: hexColor,
  /** 0 = invisible, 1 = solid. */
  opacity: fraction,
  /** Line width on screen, in pixels (the same at every zoom level). */
  widthPx: z.number().positive().max(16),
});

export const MAP_PROJECTIONS = ['miller', 'equirectangular'] as const;
export type MapProjectionType = (typeof MAP_PROJECTIONS)[number];

/**
 * What covers the ground. The order is part of the terrain tile format
 * (terrain-format.ts): a tile stores a class as its position in this list.
 */
export const LAND_COVER_CLASSES = [
  'none',
  'forest',
  'shrubland',
  'grassland',
  'farmland',
  'urban',
  'bare',
  'snow',
  'water',
  'wetland',
  'mangrove',
  'tundra',
] as const;
export type LandCoverClass = (typeof LAND_COVER_CLASSES)[number];

/** A generated ground material for one land cover class (section 12.6): start simple, improve later. */
const groundMaterial = z.strictObject({
  color: hexColor,
  /** How strongly the generated surface pattern shows on this ground up close: 0 = smooth, 1 = rough. */
  roughness: fraction,
});

const terrainSchema = z
  .strictObject({
    /** The finest terrain level the game uses (0 = coarsest). Lower it on weak machines: less detail up close. */
    maxLevel: z.number().int().min(0).max(8),
    /**
     * A finer level is used once one of its height samples would cover at least this many screen
     * pixels. Higher = coarser terrain for the same zoom (cheaper).
     */
    pixelsPerSample: z.number().min(0.5).max(16),
    /**
     * Per terrain level (0 = coarsest; the last number also counts for finer levels): the land's
     * mesh has a corner every this many height samples (1 = every sample; higher = fewer triangles).
     */
    meshSteps: z.array(z.number().int().min(1).max(64)).min(1),
    /** Levels up to this one are drawn from the simplified province shapes (`detail.farSimplifyDegrees`). */
    simplifiedShapesMaxLevel: z.number().int().min(-1).max(8),
    /** How many times higher than in reality the land rises, with the whole world in view and at the closest zoom. */
    exaggeration: z.number().min(0).max(200),
    exaggerationNear: z.number().min(0).max(200),
    /** Where the light comes from (compass direction and height above the horizon, in degrees) and how strong the shading is. */
    lightAzimuthDegrees: z.number().min(0).max(360),
    lightElevationDegrees: z.number().min(5).max(90),
    shadingStrength: z.number().min(0).max(4),
    /** Slopes never get darker or brighter than this (1 = flat ground). */
    shadeMin: z.number().min(0).max(1),
    shadeMax: z.number().min(1).max(3),
    /**
     * How much of the map mode's color covers the terrain, by zoom: at each `zoom` the color has
     * this `strength` (1 = only the color, 0 = only the terrain); in between it changes evenly per zoom step.
     */
    colorStrength: z.array(z.strictObject({ zoom: z.number().min(1), strength: fraction })).min(1),
    /** Map modes that show the natural terrain: the map mode's land color is not drawn at all. */
    naturalModes: z.array(z.string()),
    /** Up close: how strongly the generated surface pattern shows, and how far (in land cover cells) the edges between land types wander. */
    detailStrength: fraction,
    detailWander: z.number().min(0).max(4),
    /** How many terrain tiles are kept ready at most (the ones not on screen are dropped first). */
    cacheTiles: z.number().int().min(16).max(1024),
    /** Time spent per frame on building terrain that just arrived, in milliseconds. */
    buildMsPerFrame: z.number().min(1).max(100),
    /** One generated ground material per land cover class. */
    materials: z.strictObject(
      Object.fromEntries(LAND_COVER_CLASSES.map((name) => [name, groundMaterial])) as Record<
        (typeof LAND_COVER_CLASSES)[number],
        typeof groundMaterial
      >,
    ),
    /**
     * Rivers: per terrain level, the thinnest river drawn (Natural Earth's stroke weight, 0.15…2),
     * or null for no rivers at that level; and from which weight a river counts as major or great.
     */
    rivers: z.strictObject({
      minWeightByLevel: z.array(z.number().min(0).nullable()),
      majorWeight: z.number().positive(),
      greatWeight: z.number().positive(),
    }),
  })
  .refine((t) => t.colorStrength.every((stop, i, all) => i === 0 || stop.zoom > all[i - 1].zoom), {
    message: 'colorStrength must be listed from the farthest zoom to the closest',
  });
export type TerrainViewConfig = z.infer<typeof terrainSchema>;

/** A value that changes with the zoom: at each `zoom` it is `px`; in between it changes evenly per zoom step. */
const pixelStops = z
  .array(z.strictObject({ zoom: z.number().min(1), px: z.number().min(0).max(200) }))
  .min(1)
  .refine((stops) => stops.every((stop, i) => i === 0 || stop.zoom > stops[i - 1].zoom), {
    message: 'list the stops from the farthest zoom to the closest',
  });

const modelId = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'model ids are written in camelCase');

/** How the models of one kind of scenery appear as the view zooms in, and how big they are drawn. */
const sceneryLook = {
  /** They start to grow in at `fromZoom` and are full size from `fullZoom`. */
  fromZoom: z.number().min(1),
  fullZoom: z.number().min(1),
  /**
   * How tall a model of `referenceHeight` model units is drawn on screen, in pixels, by zoom.
   * Real size would be far too small to see, so models are drawn as oversized symbols, like the land's heights.
   */
  sizePx: pixelStops,
  referenceHeight: z.number().positive(),
};

/** Scenery on the map (F133): generated models standing on the land, drawn with thin instances. */
const scenerySchema = z.strictObject({
  /**
   * Which detail level a model is drawn with, by how tall it is on screen: below `simplePx`
   * pixels the icon, from `detailedPx` the detailed model, the simple one in between.
   */
  simplePx: z.number().min(0),
  detailedPx: z.number().min(0),
  /** How the models are lit (the light comes from where the land's does): the even light from the sky, and the sun. */
  ambientLight: z.number().min(0).max(2),
  sunLight: z.number().min(0).max(2),
  /** Trees on the land cover classes listed, from the land cover of the terrain tiles drawn. */
  forests: z.strictObject({
    enabled: z.boolean(),
    landCover: z.array(z.enum(LAND_COVER_CLASSES)).min(1),
    /**
     * Which tree models grow where: each between two latitudes (north or south, in degrees).
     * Where ranges overlap, the models mix.
     */
    models: z
      .array(
        z.strictObject({
          model: modelId,
          latitudes: z.tuple([z.number().min(0).max(90), z.number().min(0).max(90)]),
        }),
      )
      .min(1),
    ...sceneryLook,
    /** Trees stand about this many pixels apart on fully forested land; zooming in adds trees between them. */
    spacingPx: z.number().min(2).max(200),
    /** Each tree is drawn up to this much bigger or smaller than the others (0.2 = ±20 %). */
    sizeVariation: fraction,
    /** Each tree's color is up to this much lighter or darker. */
    tintVariation: fraction,
    /** Time spent per frame on finding the trees for a new view, in milliseconds (spread over frames, so it never stutters). */
    placeMsPerFrame: z.number().min(0.5).max(100),
    /** The most trees drawn at once (a safety cap for weak machines). */
    maxInstances: z.number().int().min(0).max(1_000_000),
  }),
  /**
   * Placeholder capital markers [DEFAULT]: a small cluster of buildings at each country's capital,
   * until cities are built (F126, M2).
   */
  capitals: z.strictObject({
    enabled: z.boolean(),
    model: modelId,
    /** Buildings per capital. */
    buildings: z.number().int().min(1).max(64),
    /** How far the cluster spreads from the capital, in pixels on screen. */
    clusterPx: z.number().min(0).max(200),
    ...sceneryLook,
  }),
});
export type SceneryConfig = z.infer<typeof scenerySchema>;

export const mapViewSchema = z.strictObject({
  projection: z
    .strictObject({
      /**
       * How the round Earth is flattened. `miller` (like most strategy game
       * maps) keeps northern countries from looking squashed;
       * `equirectangular` uses longitude and latitude directly.
       */
      type: z.enum(MAP_PROJECTIONS),
      /** The map's bottom and top edges, in degrees of latitude. */
      southLatitude: z.number().min(-90).max(0),
      northLatitude: z.number().min(0).max(90),
    })
    .refine((p) => p.northLatitude - p.southLatitude >= 10, {
      message: 'the map must cover at least 10 degrees of latitude',
    }),
  camera: z
    .strictObject({
      /** How far the camera leans back from looking straight down with the whole world in view (zoom 1), in degrees. */
      tiltDegrees: z.number().min(0).max(75),
      /** The same at the closest zoom; in between, the tilt changes evenly with each zoom step. */
      tiltNearDegrees: z.number().min(0).max(75),
      /** The camera's vertical field of view, in degrees. */
      fieldOfViewDegrees: z.number().min(10).max(90),
      /** Empty space kept around the map when it's fitted to the window (0.02 = 2 %). */
      fitMargin: z.number().min(0).max(0.4),
      /** Speed of arrow-key scrolling with the whole world in view, in degrees of longitude per second (slower when zoomed in). */
      scrollDegreesPerSecond: z.number().positive(),
      /** How many times faster WASD and the arrow keys scroll while Shift is held. */
      fastScrollFactor: z.number().min(1).max(20),
      /** How far the player can zoom in: 1 shows the whole world, 50 is fifty times closer. */
      maxZoom: z.number().min(1).max(1000),
      /** How much one notch of the mouse wheel zooms (1.2 = 20 % closer or farther). */
      wheelZoomStep: z.number().min(1.01).max(4),
      /** A province picked from a list is brought into view at least this many pixels wide. */
      focusMinProvincePx: z.number().min(1).max(2000),
      /**
       * How smoothly the camera glides to where it was sent (zoom, scrolling, turning): it covers
       * about two thirds of the remaining way every this many seconds. 0 = no glide.
       */
      smoothSeconds: z.number().min(0).max(2),
      /** The map scrolls when the mouse is this close to the window's edge, in pixels (0 = never). */
      edgeScrollPx: z.number().min(0).max(200),
      /** How fast Q and E turn the map, in degrees per second. */
      rotateDegreesPerSecond: z.number().positive(),
      /** How far the map turns per pixel of dragging with the middle mouse button, in degrees. */
      rotateDegreesPerPixel: z.number().positive(),
    })
    .refine((c) => Math.max(c.tiltDegrees, c.tiltNearDegrees) + c.fieldOfViewDegrees / 2 <= 80, {
      message:
        'the tilt plus half the field of view must stay at or below 80 degrees, or the camera would see the horizon',
    }),
  /** Level of detail of the shapes; the terrain's own levels are under `terrain`. */
  detail: z.strictObject({
    /**
     * How much the shapes of the coarse terrain levels (`terrain.simplifiedShapesMaxLevel`) are
     * simplified: details smaller than about this many degrees are dropped.
     */
    farSimplifyDegrees: z.number().min(0).max(1),
  }),
  colors: z.strictObject({
    /** Behind the map. */
    background: hexColor,
    /** Land in the "provinces" map mode; each province is shaded slightly differently. */
    land: hexColor,
    landVariation: fraction,
    /** The sea in every map mode except "sea zones": one even color (a calm sea). */
    sea: hexColor,
    /**
     * The sea in the "sea zones" map mode: coastal sea zones (bordering at least one
     * province) and open-sea zones, so the coast stands out a little. Each is one even color.
     */
    seaCoastal: hexColor,
    seaOpen: hexColor,
    /** The selected sea zone is tinted with this color (a lighter blue: the sea stays blue), this strongly. */
    seaSelected: hexColor,
    seaSelectedStrength: fraction,
    /**
     * The "political" map mode colors provinces by their owner's map color
     * (`data/countries.json`); each province is shaded slightly differently.
     */
    politicalVariation: fraction,
    /**
     * The "regions" map mode colors provinces by their region's map color (`data/regions.json`,
     * chosen by the map import); each province is shaded slightly differently.
     */
    regionVariation: fraction,
    /** The selected province is tinted with this color, this strongly; its neighbors with `neighbor`. */
    selected: hexColor,
    selectedStrength: fraction,
    neighbor: hexColor,
    neighborStrength: fraction,
    /** How much the province under the mouse is brightened. */
    hoverBrighten: fraction,
    /** The country picked while choosing a country (F05): its provinces are tinted with this color. */
    countryHighlight: hexColor,
    countryHighlightStrength: fraction,
  }),
  lines: z.strictObject({
    provinceBorder: lineStyle,
    countryBorder: lineStyle,
    regionBorder: lineStyle,
    coast: lineStyle,
    seaZoneBorder: lineStyle,
    /** Sea zone borders in the "sea zones" map mode, where they stand out. */
    seaZoneBorderEmphasis: lineStyle,
    selection: lineStyle,
    /** Rivers (F125): ordinary, major and great ones. */
    river: lineStyle,
    riverMajor: lineStyle,
    riverGreat: lineStyle,
  }),
  /** The terrain (F125): relief, ground materials, how map-mode colors lie over it, rivers. */
  terrain: terrainSchema,
  /** Scenery (F133): forests and the placeholder capital markers. */
  scenery: scenerySchema,
});

export type MapViewConfig = z.infer<typeof mapViewSchema>;
export type MapLineStyle = MapViewConfig['lines']['provinceBorder'];
