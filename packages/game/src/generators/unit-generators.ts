import type { BugSpec, DetailLevel, VehicleSpec } from '@terra-scutum/sim';
import {
  type MeshData,
  MeshBuilder,
  blob,
  boundsOf,
  box,
  diamond,
  frustum,
  makeTransform,
  mergeMeshes,
} from './mesh-data';
import type { GeneratedModel, ModelPart } from './model-types';
import { seededRandom } from './seeded-random';

/**
 * Placeholder unit models (F139, for the render stress test; [DEFAULT]).
 * They stand in for the real unit models of M8, which will be generated
 * from the player's designs (section 12.6); for now only their size and
 * triangle count matter. Both face +x.
 */

/** How far a bug's upper leg leans out from upright (radians), and the lower leg's outward slope. */
const UPPER_LEG_LEAN = 1.1;
const LOWER_LEG_SLOPE = 0.3;

/** A copy of a mesh moved and turned (see `makeTransform`). */
function placed(
  mesh: MeshData,
  offset: [number, number, number],
  yaw = 0,
  leanX = 0,
  leanZ = 0,
): MeshData {
  const b = new MeshBuilder();
  b.append(mesh, makeTransform(offset, yaw, leanX, leanZ));
  return b.build();
}

function finish(detail: DetailLevel, parts: ModelPart[]): GeneratedModel {
  const kept = parts.filter((part) => part.mesh.indices.length > 0);
  const bounds = boundsOf(kept.map((part) => part.mesh));
  return {
    detail,
    parts: kept,
    height: bounds[4],
    radius: Math.max(-bounds[0], bounds[3], -bounds[2], bounds[5]),
  };
}

/**
 * The `vehicle` generator: a tank-like placeholder. Icon: the hull as one box;
 * simple: hull, turret and gun; detailed: plus tracks and a hatch.
 */
export function generateVehicle(
  spec: VehicleSpec,
  seed: number,
  detail: DetailLevel,
): GeneratedModel {
  const random = seededRandom(seed);
  const length = random.inRange(spec.length);
  const width = random.inRange(spec.width);
  const hullHeight = random.inRange(spec.hullHeight);
  const turret = random.chance(spec.turretShare);
  const gunLength = length * random.inRange(spec.gunShare);
  const turretSize = random.between(0.4, 0.5);

  const hull: MeshData[] = [];
  const details: MeshData[] = [];
  const trackHeight = hullHeight * 0.45;
  if (detail === 'icon') {
    hull.push(box(length, hullHeight + (turret ? hullHeight * 0.6 : 0), width));
  } else {
    hull.push(box(length, hullHeight - trackHeight, width * 0.8, trackHeight));
    const top = hullHeight;
    if (turret) {
      const turretHeight = hullHeight * 0.6;
      hull.push(box(length * turretSize, turretHeight, width * 0.6, top));
      const sides = detail === 'detailed' ? 8 : 5;
      // The gun: a thin cylinder laid along +x.
      details.push(
        placed(
          frustum(sides, 0.12, 0.1, gunLength, 0, false, true),
          [(length * turretSize) / 2, top + turretHeight * 0.5, 0],
          0,
          0,
          -Math.PI / 2,
        ),
      );
      if (detail === 'detailed')
        details.push(placed(frustum(6, 0.35, 0.3, 0.2, top + turretHeight, false), [-0.3, 0, 0.3]));
    }
    // Tracks: a box on each side.
    for (const side of [-1, 1])
      details.push(
        placed(box(length, trackHeight, width * 0.2, 0, false, true), [0, 0, side * width * 0.4]),
      );
    if (detail === 'detailed')
      // Road wheels along the tracks.
      for (const side of [-1, 1])
        for (let w = 0; w < 3; w++)
          details.push(
            placed(box(0.6, trackHeight * 0.7, 0.1, trackHeight * 0.1), [
              (w / 2 - 0.5) * length * 0.75,
              0,
              side * width * 0.51,
            ]),
          );
  }
  return finish(detail, [
    { material: spec.hullMaterial, mesh: mergeMeshes(hull) },
    { material: spec.detailMaterial, mesh: mergeMeshes(details) },
  ]);
}

