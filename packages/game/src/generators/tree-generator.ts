import type { DetailLevel, TreeSpec } from '@terra-scutum/sim';
import {
  type MeshData,
  type Transform,
  MeshBuilder,
  blob,
  boundsOf,
  diamond,
  frustum,
  makeTransform,
  mergeMeshes,
} from './mesh-data';
import type { GeneratedModel } from './model-types';
import { seededRandom } from './seeded-random';

/**
 * The `tree` generator (F133, placeholder [DEFAULT]): a trunk and a crown.
 * A conifer's crown is a stack of cones, a broadleaf tree's a cluster of
 * rounded clumps (a tall trunk and a short, wide crown make a jungle tree; a
 * very flat crown an acacia: only the spec differs), a palm's a ring of
 * drooping fronds. The seed decides the proportions (all detail levels of one
 * seed have the same size and shape, so switching levels doesn't jump); the
 * detail level decides how many faces:
 * - icon: a handful of faces (a cone or one clump on a thin trunk), for far away;
 * - simple: a few cones or clumps;
 * - detailed: every cone or clump of the spec, rounder, with a leaning trunk.
 */
export function generateTree(spec: TreeSpec, seed: number, detail: DetailLevel): GeneratedModel {
  const random = seededRandom(seed);
  // Draw every number first, in the same order for every detail level.
  const height = random.inRange(spec.height);
  const trunkTop = height * random.inRange(spec.trunkShare);
  const trunkRadius = height * random.inRange(spec.trunkRadius);
  const crownRadius = height * random.inRange(spec.crownRadius);
  const parts = random.intInRange(spec.crownParts);
  const lean = (spec.leanDegrees * Math.PI) / 180;
  const leanX = random.between(-lean, lean);
  const leanZ = random.between(-lean, lean);
  const turn = random.between(0, Math.PI * 2);
  const clumps = Array.from({ length: 8 }, () => ({
    angle: random.between(0, Math.PI * 2),
    reach: random.between(0.35, 0.6),
    rise: random.between(0, 1),
    size: random.between(0.5, 0.72),
    wobble: random.next() * 1000,
  }));

  const leanAll = detail === 'detailed' ? makeTransform([0, 0, 0], turn, leanX, leanZ) : null;
  const trunk = trunkMesh(detail, trunkRadius, trunkTop, height, spec.kind);
  const crown =
    spec.kind === 'conifer'
      ? coniferCrown(detail, height, trunkTop, crownRadius, parts, turn)
      : spec.kind === 'palm'
        ? palmCrown(detail, height, crownRadius, parts, turn)
        : broadleafCrown(detail, height, trunkTop, crownRadius, parts, clumps);
  const lean3 = (mesh: MeshData) => (leanAll ? transformMesh(mesh, leanAll) : mesh);
  const trunkMeshData = lean3(trunk);
  const crownMeshData = lean3(crown);
  const bounds = boundsOf([trunkMeshData, crownMeshData]);
  return {
    detail,
    parts: [
      { material: spec.trunkMaterial, mesh: trunkMeshData },
      { material: spec.crownMaterial, mesh: crownMeshData },
    ],
    height: bounds[4],
    radius: Math.max(-bounds[0], bounds[3], -bounds[2], bounds[5]),
  };
}

