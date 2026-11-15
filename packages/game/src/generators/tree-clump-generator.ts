import type { DetailLevel, TreeClumpSpec, TreeSpec } from '@terra-scutum/sim';
import { MeshBuilder, boundsOf, makeTransform } from './mesh-data';
import type { GeneratedModel } from './model-types';
import { mixSeed, seededRandom } from './seeded-random';
import { generateTree } from './tree-generator';

/**
 * The `treeClump` generator (F133, placeholder [DEFAULT]): a clump of trees
 * as one model, so forests are drawn with fewer, fuller copies (like the
 * forests of strategy maps). Each tree is the clump's tree model (`spec.tree`)
 * with its own seed, one detail level simpler than the clump (icon: half the
 * trees at their icon level; simple: all at their icon level; detailed: all
 * at their simple level), turned, a little bigger or
 * smaller, and placed around the middle so the trees don't stand inside one
 * another. The parts are merged by material (one draw call each).
 */
export function generateTreeClump(
  spec: TreeClumpSpec,
  tree: TreeSpec,
  seed: number,
  detail: DetailLevel,
): GeneratedModel {
  const random = seededRandom(seed);
  const count = random.intInRange(spec.trees);
  const spread = random.inRange(spec.spread);
  // The first tree decides the clump's scale; the spread is measured in its heights. The layout
  // always uses its simple level, so every detail level of a clump has its trees in the same spots.
  const layout = generateTree(tree, mixSeed(seed, 0), 'simple');
  const reach = layout.height * spread;
  const spots: [number, number][] = [[0, 0]];
  // Trees at least about a crown apart: try a few spots for each, keep the first that fits.
  const apart = layout.radius * 1.3;
  for (let i = 1; i < count; i++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = random.between(0, Math.PI * 2);
      const distance = reach * Math.sqrt(random.next());
      const spot: [number, number] = [Math.cos(angle) * distance, Math.sin(angle) * distance];
      if (spots.every(([x, z]) => Math.hypot(x - spot[0], z - spot[1]) >= apart)) {
        spots.push(spot);
        break;
      }
    }
  }
  // In a clump each tree is small on screen: its trees are one level simpler than the clump
  // (the icon level keeps only the first half of the trees, the middle ones).
  const treeDetail: DetailLevel = detail === 'detailed' ? 'simple' : 'icon';
  const shown = detail === 'icon' ? spots.slice(0, Math.ceil(spots.length / 2)) : spots;
  const builders = new Map<string, MeshBuilder>();
  shown.forEach(([x, z], index) => {
    const model = generateTree(tree, mixSeed(seed, index), treeDetail);
    const scale = index === 0 ? 1 : 1 + random.between(-1, 1) * spec.sizeVariation;
    const turn = makeTransform([x, 0, z], random.between(0, Math.PI * 2));
    for (const part of model.parts) {
      let builder = builders.get(part.material);
      if (!builder) {
        builder = new MeshBuilder();
        builders.set(part.material, builder);
      }
      builder.append(part.mesh, {
        point: (p) => turn.point([p[0] * scale, p[1] * scale, p[2] * scale]),
        direction: (d) => turn.direction(d),
      });
    }
  });
  const parts = [...builders].map(([material, builder]) => ({ material, mesh: builder.build() }));
  const bounds = boundsOf(parts.map((part) => part.mesh));
  return {
    detail,
    parts,
    height: bounds[4],
    radius: Math.max(-bounds[0], bounds[3], -bounds[2], bounds[5]),
  };
}