/**
 * The `bug` generator: a placeholder Swarm bug (section 10.5 will give every
 * bug type its own body plan). A row of body segments, legs, and on some
 * bug types a glowing organ (the Interceptor's laser organ). Icon: one
 * diamond; simple: rough segments and straight legs; detailed: rounder
 * segments, legs with a knee, mandibles.
 */
export function generateBug(spec: BugSpec, seed: number, detail: DetailLevel): GeneratedModel {
  const random = seededRandom(seed);
  const length = random.inRange(spec.length);
  const segments = random.intInRange(spec.segments);
  const legPairs = random.intInRange(spec.legPairs);
  const legLength = length * random.inRange(spec.legShare);
  const bodyHeight = legLength * 0.55;
  const segmentRadius = length / (segments * 2);
  const sizes = Array.from({ length: 6 }, () => random.between(0.8, 1.15));
  const spread = Array.from({ length: 6 }, () => random.between(-0.25, 0.25));

  const body: MeshData[] = [];
  const legs: MeshData[] = [];
  const organ: MeshData[] = [];
  const bodyY = bodyHeight + segmentRadius * 0.6;
  if (detail === 'icon') {
    // From the ground to the top of the segments of the other levels, so switching levels doesn't jump.
    const top = bodyY + segmentRadius * 0.7;
    body.push(diamond(length / 2, [0, top / 2, 0], top / length));
    if (spec.organ) organ.push(diamond(segmentRadius * 0.5, [0, bodyY + segmentRadius, 0], 1));
  } else {
    for (let s = 0; s < segments; s++) {
      const x = (s - (segments - 1) / 2) * segmentRadius * 1.8;
      const radius = segmentRadius * sizes[s];
      body.push(
        detail === 'detailed'
          ? blob(radius, [x, bodyY, 0], 0, 0.7)
          : diamond(radius, [x, bodyY, 0], 0.7),
      );
    }
    const legSides = 3;
    for (let pair = 0; pair < legPairs; pair++) {
      const x = ((pair + 0.5) / legPairs - 0.5) * length * 0.7 + spread[pair] * segmentRadius;
      for (const side of [-1, 1]) {
        if (detail === 'detailed') {
          // The upper leg rises out to the knee, the lower leg comes down to the ground.
          const upper = legLength * 0.6;
          const kneeY = bodyY + upper * Math.cos(UPPER_LEG_LEAN);
          const kneeZ = side * upper * Math.sin(UPPER_LEG_LEAN);
          const footZ = kneeZ + side * kneeY * LOWER_LEG_SLOPE;
          legs.push(
            placed(
              frustum(legSides, 0.12, 0.09, upper, 0, false, false),
              [x, bodyY, 0],
              0,
              side * UPPER_LEG_LEAN,
            ),
          );
          legs.push(
            placed(
              frustum(
                legSides,
                0.05,
                0.09,
                kneeY * Math.hypot(1, LOWER_LEG_SLOPE),
                0,
                false,
                false,
              ),
              [x, 0, footZ],
              0,
              -side * Math.atan(LOWER_LEG_SLOPE),
            ),
          );
        } else {
          // One straight leg from the ground in to the body.
          legs.push(
            placed(
              frustum(legSides, 0.06, 0.1, legLength, 0, false, false),
              [x, 0, side * legLength * 0.6],
              0,
              -side * 0.6,
            ),
          );
        }
      }
    }
    if (detail === 'detailed')
      // Mandibles at the front.
      for (const side of [-1, 1])
        legs.push(
          placed(
            frustum(3, 0.12, 0, segmentRadius * 1.2, 0, false, false),
            [
              length / 2 - segmentRadius * 0.3,
              bodyY - segmentRadius * 0.2,
              side * segmentRadius * 0.3,
            ],
            0,
            0,
            -Math.PI / 2,
          ),
        );
    if (spec.organ)
      organ.push(diamond(segmentRadius * 0.45, [0, bodyY + segmentRadius * 0.75, 0], 1.6));
  }
  return finish(detail, [
    { material: spec.bodyMaterial, mesh: mergeMeshes(body) },
    { material: spec.legMaterial, mesh: mergeMeshes(legs) },
    { material: spec.organMaterial, mesh: mergeMeshes(organ) },
  ]);
}
