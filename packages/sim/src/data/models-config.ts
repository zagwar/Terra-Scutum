import { z } from 'zod';

/**
 * `data/models.json` (F133): the 3D model library and the procedural
 * materials (section 12.6). Every model the game shows is looked up here by
 * its id, so any model can later be replaced by changing one entry:
 *
 * - `{ "source": "generator", "generator": "tree", "spec": { … } }`: made by
 *   code (`packages/game/src/generators`) from the spec and a seed;
 * - `{ "source": "file", "file": "models/steel_mill.glb" }`: a real model
 *   (made by hand, bought, or made with an AI tool), a glTF file in
 *   `packages/game/public/models/`.
 *
 * Everything here is engine-neutral (parts, sizes, colors, seeds), so only
 * the code that turns specs into meshes would change if the engine did
 * (section 14, "Keep the project portable"). The sim never uses this file:
 * the sim worker validates it with the rest of the data and hands it to the game.
 */
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/, 'colors are written as #rrggbb (lowercase)');
const fraction = z.number().min(0).max(1);
const id = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'ids are written in camelCase');

/** A range [lowest, highest]: each model's seed picks a value in it. */
const range = (min: number, max: number) =>
  z
    .tuple([z.number().min(min).max(max), z.number().min(min).max(max)])
    .refine(([low, high]) => low <= high, { message: 'a range is written [lowest, highest]' });

