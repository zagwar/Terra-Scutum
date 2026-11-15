import {
  DETAIL_LEVELS,
  type GeneratedModelEntry,
  type ModelEntry,
  materialsOfModel,
} from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { loadGameDataFromDisk } from '../../tools/src/load-data';
import { generateModel, triangleCount, variantSeed } from '../src/generators/generators';
import { PATTERN_PIXELS, materialPixels } from '../src/generators/material-patterns';
import { type MeshData, blob, box, frustum, gabledRoof } from '../src/generators/mesh-data';
import { mixSeed, seededRandom } from '../src/generators/seeded-random';

const data = loadGameDataFromDisk();
const models = data.models.models;
const generated = Object.entries(data.models.models).filter(
  (entry): entry is [string, GeneratedModelEntry] => entry[1].source === 'generator',
);

/** Every corner number is in range, normals have length 1, and every face points away from `center`. */
function expectClosedOutward(mesh: MeshData, center: readonly [number, number, number]) {
  const corners = mesh.positions.length / 3;
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.uvs.length).toBe(corners * 2);
  expect(mesh.indices.length % 3).toBe(0);
  for (const index of mesh.indices) expect(index).toBeLessThan(corners);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const middle = [0, 1, 2].map(
      (axis) =>
        (mesh.positions[a * 3 + axis] +
          mesh.positions[b * 3 + axis] +
          mesh.positions[c * 3 + axis]) /
          3 -
        center[axis],
    );
    const normal = [0, 1, 2].map((axis) => mesh.normals[a * 3 + axis]);
    expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
    expect(normal[0] * middle[0] + normal[1] * middle[1] + normal[2] * middle[2]).toBeGreaterThan(
      0,
    );
  }
}

describe('mesh building blocks (F133)', () => {
  it('makes boxes, cones, balls and roofs whose faces point outwards', () => {
    expectClosedOutward(box(4, 2, 6, 0, true), [0, 1, 0]);
    expect(box(4, 2, 6).indices.length / 3).toBe(10); // five faces, no floor
    expect(box(4, 2, 6, 0, false, false).indices.length / 3).toBe(8); // the walls only
    expectClosedOutward(frustum(6, 2, 0, 5, 1), [0, 2, 0]);
    expectClosedOutward(frustum(8, 2, 1, 5, 0), [0, 2.5, 0]);
    expect(frustum(5, 2, 0, 3, 0, false, false).indices.length / 3).toBe(5);
    expectClosedOutward(blob(3, [1, 5, 2], 0), [1, 5, 2]);
    expect(blob(3, [0, 0, 0], 1).indices.length / 3).toBe(80);
    expectClosedOutward(gabledRoof(6, 4, 2, 10), [0, 10.5, 0]);
  });

  it('lays texture coordinates in model units (metres)', () => {
    const wall = box(10, 6, 4);
    const us = Array.from(wall.uvs.filter((_, i) => i % 2 === 0));
    const vs = Array.from(wall.uvs.filter((_, i) => i % 2 === 1));
    expect(Math.max(...us)).toBeCloseTo(10, 5);
    expect(Math.max(...vs)).toBeCloseTo(6, 5);
  });
});

