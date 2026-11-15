/**
 * Engine-neutral meshes (F133): what every generator produces. Plain typed
 * arrays (positions, normals, texture coordinates, triangles), so the
 * generators know nothing about Babylon and can be tested in Node. The
 * renderer turns them into its own meshes (`render/models/`).
 *
 * Coordinates are model units (metres): y is up, the model stands on y = 0.
 * Faces are flat-shaded (each triangle has its own corners), the low-poly
 * look of the placeholder models. Texture coordinates are in model units
 * too, so a material's pattern has the same size on every part.
 */
export interface MeshData {
  /** x, y, z per corner. */
  readonly positions: Float32Array;
  /** The face's direction per corner (length 1). */
  readonly normals: Float32Array;
  /** u, v per corner, in model units. */
  readonly uvs: Float32Array;
  /** Three corner numbers per triangle, counter-clockwise seen from outside. */
  readonly indices: Uint32Array;
}

export type Vec3 = readonly [number, number, number];

/** Collects triangles; `build()` makes the typed arrays. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  /** A flat triangle (a, b, c counter-clockwise seen from outside) with texture coordinates. */
  triangle(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    uvA: readonly [number, number],
    uvB: readonly [number, number],
    uvC: readonly [number, number],
  ): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return; // a degenerate triangle draws nothing
    nx /= length;
    ny /= length;
    nz /= length;
    const base = this.positions.length / 3;
    for (const [point, uv] of [
      [a, uvA],
      [b, uvB],
      [c, uvC],
    ] as const) {
      this.positions.push(point[0], point[1], point[2]);
      this.normals.push(nx, ny, nz);
      this.uvs.push(uv[0], uv[1]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  /**
   * A flat four-cornered face (a → b → c → d counter-clockwise seen from
   * outside), its texture laid along a → b (u) and a → d (v).
   */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
    const width = distance(a, b);
    const height = distance(a, d);
    this.triangle(a, b, c, [0, 0], [width, 0], [width, height]);
    this.triangle(a, c, d, [0, 0], [width, height], [0, height]);
  }

  /** Adds another mesh, moved and turned (`transform` maps a point; normals follow the turn). */
  append(mesh: MeshData, transform: Transform = IDENTITY): void {
    const base = this.positions.length / 3;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = transform.point([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
      const n = transform.direction([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]);
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
    }
    for (const uv of mesh.uvs) this.uvs.push(uv);
    for (const index of mesh.indices) this.indices.push(base + index);
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  build(): MeshData {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      indices: Uint32Array.from(this.indices),
    };
  }
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Moves and turns points: a turn about y (heading), then a tilt about x and z (lean), then a shift. */
export interface Transform {
  point(p: Vec3): Vec3;
  direction(d: Vec3): Vec3;
}

export const IDENTITY: Transform = { point: (p) => p, direction: (d) => d };

/**
 * A turn of `yaw` radians about the vertical, then a lean (`leanX` about the
 * x axis, `leanZ` about the z axis), then a shift by `offset`.
 */
export function makeTransform(offset: Vec3, yaw = 0, leanX = 0, leanZ = 0): Transform {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(leanX);
  const sx = Math.sin(leanX);
  const cz = Math.cos(leanZ);
  const sz = Math.sin(leanZ);
  const rotate = (v: Vec3): Vec3 => {
    // yaw about y
    let x = v[0] * cy + v[2] * sy;
    let y = v[1];
    let z = -v[0] * sy + v[2] * cy;
    // lean about x
    const y1 = y * cx - z * sx;
    z = y * sx + z * cx;
    y = y1;
    // lean about z
    const x2 = x * cz - y * sz;
    y = x * sz + y * cz;
    x = x2;
    return [x, y, z];
  };
  return {
    point: (p) => {
      const r = rotate(p);
      return [r[0] + offset[0], r[1] + offset[1], r[2] + offset[2]];
    },
    direction: rotate,
  };
}

/**
 * A box standing on y = `bottom`, centered on x = z = 0. `withTop` (on by
 * default) adds the top face, `withBottom` the floor face.
 */
export function box(
  width: number,
  height: number,
  depth: number,
  bottom = 0,
  withBottom = false,
  withTop = true,
): MeshData {
  const b = new MeshBuilder();
  const x = width / 2;
  const z = depth / 2;
  const y0 = bottom;
  const y1 = bottom + height;
  // Sides (seen from outside, counter-clockwise; texture v runs up the wall).
  b.quad([-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z]); // north (+z)
  b.quad([x, y0, -z], [-x, y0, -z], [-x, y1, -z], [x, y1, -z]); // south
  b.quad([x, y0, z], [x, y0, -z], [x, y1, -z], [x, y1, z]); // east
  b.quad([-x, y0, -z], [-x, y0, z], [-x, y1, z], [-x, y1, -z]); // west
  if (withTop) b.quad([-x, y1, z], [x, y1, z], [x, y1, -z], [-x, y1, -z]);
  if (withBottom) b.quad([-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]);
  return b.build();
}

/**
 * A frustum (a cut cone) around the y axis with `sides` faces: radius
 * `bottomRadius` at y = `bottom`, `topRadius` at y = `bottom + height`.
 * A top radius of 0 makes a cone (pointed); `capTop`/`capBottom` close the ends.
 */
export function frustum(
  sides: number,
  bottomRadius: number,
  topRadius: number,
  height: number,
  bottom = 0,
  capBottom = true,
  capTop = true,
  turn = 0,
): MeshData {
  const b = new MeshBuilder();
  const y0 = bottom;
  const y1 = bottom + height;
  const ring = (radius: number, y: number): Vec3[] =>
    Array.from({ length: sides }, (_, i) => {
      const angle = turn + (i / sides) * Math.PI * 2;
      return [Math.cos(angle) * radius, y, -Math.sin(angle) * radius] as Vec3;
    });
  const lower = ring(bottomRadius, y0);
  const upper = ring(topRadius, y1);
  const slant = Math.hypot(height, bottomRadius - topRadius);
  const edge = (2 * Math.PI * bottomRadius) / sides;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const u0 = i * edge;
    if (topRadius === 0) {
      b.triangle(lower[i], lower[j], [0, y1, 0], [u0, 0], [u0 + edge, 0], [u0 + edge / 2, slant]);
    } else {
      b.triangle(lower[i], lower[j], upper[j], [u0, 0], [u0 + edge, 0], [u0 + edge, slant]);
      b.triangle(lower[i], upper[j], upper[i], [u0, 0], [u0 + edge, slant], [u0, slant]);
    }
  }
  const cap = (points: Vec3[], up: boolean) => {
    const center: Vec3 = [0, points[0][1], 0];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = points[i];
      const c = points[j];
      if (up) b.triangle(center, a, c, [0, 0], [a[0], a[2]], [c[0], c[2]]);
      else b.triangle(center, c, a, [0, 0], [c[0], c[2]], [a[0], a[2]]);
    }
  };
  if (capBottom && bottomRadius > 0) cap(lower, false);
  if (capTop && topRadius > 0) cap(upper, true);
  return b.build();
}

