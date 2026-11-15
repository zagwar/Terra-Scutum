import type { DetailLevel } from '@terra-scutum/sim';
import type { MeshData } from './mesh-data';

/** One part of a generated model: a mesh drawn with one material (an id from `data/models.json`). */
export interface ModelPart {
  readonly material: string;
  readonly mesh: MeshData;
}

/**
 * What a generator makes for one detail level: the parts, grouped by
 * material (one draw call each when drawn with thin instances), and the
 * model's size (it stands on y = 0, centered on x = z = 0).
 */
export interface GeneratedModel {
  readonly detail: DetailLevel;
  readonly parts: readonly ModelPart[];
  /** The model's height, in model units (metres). */
  readonly height: number;
  /** How far the model reaches from its center sideways, in model units. */
  readonly radius: number;
}