/** The detail levels every generator makes (section 12.6), from the far view to the close one. */
export const DETAIL_LEVELS = ['icon', 'simple', 'detailed'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

/** The surface patterns a procedural material can have (no texture files). */
export const MATERIAL_PATTERNS = ['plain', 'noise', 'bark', 'foliage', 'windows', 'tiles'] as const;
export type MaterialPattern = (typeof MATERIAL_PATTERNS)[number];

/** A procedural material: a color, how shiny it is, and a generated surface pattern. */
const materialSchema = z.strictObject({
  color: hexColor,
  /** 0 = shiny, 1 = completely matt. */
  roughness: fraction,
  /** 0 = not metal, 1 = bare metal (shines in its own color). */
  metallic: fraction,
  pattern: z.strictObject({
    kind: z.enum(MATERIAL_PATTERNS),
    /** How large one repeat of the pattern is on the model, in model units (metres). */
    size: z.number().positive().max(100),
    /** How strongly the pattern shows: 0 = not at all, 1 = fully. */
    strength: fraction,
    /** A second color the pattern uses (window glass, roof tile joints…); the main color if left out. */
    accent: hexColor.optional(),
  }),
});
export type ModelMaterial = z.infer<typeof materialSchema>;

/** The `tree` generator: a trunk and a crown, conifer (stacked cones) or broadleaf (rounded clumps). */
export const treeSpecSchema = z.strictObject({
  kind: z.enum(['conifer', 'broadleaf']),
  trunkMaterial: id,
  crownMaterial: id,
  /** The whole tree's height, in model units (metres). */
  height: range(0.5, 200),
  /** How much of the height is bare trunk below the crown: 0.3 = the lowest 30 %. */
  trunkShare: range(0, 0.9),
  /** The trunk's radius and the crown's widest radius, both as a share of the height. */
  trunkRadius: range(0.005, 0.3),
  crownRadius: range(0.05, 1),
  /** How many cones (conifer) or clumps (broadleaf) the detailed crown has. */
  crownParts: range(1, 8),
  /** How far the tree may lean, in degrees. */
  leanDegrees: z.number().min(0).max(30),
});
export type TreeSpec = z.infer<typeof treeSpecSchema>;

/** The `boxBuilding` generator: a block of floors with a roof; the detailed level adds setbacks and rooftop units. */
export const boxBuildingSpecSchema = z.strictObject({
  wallMaterial: id,
  roofMaterial: id,
  /** Rooftop units (air conditioning, stair houses) and the entrance canopy. */
  detailMaterial: id,
  floors: range(1, 200),
  /** Model units (metres) per floor. */
  floorHeight: z.number().positive().max(10),
  /** The building's footprint, in model units (metres). */
  width: range(1, 500),
  depth: range(1, 500),
  /** The share of buildings with a pitched (gabled) roof instead of a flat one. */
  gabledShare: fraction,
  /** A pitched roof is only given to buildings with at most this many floors. */
  gabledMaxFloors: z.number().int().min(0).max(200),
  /** The detailed level: the share of taller buildings that step back above some floor. */
  setbackShare: fraction,
  /** The detailed level: rooftop units on a flat roof. */
  rooftopUnits: range(0, 12),
});
export type BoxBuildingSpec = z.infer<typeof boxBuildingSpecSchema>;

/**
 * The `treeClump` generator: a clump of trees (one of the tree models of this file) as one
 * model, so a forest is drawn with fewer, fuller copies.
 */
export const treeClumpSpecSchema = z.strictObject({
  /** The tree model (a `tree` generator model in this file) the clump is made of. */
  tree: id,
  /** How many trees a clump has. */
  trees: range(1, 16),
  /** How far the trees stand from the clump's middle, as a share of a tree's height. */
  spread: range(0, 4),
  /** Each tree is up to this much smaller or bigger than the clump's first one (0.2 = ±20 %). */
  sizeVariation: fraction,
});
export type TreeClumpSpec = z.infer<typeof treeClumpSpecSchema>;

/** Each generator's spec schema, by generator name. Add a generator: its schema here, its code in `packages/game/src/generators`. */
export const GENERATOR_SPECS = {
  tree: treeSpecSchema,
  treeClump: treeClumpSpecSchema,
  boxBuilding: boxBuildingSpecSchema,
} as const;
export type GeneratorName = keyof typeof GENERATOR_SPECS;

const generatedModel = z.discriminatedUnion('generator', [
  z.strictObject({
    source: z.literal('generator'),
    generator: z.literal('tree'),
    /** How many differently seeded versions are made; the map mixes them. */
    variants: z.number().int().min(1).max(16),
    spec: treeSpecSchema,
  }),
  z.strictObject({
    source: z.literal('generator'),
    generator: z.literal('treeClump'),
    variants: z.number().int().min(1).max(16),
    spec: treeClumpSpecSchema,
  }),
  z.strictObject({
    source: z.literal('generator'),
    generator: z.literal('boxBuilding'),
    variants: z.number().int().min(1).max(16),
    spec: boxBuildingSpecSchema,
  }),
]);

const fileModel = z.strictObject({
  source: z.literal('file'),
  /** A glTF model (.glb or .gltf) under `packages/game/public/`, used for every detail level. */
  file: z
    .string()
    .regex(/^models\/[a-z0-9_\-/]+\.(glb|gltf)$/, 'a model file is models/<name>.glb or .gltf'),
  /** Model units per unit of the file (1 if the file is in metres). */
  scale: z.number().positive(),
});

const modelEntry = z.union([generatedModel, fileModel]);
export type ModelEntry = z.infer<typeof modelEntry>;
export type GeneratedModelEntry = z.infer<typeof generatedModel>;
export type FileModelEntry = z.infer<typeof fileModel>;

export const modelsSchema = z.strictObject({
  materials: z.record(id, materialSchema),
  models: z.record(id, modelEntry),
});
export type ModelsConfig = z.infer<typeof modelsSchema>;

/**
 * The materials a model's spec uses (none for a model from a file). A tree clump uses its
 * tree model's materials (looked up in `models`; none if that model is missing or not a tree).
 */
export function materialsOfModel(
  entry: ModelEntry,
  models: Readonly<Record<string, ModelEntry>>,
): string[] {
  if (entry.source === 'file') return [];
  switch (entry.generator) {
    case 'tree':
      return [entry.spec.trunkMaterial, entry.spec.crownMaterial];
    case 'treeClump': {
      const tree = treeOfClump(entry.spec, models);
      return tree ? [tree.trunkMaterial, tree.crownMaterial] : [];
    }
    case 'boxBuilding':
      return [entry.spec.wallMaterial, entry.spec.roofMaterial, entry.spec.detailMaterial];
  }
}

/** The tree spec a clump is made of, or null if its `tree` is not a `tree` generator model. */
export function treeOfClump(
  spec: TreeClumpSpec,
  models: Readonly<Record<string, ModelEntry>>,
): TreeSpec | null {
  const tree = Object.hasOwn(models, spec.tree) ? models[spec.tree] : undefined;
  return tree?.source === 'generator' && tree.generator === 'tree' ? tree.spec : null;
}

/** The translation key of a model's name (the gallery shows it). */
export function modelNameKey(modelId: string): string {
  return `MODEL_${modelId.toUpperCase()}`;
}