/**
 * A rough ball: an icosahedron (20 faces), split `subdivisions` times (each
 * split makes four faces of one), with radius `radius` (stretched by
 * `stretch` up and down), centered at `center`. `wobble(point)` may push each
 * corner in or out a little, so clumps look less perfect.
 */
export function blob(
  radius: number,
  center: Vec3,
  subdivisions: number,
  stretch = 1,
  wobble: (unit: Vec3) => number = () => 1,
): MeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  let corners: Vec3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map(normalize);
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < subdivisions; s++) {
    const middles = new Map<string, number>();
    const middle = (a: number, c: number): number => {
      const key = a < c ? `${a}_${c}` : `${c}_${a}`;
      let index = middles.get(key);
      if (index === undefined) {
        const p = corners[a];
        const q = corners[c];
        index = corners.length;
        corners = [...corners, normalize([p[0] + q[0], p[1] + q[1], p[2] + q[2]])];
        middles.set(key, index);
      }
      return index;
    };
    const next: [number, number, number][] = [];
    for (const [a, b2, c] of faces) {
      const ab = middle(a, b2);
      const bc = middle(b2, c);
      const ca = middle(c, a);
      next.push([a, ab, ca], [b2, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const placed = corners.map((unit): Vec3 => {
    const r = radius * wobble(unit);
    return [center[0] + unit[0] * r, center[1] + unit[1] * r * stretch, center[2] + unit[2] * r];
  });
  const b = new MeshBuilder();
  // The faces are listed counter-clockwise seen from outside.
  for (const [a, b2, c] of faces) {
    const uv = (p: Vec3): [number, number] => [p[0] + p[2], p[1]];
    b.triangle(placed[a], placed[b2], placed[c], uv(placed[a]), uv(placed[b2]), uv(placed[c]));
  }
  return b.build();
}

function normalize(v: readonly number[]): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * A diamond (an octahedron, 8 faces): the cheapest rounded crown, for far away.
 * `radius` sideways, `radius × stretch` up and down, centered at `center`.
 */
export function diamond(radius: number, center: Vec3, stretch = 1, turn = 0): MeshData {
  const b = new MeshBuilder();
  const [cx, cy, cz] = center;
  const top: Vec3 = [cx, cy + radius * stretch, cz];
  const bottom: Vec3 = [cx, cy - radius * stretch, cz];
  const ring: Vec3[] = [0, 1, 2, 3].map((i) => {
    const angle = turn + (i * Math.PI) / 2;
    return [cx + Math.cos(angle) * radius, cy, cz - Math.sin(angle) * radius];
  });
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % 4];
    const uv = (p: Vec3): [number, number] => [p[0] + p[2], p[1]];
    b.triangle(a, c, top, uv(a), uv(c), uv(top));
    b.triangle(c, a, bottom, uv(c), uv(a), uv(bottom));
  }
  return b.build();
}

/** A pitched roof over a `width` × `depth` rectangle: the ridge runs along x, `height` above `bottom`. */
export function gabledRoof(width: number, depth: number, height: number, bottom: number): MeshData {
  const b = new MeshBuilder();
  const x = width / 2;
  const z = depth / 2;
  const y0 = bottom;
  const y1 = bottom + height;
  b.quad([x, y0, -z], [-x, y0, -z], [-x, y1, 0], [x, y1, 0]); // south slope
  b.quad([-x, y0, z], [x, y0, z], [x, y1, 0], [-x, y1, 0]); // north slope
  b.triangle([x, y0, z], [x, y0, -z], [x, y1, 0], [0, 0], [depth, 0], [z, height]); // east gable
  b.triangle([-x, y0, -z], [-x, y0, z], [-x, y1, 0], [0, 0], [depth, 0], [z, height]); // west gable
  return b.build();
}

/** Puts several meshes into one. */
export function mergeMeshes(meshes: readonly MeshData[]): MeshData {
  const b = new MeshBuilder();
  for (const mesh of meshes) b.append(mesh);
  return b.build();
}

/** The smallest box around a mesh: [minX, minY, minZ, maxX, maxY, maxZ]. */
export function boundsOf(
  meshes: readonly MeshData[],
): [number, number, number, number, number, number] {
  const bounds: [number, number, number, number, number, number] = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  for (const mesh of meshes)
    for (let i = 0; i < mesh.positions.length; i += 3)
      for (let axis = 0; axis < 3; axis++) {
        bounds[axis] = Math.min(bounds[axis], mesh.positions[i + axis]);
        bounds[axis + 3] = Math.max(bounds[axis + 3], mesh.positions[i + axis]);
      }
  return bounds;
}