describe('the generators (F133)', () => {
  it('make every model in the data, at every detail level, standing on the ground', () => {
    expect(generated.map(([id]) => id).sort()).toEqual([
      'boxBuilding',
      'bugInterceptor',
      'bugWarrior',
      'factoryHall',
      'treeAcacia',
      'treeBroadleaf',
      'treeClumpAcacia',
      'treeClumpBroadleaf',
      'treeClumpConifer',
      'treeClumpJungle',
      'treeClumpPalm',
      'treeConifer',
      'treeJungle',
      'treePalm',
      'unitTank',
    ]);
    for (const [id, entry] of generated) {
      for (let variant = 0; variant < entry.variants; variant++) {
        for (const detail of DETAIL_LEVELS) {
          const model = generateModel(entry, variantSeed(id, variant), detail, models);
          expect(model.detail).toBe(detail);
          expect(model.parts.length).toBeGreaterThan(0);
          // Only the materials the spec names.
          for (const part of model.parts)
            expect(materialsOfModel(entry, models)).toContain(part.material);
          let lowest = Infinity;
          for (const part of model.parts)
            for (let i = 1; i < part.mesh.positions.length; i += 3)
              lowest = Math.min(lowest, part.mesh.positions[i]);
          expect(lowest).toBeGreaterThanOrEqual(-0.5);
          expect(lowest).toBeLessThan(0.5);
          expect(model.height).toBeGreaterThan(1);
          expect(model.radius).toBeGreaterThan(0.1);
        }
      }
    }
  });

  it('give each detail level more faces than the one before, and keep the size across levels', () => {
    for (const [id, entry] of generated) {
      const [icon, simple, detailed] = DETAIL_LEVELS.map((detail) =>
        generateModel(entry, variantSeed(id, 0), detail, models),
      );
      expect(triangleCount(icon)).toBeLessThan(triangleCount(simple));
      expect(triangleCount(simple)).toBeLessThan(triangleCount(detailed));
      // Switching levels as the view zooms must not make the model jump in size.
      expect(simple.height / icon.height).toBeGreaterThan(0.85);
      expect(detailed.height / icon.height).toBeLessThan(1.2);
      // Budgets for drawing thousands of copies [DEFAULT]: small far away, modest up close
      // (a clump of trees counts as one copy).
      const clump = entry.generator === 'treeClump';
      expect(triangleCount(icon)).toBeLessThanOrEqual(clump ? 160 : 30);
      expect(triangleCount(detailed)).toBeLessThanOrEqual(clump ? 600 : 150);
    }
  });

  it('make the same model from the same seed, and different ones from different seeds', () => {
    for (const [id, entry] of generated) {
      const a = generateModel(entry, variantSeed(id, 1), 'detailed', models);
      const b = generateModel(entry, variantSeed(id, 1), 'detailed', models);
      expect(a.parts.map((p) => Array.from(p.mesh.positions))).toEqual(
        b.parts.map((p) => Array.from(p.mesh.positions)),
      );
      const heights = Array.from(
        { length: 6 },
        (_, v) => generateModel(entry, variantSeed(id, v), 'simple', models).height,
      );
      expect(new Set(heights.map((h) => h.toFixed(3))).size).toBeGreaterThan(1);
    }
  });

  it('keep sizes within the ranges of the spec', () => {
    const [, conifer] = generated.find(([id]) => id === 'treeConifer')!;
    for (let seed = 0; seed < 50; seed++) {
      const tree = generateModel(conifer, seed, 'simple', models);
      if (conifer.generator !== 'tree') throw new Error('not a tree');
      expect(tree.height).toBeGreaterThanOrEqual(conifer.spec.height[0] - 0.01);
      expect(tree.height).toBeLessThanOrEqual(conifer.spec.height[1] + 0.01);
    }
    const [, building] = generated.find(([id]) => id === 'boxBuilding')!;
    if (building.generator !== 'boxBuilding') throw new Error('not a building');
    for (let seed = 0; seed < 50; seed++) {
      const made = generateModel(building, seed, 'icon', models);
      const floors = made.height / building.spec.floorHeight;
      expect(floors).toBeGreaterThanOrEqual(building.spec.floors[0] - 0.01);
      // A pitched roof may add up to half a floor's worth above the top floor.
      expect(floors).toBeLessThanOrEqual(building.spec.floors[1] + 3);
    }
  });

  it('make tree clumps from a tree model, with their trees in the same spots at every level', () => {
    const [, clump] = generated.find(([id]) => id === 'treeClumpConifer')!;
    if (clump.generator !== 'treeClump') throw new Error('not a clump');
    const tree = models[clump.spec.tree];
    if (tree.source !== 'generator' || tree.generator !== 'tree') throw new Error('not a tree');
    for (let seed = 0; seed < 20; seed++) {
      const [icon, simple, detailed] = DETAIL_LEVELS.map((detail) =>
        generateModel(clump, seed, detail, models),
      );
      // Several trees: wider than one tree, and about as tall.
      expect(icon.radius).toBeGreaterThan(tree.spec.height[1] * tree.spec.crownRadius[0]);
      expect(icon.height).toBeLessThan(tree.spec.height[1] * (1 + clump.spec.sizeVariation) + 0.5);
      // The same trees in the same spots (the icon keeps the middle half of them).
      expect(Math.abs(detailed.radius - simple.radius)).toBeLessThan(simple.radius * 0.35);
      expect(icon.radius).toBeLessThanOrEqual(detailed.radius * 1.2);
      expect(icon.parts.map((part) => part.material).sort()).toEqual(
        [tree.spec.crownMaterial, tree.spec.trunkMaterial].sort(),
      );
    }
    // A clump whose tree is not a tree model can't be made (the data check reports it too).
    expect(() =>
      generateModel({ ...clump, spec: { ...clump.spec, tree: 'boxBuilding' } }, 1, 'icon', models),
    ).toThrow(/not a tree model/);
  });

  it('work from any spec in the data, so a new model needs no new code', () => {
    const entry: ModelEntry = {
      source: 'generator',
      generator: 'boxBuilding',
      variants: 1,
      spec: {
        wallMaterial: 'concreteWall',
        roofMaterial: 'roofing',
        detailMaterial: 'rooftopMetal',
        floors: [1, 1],
        floorHeight: 4,
        width: [30, 30],
        depth: [20, 20],
        gabledShare: 1,
        gabledMaxFloors: 2,
        setbackShare: 0,
        rooftopUnits: [0, 0],
      },
    };
    const shed = generateModel(entry, 7, 'simple', models);
    expect(shed.radius).toBeCloseTo(15, 1);
    // One floor and a pitched roof.
    expect(shed.height).toBeGreaterThan(4);
    expect(shed.parts.map((part) => part.material)).toEqual(['concreteWall', 'roofing']);
  });
});

