import {
  type DetailLevel,
  type GeneratedModelEntry,
  type ModelEntry,
  treeOfClump,
} from '@terra-scutum/sim';
import { generateBoxBuilding } from './box-building-generator';
import type { GeneratedModel } from './model-types';
import { hashText, mixSeed } from './seeded-random';
import { generateTreeClump } from './tree-clump-generator';
import { generateTree } from './tree-generator';

/**
 * The generator framework (F133, section 12.6): a model's entry in
 * `data/models.json` plus a seed → a mesh per material, for one detail level.
 * Pure code (no Babylon), so it runs in Node for tests and could run in a
 * tool that saves models as files.
 *
 * Add a generator: its spec schema in `packages/sim/src/data/models-config.ts`
 * (`GENERATOR_SPECS` and the `generatedModel` union), its code in this folder,
 * and a case here.
 */
export function generateModel(
  entry: GeneratedModelEntry,
  seed: number,
  detail: DetailLevel,
  models: Readonly<Record<string, ModelEntry>>,
): GeneratedModel {
  switch (entry.generator) {
    case 'tree':
      return generateTree(entry.spec, seed, detail);
    case 'treeClump': {
      // `models`: the other models of the library (a clump is made of one of its tree models).
      const tree = treeOfClump(entry.spec, models);
      if (!tree) throw new Error(`models.json: "${entry.spec.tree}" is not a tree model`);
      return generateTreeClump(entry.spec, tree, seed, detail);
    }
    case 'boxBuilding':
      return generateBoxBuilding(entry.spec, seed, detail);
  }
}

/** The seed of a model's variant: the same for a model id and variant number every time. */
export function variantSeed(modelId: string, variant: number): number {
  return mixSeed(hashText(modelId), variant);
}

/** The number of triangles of a generated model. */
export function triangleCount(model: GeneratedModel): number {
  return model.parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0);
}