/** A mesh moved and turned (the lean of the detailed tree). */
function transformMesh(mesh: MeshData, transform: Transform): MeshData {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = transform.point([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    const n = transform.direction([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]);
    positions.set(p, i);
    normals.set(n, i);
  }
  return { positions, normals, uvs: mesh.uvs, indices: mesh.indices };
}

function trunkMesh(
  detail: DetailLevel,
  radius: number,
  trunkTop: number,
  height: number,
  kind: TreeSpec['kind'],
): MeshData {
  // The trunk reaches a little into the crown, so no gap shows.
  const top =
    kind === 'conifer'
      ? trunkTop + (height - trunkTop) * 0.25
      : kind === 'palm'
        ? height
        : trunkTop * 1.15;
  switch (detail) {
    case 'icon':
      return frustum(3, radius, radius * 0.8, top, 0, false, false);
    case 'simple':
      return frustum(5, radius, radius * 0.75, top, 0, false, false);
    case 'detailed':
      // The top end is hidden inside the crown: no cap.
      return frustum(6, radius * 1.25, radius * 0.6, top, 0, false, false);
  }
}

function coniferCrown(
  detail: DetailLevel,
  height: number,
  bottom: number,
  radius: number,
  parts: number,
  turn: number,
): MeshData {
  const crownHeight = height - bottom;
  // Far away: a four-sided cone without a floor (seen from above, nobody misses it).
  if (detail === 'icon') return frustum(4, radius, 0, crownHeight, bottom, false, false, turn);
  const tiers = detail === 'simple' ? Math.min(2, parts) : parts;
  const sides = detail === 'simple' ? 6 : 8;
  // Tiers overlap: each starts below where the one under it ends, and is narrower.
  const meshes: MeshData[] = [];
  const step = crownHeight / (tiers + 1);
  for (let i = 0; i < tiers; i++) {
    const tierBottom = bottom + i * step;
    const tierHeight = i === tiers - 1 ? height - tierBottom : step * 2;
    const tierRadius = radius * (1 - (i / tiers) * 0.55);
    // Only the lowest tier's underside can be seen from the camera's angle.
    meshes.push(
      frustum(sides, tierRadius, 0, tierHeight, tierBottom, i === 0, false, turn + i * 0.7),
    );
  }
  return mergeMeshes(meshes);
}

interface Clump {
  readonly angle: number;
  readonly reach: number;
  readonly rise: number;
  readonly size: number;
  readonly wobble: number;
}

function broadleafCrown(
  detail: DetailLevel,
  height: number,
  bottom: number,
  radius: number,
  parts: number,
  clumps: readonly Clump[],
): MeshData {
  const crownHeight = height - bottom;
  const middle = bottom + crownHeight * 0.5;
  // The main clump: the crown's middle. Its stretch makes the crown as tall as the space above the trunk.
  const stretch = crownHeight / 2 / radius;
  const wobbly = (seed: number) => (unit: readonly [number, number, number]) =>
    0.85 + 0.3 * Math.abs(Math.sin(seed + unit[0] * 5.1 + unit[1] * 3.7 + unit[2] * 4.3));
  if (detail === 'icon') return diamond(radius, [0, middle, 0], stretch);
  const count = detail === 'simple' ? 1 : parts;
  const meshes: MeshData[] = [
    blob(radius * 0.8, [0, middle, 0], 0, stretch, wobbly(clumps[0].wobble)),
  ];
  for (let i = 0; i < count; i++) {
    const clump = clumps[i % clumps.length];
    const r = radius * clump.size;
    const reach = (radius - r) * (0.6 + clump.reach);
    meshes.push(
      blob(
        r,
        [
          Math.cos(clump.angle + (i * Math.PI * 2) / count) * reach,
          bottom + r * stretch * 0.9 + (crownHeight - 2 * r * stretch * 0.9) * clump.rise,
          Math.sin(clump.angle + (i * Math.PI * 2) / count) * reach,
        ],
        0,
        stretch,
        wobbly(clump.wobble),
      ),
    );
  }
  return mergeMeshes(meshes);
}

/**
 * A palm's crown: fronds from the top of the trunk, reaching out `radius`
 * and drooping. Each frond is a thin leaf, folded along its middle, with
 * both sides drawn (it is seen from above and below). Icon: 3 fronds,
 * simple: 6, detailed: the spec's number.
 */
function palmCrown(
  detail: DetailLevel,
  height: number,
  radius: number,
  parts: number,
  turn: number,
): MeshData {
  const fronds = detail === 'icon' ? 3 : detail === 'simple' ? 6 : Math.max(6, parts);
  const b = new MeshBuilder();
  const base: [number, number, number] = [0, height, 0];
  for (let i = 0; i < fronds; i++) {
    const angle = turn + (i / fronds) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = -Math.sin(angle);
    const width = radius * 0.22;
    const mid: [number, number, number] = [
      dx * radius * 0.5,
      height + radius * 0.12,
      dz * radius * 0.5,
    ];
    const left: [number, number, number] = [
      mid[0] - dz * width,
      mid[1] - radius * 0.05,
      mid[2] + dx * width,
    ];
    const right: [number, number, number] = [
      mid[0] + dz * width,
      mid[1] - radius * 0.05,
      mid[2] - dx * width,
    ];
    const tip: [number, number, number] = [dx * radius, height - radius * 0.45, dz * radius];
    const uv = (p: readonly number[]): [number, number] => [p[0] + p[2], p[1]];
    for (const [a, c] of [
      [left, mid],
      [mid, right],
    ] as const) {
      b.triangle(base, a, c, uv(base), uv(a), uv(c));
      b.triangle(base, c, a, uv(base), uv(c), uv(a));
      b.triangle(a, tip, c, uv(a), uv(tip), uv(c));
      b.triangle(a, c, tip, uv(a), uv(c), uv(tip));
    }
  }
  return b.build();
}
