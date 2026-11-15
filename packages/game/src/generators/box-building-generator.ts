import type { BoxBuildingSpec, DetailLevel } from '@terra-scutum/sim';
import { type MeshData, MeshBuilder, box, boundsOf, gabledRoof, mergeMeshes } from './mesh-data';
import type { GeneratedModel } from './model-types';
import { seededRandom } from './seeded-random';

/**
 * The `boxBuilding` generator (F133, placeholder [DEFAULT]): a block of
 * floors with a flat or pitched roof. The wall material's pattern draws the
 * windows, one row per floor. The seed decides the size and shape (the same
 * for every detail level); the detail level decides the faces:
 * - icon: one box;
 * - simple: the walls and the roof, and the upper block of a building that steps back;
 * - detailed: plus rooftop units, a stair house and an entrance canopy.
 */
export function generateBoxBuilding(
  spec: BoxBuildingSpec,
  seed: number,
  detail: DetailLevel,
): GeneratedModel {
  const random = seededRandom(seed);
  const floors = random.intInRange(spec.floors);
  const width = random.inRange(spec.width);
  const depth = random.inRange(spec.depth);
  const gabled = floors <= spec.gabledMaxFloors && random.chance(spec.gabledShare);
  const steps = !gabled && floors >= 6 && random.chance(spec.setbackShare);
  const setbackFloor = Math.max(3, Math.round(floors * random.between(0.55, 0.75)));
  const upperShare = random.between(0.55, 0.8);
  const units = random.intInRange(spec.rooftopUnits);
  const unitSpots = Array.from({ length: 12 }, () => [
    random.between(-0.35, 0.35),
    random.between(-0.35, 0.35),
    random.between(1.5, 3.5),
  ]);
  const roofHeight = Math.min(width, depth) * random.between(0.25, 0.4);
  const canopySide = random.chance(0.5) ? 1 : -1;

  const wallHeight = floors * spec.floorHeight;
  const height = wallHeight + (gabled ? roofHeight : 0);

  const walls: MeshData[] = [];
  const roof: MeshData[] = [];
  const extras: MeshData[] = [];
  if (detail === 'icon') {
    walls.push(box(width, height, depth));
  } else {
    // The lower block (all of the building, if it doesn't step back) …
    const lowerHeight = steps ? setbackFloor * spec.floorHeight : wallHeight;
    walls.push(box(width, lowerHeight, depth, 0, false, false));
    roof.push(flatTop(width, depth, lowerHeight));
    let topWidth = width;
    let topDepth = depth;
    // … and the upper block standing on it.
    if (steps) {
      topWidth = width * upperShare;
      topDepth = depth * upperShare;
      walls.push(box(topWidth, wallHeight - lowerHeight, topDepth, lowerHeight, false, false));
      roof.push(flatTop(topWidth, topDepth, wallHeight));
    }
    if (gabled) {
      roof.length = 0;
      roof.push(gabledRoof(width, depth, roofHeight, wallHeight));
    }
    if (detail === 'detailed') {
      if (!gabled) {
        // Rooftop units and a stair house on the flat roof.
        for (let i = 0; i < units; i++) {
          const [u, v, size] = unitSpots[i];
          extras.push(boxAt(size, size * 0.6, size, u * topWidth, wallHeight, v * topDepth));
        }
        extras.push(boxAt(3, 2.8, 4, topWidth * 0.25, wallHeight, -topDepth * 0.2));
      }
      // An entrance canopy over the door.
      extras.push(
        boxAt(width * 0.3, 0.4, 2, 0, spec.floorHeight * 0.85, canopySide * (depth / 2 + 1)),
      );
    }
  }

  const parts = [
    { material: spec.wallMaterial, mesh: mergeMeshes(walls) },
    { material: spec.roofMaterial, mesh: mergeMeshes(roof) },
    { material: spec.detailMaterial, mesh: mergeMeshes(extras) },
  ].filter((part) => part.mesh.indices.length > 0);
  const bounds = boundsOf(parts.map((part) => part.mesh));
  return {
    detail,
    parts,
    height: bounds[4],
    radius: Math.max(-bounds[0], bounds[3], -bounds[2], bounds[5]),
  };
}

/** A flat roof: the top face of a block. */
function flatTop(width: number, depth: number, y: number): MeshData {
  const b = new MeshBuilder();
  const x = width / 2;
  const z = depth / 2;
  b.quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
  return b.build();
}

/** A small closed box with its bottom at (x, y, z). */
function boxAt(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): MeshData {
  const b = new MeshBuilder();
  const moved = box(width, height, depth, y, true);
  for (let i = 0; i < moved.positions.length; i += 3) {
    moved.positions[i] += x;
    moved.positions[i + 2] += z;
  }
  b.append(moved);
  return b.build();
}
