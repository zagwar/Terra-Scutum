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
    /** Sea zone borders in the "sea zones" map mode, where they stand out. */
    seaZoneBorderEmphasis: lineStyle,
    selection: lineStyle,
  }),
});

export type MapViewConfig = z.infer<typeof mapViewSchema>;
export type MapLineStyle = MapViewConfig['lines']['provinceBorder'];
