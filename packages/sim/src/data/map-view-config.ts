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
  camera: z.strictObject({
    /** How far the camera leans back from looking straight down, in degrees. */
    tiltDegrees: z.number().min(0).max(75),
    /** The camera's vertical field of view, in degrees. */
    fieldOfViewDegrees: z.number().min(10).max(90),
    /** Empty space kept around the map when it's fitted to the window (0.02 = 2 %). */
    fitMargin: z.number().min(0).max(0.4),
    /** Speed of the temporary arrow-key scrolling (until the strategy camera, F03), in degrees of longitude per second. */
    scrollDegreesPerSecond: z.number().positive(),
  }),
  /**
   * Level of detail. From far away the land is drawn from simplified shapes
   * (three copies side by side, for the east–west wrap); close up, from the
   * full shapes, cut into chunks so only the ones on screen are drawn.
   */
  detail: z.strictObject({
    /** How much the far-away shapes are simplified: details smaller than about this many degrees are dropped. */
    farSimplifyDegrees: z.number().min(0).max(1),
    /** The full shapes are used when one screen pixel covers less than this many degrees. */
    nearMaxDegreesPerPixel: z.number().positive(),
    /** Size of a chunk of the far-away shapes, in degrees. */
    farChunkDegrees: z.number().min(5).max(360),
    /** Size of a chunk of the full shapes, in degrees. */
    chunkDegrees: z.number().min(5).max(120),
  }),
  colors: z.strictObject({
    /** Behind the map. */
    background: hexColor,
    /** Land in the "provinces" map mode; each province is shaded slightly differently. */
    land: hexColor,
    landVariation: fraction,
    seaDeep: hexColor,
    seaShallow: hexColor,
    seaVariation: fraction,
    /** Colors for the "regions" map mode; neighboring regions get different ones. */
    regionPalette: z.array(hexColor).min(4),
    regionVariation: fraction,
    /** The selected province, and how strongly its neighbors are tinted with `neighbor`. */
    selected: hexColor,
    neighbor: hexColor,
    neighborStrength: fraction,
    /** How much the province under the mouse is brightened. */
    hoverBrighten: fraction,
  }),
  lines: z.strictObject({
    provinceBorder: lineStyle,
    countryBorder: lineStyle,
    regionBorder: lineStyle,
    coast: lineStyle,
    seaZoneBorder: lineStyle,
    selection: lineStyle,
  }),
});

export type MapViewConfig = z.infer<typeof mapViewSchema>;
export type MapLineStyle = MapViewConfig['lines']['provinceBorder'];
