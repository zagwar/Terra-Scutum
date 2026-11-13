/**
 * Math for the strategy camera (F03). Pure code, no Babylon, unit tested.
 *
 * The camera looks at a point on the ground (the middle of the screen) from
 * a distance set by the zoom. It leans back from straight down by a tilt
 * that grows as it zooms in, and it can turn: the heading is the compass
 * direction the top of the screen points to (0 = north, π/2 = east).
 */

/** A direction on the ground: x east, z north. */
export interface GroundVector {
  readonly x: number;
  readonly z: number;
}

/**
 * The tilt (lean back from straight down, in radians) at a zoom level: `far`
 * with the whole world in view (zoom 1), `near` at the closest zoom, and in
 * between evenly per zoom step (zooming is multiplicative, so this goes by
 * the logarithm of the zoom).
 */
export function tiltForZoom(zoom: number, maxZoom: number, far: number, near: number): number {
  if (maxZoom <= 1) return far;
  const t = Math.min(1, Math.max(0, Math.log(zoom) / Math.log(maxZoom)));
  return far + (near - far) * t;
}

/**
 * How much of the remaining way a smoothly moving value covers in one frame
 * of `seconds`: it closes the gap by about 63 % every `smoothSeconds` (an
 * exponential glide, the same at every frame rate). 0 smoothing = no glide.
 */
export function glideFraction(seconds: number, smoothSeconds: number): number {
  if (smoothSeconds <= 0 || !Number.isFinite(seconds)) return 1;
  return 1 - Math.exp(-Math.max(0, seconds) / smoothSeconds);
}

/** The shortest way from one value to another on a circle `period` around (longitudes, angles). */
export function wrappedDelta(from: number, to: number, period: number): number {
  const delta = (to - from) % period;
  if (delta > period / 2) return delta - period;
  if (delta < -period / 2) return delta + period;
  return delta;
}

/** The ground directions of the screen's "right" and "up" for a heading. */
export function screenAxes(heading: number): { right: GroundVector; up: GroundVector } {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return { right: { x: cos, z: -sin }, up: { x: sin, z: cos } };
}

/**
 * The Babylon `ArcRotateCamera` angle `alpha` for a heading: the camera sits
 * on the far side of its target from where the top of the screen points.
 */
export function cameraAlphaForHeading(heading: number): number {
  return Math.atan2(-Math.cos(heading), -Math.sin(heading));
}

/**
 * Edge scrolling: which way to move when the mouse is within `edgePx` of the
 * canvas's edge. `right` and `up` are -1, 0 or 1 (screen directions); both 0
 * away from the edges, or when edge scrolling is off (`edgePx` 0).
 */
export function edgeScrollDirection(
  pointer: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  edgePx: number,
): { right: number; up: number } {
  if (edgePx <= 0) return { right: 0, up: 0 };
  const right = pointer.x < edgePx ? -1 : pointer.x >= width - edgePx ? 1 : 0;
  const up = pointer.y < edgePx ? 1 : pointer.y >= height - edgePx ? -1 : 0;
  return { right, up };
}