describe('procedural materials (F133)', () => {
  it('draw every material of the data as a repeating picture, the same every time', () => {
    for (const [id, material] of Object.entries(data.models.materials)) {
      const pixels = materialPixels(material, id);
      expect(pixels.length).toBe(PATTERN_PIXELS * PATTERN_PIXELS * 4);
      expect(Array.from(materialPixels(material, id))).toEqual(Array.from(pixels));
      // Opaque, and on average close to the material's color.
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        expect(pixels[i + 3]).toBe(255);
        red += pixels[i];
      }
      const average = red / (pixels.length / 4) / 255;
      const expected = Number.parseInt(material.color.slice(1, 3), 16) / 255;
      expect(Math.abs(average - expected)).toBeLessThan(0.15);
    }
  });

  it('show windows on walls and the plain color when there is no pattern', () => {
    const wall = data.models.materials.concreteWall;
    const pixels = materialPixels(wall, 'concreteWall');
    const at = (x: number, y: number) => pixels[(y * PATTERN_PIXELS + x) * 4];
    // The middle of the picture is window glass (darker), its bottom edge is wall.
    expect(at(32, 36)).toBeLessThan(at(32, 4));
    const plain = materialPixels(
      { ...wall, pattern: { kind: 'plain', size: 1, strength: 1 } },
      'x',
    );
    expect(new Set(Array.from(plain.filter((_, i) => i % 4 === 0))).size).toBe(1);
  });
});

describe('seeded numbers (F133)', () => {
  it('repeat for a seed and stay in their ranges', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const value = a.next();
      expect(value).toBe(b.next());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const r = seededRandom(1);
    for (let i = 0; i < 100; i++) {
      const n = r.intInRange([2, 5]);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
  });
});
