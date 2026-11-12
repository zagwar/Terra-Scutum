/**
 * Camera math for the fixed map camera (the strategy camera is F03).
 *
 * The camera looks north, leaning back from straight-down by `tilt`, at a
 * target point on the ground. Pure math, no Babylon.
 */
export interface CameraFitInput {
  /** Half of the map's east–west width, in world units. */
  readonly halfWidth: number;
  /** The map's southern and northern edges. */
  readonly minZ: number;
  readonly maxZ: number;
  /** Viewport width divided by height. */
  readonly aspect: number;
  /** Vertical field of view, in radians. */
  readonly fieldOfView: number;
  /** Lean back from straight-down, in radians. */
  readonly tilt: number;
  /** Fraction of the screen kept free around the map (0.02 = 2 %). */
  readonly margin: number;
}

export interface CameraFit {
  /** Distance from the camera to its target. */
  readonly radius: number;
  /** Where on the ground (north–south) the camera looks. */
  readonly targetZ: number;
}

/** Where a ground point lands on screen: x and y from -1 (left/bottom) to +1 (right/top). */
export function groundToScreen(
  x: number,
  z: number,
  fit: CameraFit,
  input: Pick<CameraFitInput, 'aspect' | 'fieldOfView' | 'tilt'>,
): { x: number; y: number } {
  const t = Math.tan(input.fieldOfView / 2);
  const dz = z - fit.targetZ;
  const depth = fit.radius + dz * Math.sin(input.tilt);
  return { x: x / (depth * t * input.aspect), y: (dz * Math.cos(input.tilt)) / (depth * t) };
}

/**
 * The closest camera that still shows the whole map: one full copy of the
 * world, edge to edge, centered top to bottom.
 */
export function fitMapCamera(input: CameraFitInput): CameraFit {
  const limit = 1 - input.margin;

  // For a given distance, look at the spot that puts the top and bottom edges equally far from the middle.
  const centered = (radius: number): CameraFit => {
    let low = input.minZ;
    let high = input.maxZ;
    for (let i = 0; i < 48; i++) {
      const targetZ = (low + high) / 2;
      const fit = { radius, targetZ };
      const top = groundToScreen(0, input.maxZ, fit, input).y;
      const bottom = groundToScreen(0, input.minZ, fit, input).y;
      if (top + bottom > 0) low = targetZ;
      else high = targetZ;
    }
    return { radius, targetZ: (low + high) / 2 };
  };
  const fits = (fit: CameraFit): boolean => {
    // The near (southern) edge is the widest on screen.
    const corner = groundToScreen(input.halfWidth, input.minZ, fit, input);
    const top = groundToScreen(0, input.maxZ, fit, input);
    return corner.x <= limit && top.y <= limit && corner.y >= -limit;
  };

  const height = input.maxZ - input.minZ;
  let near = height * Math.sin(input.tilt) + 1e-3; // closer than this, the near edge is behind the camera
  let far = (input.halfWidth + height) * 1000;
  for (let i = 0; i < 64; i++) {
    const middle = (near + far) / 2;
    if (fits(centered(middle))) far = middle;
    else near = middle;
  }
  return centered(far);
}
